import { createElement, type ReactNode } from "react";

import {
    EditorModel,
    type EditorStateBase,
} from "../base/EditorModel";
import { GitIcon } from "../../theme/icons";
import { GitTreeModel, GitChangesModel } from "../../components/git-tree";
import type { IPageHost } from "../../api/pages/IPageHost";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { fpJoin } from "../../core/utils/file-path";
import type { GitFileChange } from "../../../ipc/git-ipc";

export interface GitTreeEditorState extends EditorStateBase {
    /** State-type discriminator. */
    type: "gitTreePage";
    /** Absolute repo top-level (the parent of the `.git` folder). */
    repoRoot: string;
}

export const getDefaultGitTreeEditorState = (): GitTreeEditorState => ({
    // Editor instance id — keys this editor in `page.editors[]` and is the
    // cache-file prefix. MUST be non-empty (PageModel.mainEditorInstance treats
    // a falsy id as "no main editor"). Per-instance UUID, like MCP Inspector.
    id: crypto.randomUUID(),
    title: "Git Tree",
    modified: false,
    type: "gitTreePage",
    editor: "git-tree",
    repoRoot: "",
});

/**
 * Git Tree editor (EPIC-030 / US-612; EPIC-031 / US-616).
 *
 * A standalone (no content-host) editor that renders a repository's commit
 * history via the reusable `<GitTree>` component (US-611). Reached only by
 * navigating a repo's `.git` Explorer node to the `git-tree` target — never
 * auto-matched to a file (`accepts: () => -1`).
 *
 * Composes **focused submodels**, one per concern — the same pattern as
 * `BrowserEditor` (webview / urlBar / bookmarksUI / target). As Git
 * functionality grows (EPIC-031), each new concern becomes its own submodel
 * rather than bloating this class:
 *   - `gitTree`  — commit history (the editor body).
 *   - `changes`  — staged/unstaged status (the "Changes" secondary panel).
 */
export class GitTreeEditorModel extends EditorModel<GitTreeEditorState> {
    /** Editor identity. Matches `EditorDescriptor.editorId`. */
    readonly editorId = "git-tree";

    noLanguage = true;
    skipSave = true;

    /** Submodel: commit history. The body renders `<GitTree model={this.gitTree}>`. */
    readonly gitTree = new GitTreeModel();

    /** Submodel: working-tree status for the "Changes" secondary panel (US-616). */
    readonly changes = new GitChangesModel();

    /** Tab icon — the git glyph (EPIC-030 / US-612). */
    getIcon = (): ReactNode => createElement(GitIcon, { width: 16, height: 16 });

    /** Register the "Changes" sidebar panel when attached to a page (Pattern B —
     *  the main editor is also its own secondary view; secondary-views.md §2). */
    setPage(page: IPageHost | null): void {
        super.setPage(page);
        if (page && !this.secondaryView?.length) {
            this.secondaryView = ["git-changes"];
        }
    }

    /** Only-manual-close (US-616): the Changes panel must survive navigation —
     *  e.g. clicking a changed file opens its diff as the main editor while this
     *  editor stays in `secondaryViews[]`. The base default would clear the panel,
     *  so override to a no-op. The sole removal path is the panel's "x" (US-617). */
    beforeNavigateAway(): void {
        // Intentionally empty — survive unconditionally.
    }

    /** Session-restore hook. The restore path rebuilds this editor via
     *  `createEditor` + `Object.assign(state)` (so `repoRoot` is already in
     *  state) and then calls `restore()`. The base is a no-op, which left the
     *  `gitTree` / `changes` submodels unconfigured — empty panels + dead
     *  refresh (each submodel's `repoRoot` was never set). Sync them here so a
     *  restored Git Tree page loads its history and changes (EPIC-031 / US-616). */
    async restore(): Promise<void> {
        await super.restore();
        this.syncGitTree();
    }

    /** Seed repoRoot + title from a decoded `git-tree://` link, then load. */
    initFromRepoRoot(repoRoot: string): void {
        const folder = repoRoot.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "Git";
        this.state.update((s) => {
            s.repoRoot = repoRoot;
            s.title = `${folder} — Git`;
        });
        this.syncGitTree();
    }

    /** Point both submodels at the current repoRoot and load. Called on fresh
     *  open (`initFromRepoRoot`) and on session restore (from the module factory). */
    syncGitTree(): void {
        const repoRoot = this.state.get().repoRoot;
        this.gitTree.configure(repoRoot);
        void this.gitTree.reload();
        this.changes.configure(repoRoot);
        void this.changes.reload();
    }

    /** Unified manual refresh (US-616): reload history + staged/unstaged lists.
     *  Bound to both the Git Tree toolbar Refresh and the Changes panel header
     *  Refresh, so one method serves both buttons. */
    refresh = (): void => {
        // Configure first so refresh is self-healing — if a submodel was never
        // pointed at the repo (e.g. an unsynced restore), this sets its root.
        // `configure` is a no-op when the root is unchanged, so a normal refresh
        // just re-fetches without wiping the lists.
        const repoRoot = this.state.get().repoRoot;
        this.gitTree.configure(repoRoot);
        this.changes.configure(repoRoot);
        void this.gitTree.reload();
        void this.changes.reload();
    };

    /** Open a changed file's Git Diff in this page (US-616, Concern 1). Navigates
     *  the current page to the file with the `file-diff` editor as target; this
     *  editor survives as the secondary "Changes" panel (see `beforeNavigateAway`). */
    openChangeDiff(change: GitFileChange): void {
        const repoRoot = this.state.get().repoRoot;
        if (!repoRoot || !this.page) return;
        // Known deferred edge (US-616 Concern 1): a deleted file has no
        // working-tree content, so opening it as a host may fail to read; the
        // diff itself is still valid (HEAD vs empty). Left ungated for now —
        // the common M/A/?/staged cases work; revisit if it proves problematic.
        const absPath = fpJoin(repoRoot, change.path);
        void app.events.openRawLink.sendAsync(
            createLinkData(absPath, {
                target: "file-diff",
                pageId: this.page.id,
                sourceId: this.id,
            }),
        );
    }

    async dispose(): Promise<void> {
        this.gitTree.dispose();
        this.changes.dispose();
        await super.dispose();
    }
}
