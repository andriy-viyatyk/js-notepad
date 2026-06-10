import { createElement, type ReactNode } from "react";

import {
    EditorModel,
    type EditorStateBase,
} from "../base/EditorModel";
import { GitIcon } from "../../theme/icons";
import { GitTreeModel, GitChangesModel, type GitColumnLayout } from "../../components/git-tree";
import type { IPageHost } from "../../api/pages/IPageHost";
import { app } from "../../api/app";
import { settings } from "../../api/settings";
import { createLinkData } from "../../../shared/link-data";
import { fpJoin } from "../../core/utils/file-path";
import { DirectoryWatcher } from "../../core/utils/file-watcher";
import { decodeGitTreeLink, encodeGitTreeLink } from "../../content/git-tree-link";
import type { GitFileChange } from "../../../ipc/git-ipc";

export interface GitTreeEditorState extends EditorStateBase {
    /** State-type discriminator. */
    type: "gitTreePage";
    /** Absolute repo top-level (the parent of the `.git` folder). */
    repoRoot: string;
    /** Persisted grid column layout (width + order). Owner-held so the user's
     *  resizing/reordering of the commit grid survives navigation-away/back and
     *  app restart — round-trips through the page descriptor like `repoRoot`
     *  (US-623). Undefined until the user first changes a column. */
    columnLayout?: GitColumnLayout;
    /** Bottom panel height in px (US-629). Undefined → DEFAULT_PANEL_H. Persisted
     *  via the page descriptor like `columnLayout` so it survives navigation +
     *  restart. */
    bottomPanelHeight?: number;
    /** Active bottom-panel tab (US-629). Undefined → "commit". */
    bottomPanelTab?: "commit" | "diff";
    /** Width (px) of the "Diff" tab's left file-list column (US-630). Undefined →
     *  DEFAULT_DIFF_LIST_W. Persisted via the page descriptor like
     *  `bottomPanelHeight` so the divider survives navigation + restart. */
    commitDiffListWidth?: number;
}

/** Basename of a repo top-level path (folder name), or "Git" when empty.
 *  Shared by the tab title (`initFromRepoRoot`) and the `repoName` getter. */
function repoFolderName(repoRoot: string): string {
    return repoRoot.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "Git";
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

    /** Auto-refresh watcher on the repo root (US-624). Recursively watches the
     *  working tree — which includes `.git` — so edits, staging, commits, and
     *  checkouts all trigger a debounced `refresh()`. Loop-safe: `refresh()` only
     *  reads (`git log` + `--no-optional-locks` status), so it never writes back
     *  into the tree it's watching. */
    private repoWatcher: DirectoryWatcher | undefined;
    private watchedRoot: string | undefined;

    /** Absolute path of an in-flight `openChangeDiff` navigation (US-631). A
     *  double-click fires two single clicks; the 2nd lands before the async
     *  navigation swaps the main editor, so dedupe by the path being opened to
     *  stop the diff re-mounting twice (the "blink"). Cleared when the
     *  navigation settles. */
    private diffNavInFlight: string | undefined;

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

    /** Repository folder name (basename of `repoRoot`) — used by the "Changes"
     *  panel header to disambiguate multiple repos' panels (US-619). Set once at
     *  open and never changes for a given instance. */
    get repoName(): string {
        return repoFolderName(this.state.get().repoRoot);
    }

    /** Persist the commit grid's column layout (width + order) into editor state
     *  so it round-trips through the page descriptor (US-623). Bound so the view
     *  can pass it straight to `<GitTree onColumnLayoutChange>`. */
    setColumnLayout = (layout: GitColumnLayout): void => {
        this.state.update((s) => { s.columnLayout = layout; });
    };

    /** Persist the bottom panel's height (US-629). Bound so the view can pass it
     *  straight to `<Splitter onChange>`. */
    setBottomPanelHeight = (h: number): void => {
        this.state.update((s) => { s.bottomPanelHeight = h; });
    };

    /** Persist the active bottom-panel tab (US-629). */
    setBottomPanelTab = (t: "commit" | "diff"): void => {
        this.state.update((s) => { s.bottomPanelTab = t; });
    };

    /** Persist the "Diff" tab's left file-list width (US-630). Bound so the view
     *  can pass it straight to the file-list/diff `<Splitter onChange>`. */
    setCommitDiffListWidth = (w: number): void => {
        this.state.update((s) => { s.commitDiffListWidth = w; });
    };

    /** Seed repoRoot + title from a decoded `git-tree://` link, then load. */
    initFromRepoRoot(repoRoot: string): void {
        const folder = repoFolderName(repoRoot);
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
        this.startWatching();
    }

    /** Start (or re-point) the repo-root auto-refresh watcher (US-624). Always-on
     *  whenever git is enabled and a repoRoot is set. Idempotent — keeps the
     *  existing watcher when the root is unchanged; re-creates it when it changes. */
    private startWatching(): void {
        const repoRoot = this.state.get().repoRoot;
        if (!settings.get("git.enabled") || !repoRoot) return;
        if (this.repoWatcher && this.watchedRoot === repoRoot) return;
        this.repoWatcher?.dispose();
        this.watchedRoot = repoRoot;
        this.repoWatcher = new DirectoryWatcher(repoRoot, this.refresh, 500);
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
        const norm = (p?: string | null) => p?.replace(/\\/g, "/");
        // Skip redundant navigation (US-631). The file's diff is already the
        // page's main editor → nothing to do (also covers slow repeat clicks).
        if (norm(this.page.mainEditorInstance?.getNavigatorTarget?.()?.filePath) === norm(absPath)) {
            return;
        }
        // A navigation to this same path is already in flight → ignore the
        // duplicate (the rapid 2nd click of a double-click, before the 1st
        // navigation has swapped the main editor — otherwise the diff blinks).
        if (norm(this.diffNavInFlight) === norm(absPath)) return;
        this.diffNavInFlight = absPath;
        void app.events.openRawLink
            .sendAsync(
                createLinkData(absPath, {
                    target: "file-diff",
                    pageId: this.page.id,
                    sourceId: this.id,
                }),
            )
            .finally(() => {
                this.diffNavInFlight = undefined;
            });
    }

    /** Promote this Git Tree back to the page's main editor (US-620). After the
     *  user clicks a changed file in the "Changes" panel — opening its Git Diff
     *  as the main editor while this editor survives only as the secondary panel
     *  — the panel header's "Show Git Tree" button calls this to bring the commit
     *  tree back into view. Fires the same `git-tree://` navigation the Explorer
     *  `.git` node uses, so `matchesNavigationTarget` reuses THIS instance
     *  (promote-to-main + `onNavigationReuse` refresh) rather than building a
     *  duplicate. A no-op-equivalent when already main (it just stays main). */
    showGitTree(): void {
        const repoRoot = this.state.get().repoRoot;
        if (!repoRoot || !this.page) return;
        void app.events.openRawLink.sendAsync(
            createLinkData(encodeGitTreeLink(repoRoot), {
                pageId: this.page.id,
                sourceId: this.id,
            }),
        );
    }

    /** Per-page singleton (US-617). The Git Tree survives navigation as the
     *  "Changes" secondary panel, so re-navigating to it (clicking the `.git`
     *  node again after viewing a diff) must reuse THIS instance rather than
     *  build a second one — otherwise instances pile up, each contributing the
     *  same `git-changes` panel, and the panel "x" closes only one per click.
     *  Matches when the navigation is a `git-tree` target for our repoRoot. */
    matchesNavigationTarget(target: string | undefined, filePath: string): boolean {
        if (target !== "git-tree") return false;
        const link = decodeGitTreeLink(filePath);
        return !!link && link.repoRoot === this.state.get().repoRoot;
    }

    /** Reused-on-navigation hook (US-617): refresh so promoting back to main
     *  shows current history + changes (a fresh open would have loaded fresh). */
    onNavigationReuse(): void {
        this.refresh();
    }

    /** Manual close (US-617): the Changes panel "x" removes this whole editor.
     *  `removeSecondaryView` detaches us — clearing the page's main editor when
     *  we ARE the main (→ empty page) and leaving a Git Diff main untouched when
     *  we are only the secondary panel — then disposes us exactly once. Mirrors
     *  the close path in `ArchiveSecondaryView`. */
    async requestClose(): Promise<void> {
        await this.page?.removeSecondaryView(this);
    }

    async dispose(): Promise<void> {
        this.repoWatcher?.dispose();
        this.gitTree.dispose();
        this.changes.dispose();
        await super.dispose();
    }
}
