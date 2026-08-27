import {
    EditorModel,
    type EditorStateBase,
} from "../base/EditorModel";
import { GitIcon } from "../../theme/icons";
import { GitTreeModel, GitChangesModel, GitBranchesModel, type GitColumnLayout, type GitRefNodeKind } from "../../components/git-tree";
import type { IPageHost } from "../../api/pages/IPageHost";
import type { MenuItem } from "../../uikit";
import { app } from "../../api/app";
import { api } from "../../../ipc/renderer/api";
import { git } from "../../api/git";
import { ui } from "../../api/ui";
import { settings } from "../../api/settings";
import { createLinkData } from "../../../shared/link-data";
import { fpJoin } from "../../core/utils/file-path";
import { DirectoryWatcher } from "../../core/utils/file-watcher";
import { decodeGitTreeLink, encodeGitTreeLink } from "../../content/git-tree-link";
import type { GitFileChange, GitSwitchTarget, GitPullOptions } from "../../../ipc/git-ipc";
import type { ILinkDiffRevision } from "../../api/types/io.link-data";
import { createIconElement } from "../../uikit/shared/slots";

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
    /** Active segment of the merged Git panel ("changes" | "branches" | "tags").
     *  Undefined → "changes". Persisted via the page descriptor like
     *  `bottomPanelTab` so the chosen segment survives navigation + restart
     *  (US-781). */
    gitPanelTab?: "changes" | "branches" | "tags";
    /** Width (px) of the "Diff" tab's left file-list column (US-630). Undefined →
     *  DEFAULT_DIFF_LIST_W. Persisted via the page descriptor like
     *  `bottomPanelHeight` so the divider survives navigation + restart. */
    commitDiffListWidth?: number;
    /** Persisted expansion map for the "Branches & Tags" tree (US-634), keyed by
     *  ITreeItem value (e.g. "sec:branches", "localdir:feature"). Undefined →
     *  default (only the Branches root expanded). Round-trips through the page
     *  descriptor like `columnLayout`. */
    branchesExpanded?: Record<string, boolean>;
    /** When true, the "Branches & Tags" tree sorts refs alphabetically; when
     *  false/undefined (default) it preserves the historical (most-recent-first)
     *  order. Toggled by the "AZ" header button and persisted via the page
     *  descriptor like `branchesExpanded` (US-634). */
    branchesAlphabetical?: boolean;
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

    /** Submodel: repository refs for the "Branches & Tags" secondary panel (US-634). */
    readonly branches = new GitBranchesModel();

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

    getIconElement = (): SVGElement | undefined => GitIcon.createElement({ width: 16, height: 16 });

    /** Page-tab context-menu items specific to the Git Tree editor: reveal the
     *  repository root in the OS file manager, and copy the configured remote's
     *  URL to the clipboard. */
    onGetMenuItems(): MenuItem[] {
        const repoRoot = this.state.get().repoRoot;
        const remotes = this.branches.state.get().refs.remotes;
        // Prefer "origin" when present; otherwise the first configured remote.
        const remote = remotes.includes("origin") ? "origin" : remotes[0];
        return [
            {
                label: "Open Git Root Folder",
                icon: createIconElement("folder-open"),
                onClick: () => {
                    if (repoRoot) api.showItemInFolder(repoRoot);
                },
                disabled: !repoRoot,
            },
            {
                label: "Copy Remote URL",
                icon: createIconElement("copy"),
                onClick: async () => {
                    const url = await git.getRemoteUrl(repoRoot, remote);
                    if (url) navigator.clipboard.writeText(url);
                },
                disabled: !remote,
            },
        ];
    }

    /** Register the "Changes" sidebar panel when attached to a page (Pattern B —
     *  the main editor is also its own secondary view; secondary-views.md §2). */
    setPage(page: IPageHost | null): void {
        super.setPage(page);
        // Single merged "Git" panel (US-781): Changes / Branches / Tags live in one
        // secondary view, switched by an in-body SegmentedControl. Set
        // unconditionally so a session that persisted the old two-id array
        // (["git-branches","git-changes"]) is migrated — "git-branches" is no
        // longer a registered panel.
        if (page) this.secondaryView = ["git-changes"];
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

    /** Switch the merged Git panel's active segment (US-781). Persists the choice
     *  and, if the now-active segment's submodel went stale while hidden (another
     *  segment was showing), reloads it so the user sees current data. */
    setGitPanelTab = (t: "changes" | "branches" | "tags"): void => {
        this.state.update((s) => { s.gitPanelTab = t; });
        if (!this.isPanelVisible("git-changes")) return;
        // Changes always reloads (see `refresh`), so only the refs segments need a
        // stale catch-up. "branches" and "tags" share the `branches` submodel.
        if (t !== "changes" && this.branches.stale) this.refreshBranches();
    };

    /** Persist the "Diff" tab's left file-list width (US-630). Bound so the view
     *  can pass it straight to the file-list/diff `<Splitter onChange>`. */
    setCommitDiffListWidth = (w: number): void => {
        this.state.update((s) => { s.commitDiffListWidth = w; });
    };

    /** Persist the "Branches & Tags" tree expansion map (US-634). Bound so the
     *  panel can pass it straight to `<Tree onExpandChange>`. */
    setBranchesExpanded = (map: Record<string, boolean>): void => {
        this.state.update((s) => { s.branchesExpanded = map; });
    };

    /** Toggle alphabetical vs. historical ordering of the "Branches & Tags"
     *  tree (US-634). Bound for the "AZ" header button. */
    setBranchesAlphabetical = (alphabetical: boolean): void => {
        this.state.update((s) => { s.branchesAlphabetical = alphabetical; });
    };

    /** Reveal a ref clicked in the "Branches & Tags" panel inside the commit
     *  grid (US-634). No-op unless the Git Tree is the page's main editor (the
     *  grid is only mounted then). Focuses the matching row's "Comment" cell;
     *  if the ref's tip isn't among the loaded commits, focuses the last row so
     *  the "Load more"/"Load all" footer is in view. */
    revealRef = (refName: string | undefined, kind: GitRefNodeKind | undefined): void => {
        if (!refName || !kind || !this.isTreeVisible()) return;
        this.gitTree.revealRef(refName, kind);
    };

    /** Switch HEAD to a branch / remote branch / commit / tag (US-636). No
     *  confirmation — every switch is frictionless (a dirty tree that git refuses
     *  just toasts). A commit/tag switch leaves a detached HEAD; helping the user
     *  create a branch from that state is a future task (handled in the commit
     *  dialog). Refreshes on success for immediate feedback; the US-624 watcher
     *  also fires. */
    switchTo = async (target: GitSwitchTarget): Promise<void> => {
        const repoRoot = this.state.get().repoRoot;
        if (!repoRoot) return;
        const r = await git.switchTo(repoRoot, target);
        if (!r.ok) void ui.notify(`Failed to switch: ${r.error ?? "unknown error"}`, "error");
        this.refresh();
    };

    /** Create a branch at a commit and check it out, prompting for the name
     *  (US-638). Reuses the name-input dialog; an invalid/duplicate name (or a
     *  dirty tree that would be overwritten when checking out a historical commit)
     *  is surfaced as a toast. Uses `switch -c` (checkout=true) so the new branch
     *  becomes current — mirrors the commit-dialog flow. Refreshes on success so
     *  the new (now-current) ref appears in the graph + Branches panel. */
    createBranchAt = async (hash: string, shortHash: string): Promise<void> => {
        const repoRoot = this.state.get().repoRoot;
        if (!repoRoot) return;
        const { showInputDialog } = await import("../../ui/dialogs/InputDialog");
        const res = await showInputDialog({
            title: "Create branch",
            message: `Create branch at ${shortHash}`,
            value: "",
            buttons: ["Create", "Cancel"],
        });
        if (res?.button !== "Create" || !res.value.trim()) return;
        const r = await git.createBranch(repoRoot, res.value.trim(), hash, true);
        if (!r.ok) void ui.notify(`Failed to create branch: ${r.error ?? "unknown error"}`, "error");
        this.refresh();
    };

    /** Fetch all remotes, then refresh the graph + ahead/behind (US-641). Delegates
     *  busy state + toast to the branches submodel. */
    fetch = async (): Promise<void> => {
        await this.branches.fetch();   // sets fetching, toasts on failure, reloads refs + ahead/behind
        this.refresh();                // reload the commit graph (new remote-tracking commits)
    };

    /** Push the current branch (US-641). Delegates upstream-detection + busy state +
     *  toast to the branches submodel, then refreshes the graph + ahead/behind. */
    push = async (): Promise<void> => {
        await this.branches.push();
        this.refresh();
    };

    /** Pull from the current branch's upstream, then reload the commit graph +
     *  ahead/behind + Changes panel (US-642). Delegates the git op + toast to
     *  `branches.pull()`, then `this.refresh()` (visibility-aware: reloads the graph +
     *  ahead/behind, and the Changes panel when it's open). The view calls `model.pull()`
     *  — not `branches.pull()` — keeping cross-model coordination in the editor model. */
    pull = async (opts?: GitPullOptions): Promise<void> => {
        await this.branches.pull(opts);
        this.refresh();
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
        // Initial load is eager for all three so every panel has content the
        // moment it is first revealed; the visibility-aware gating (US-634)
        // applies to the repeated watcher-driven `refresh()`, not this one-time
        // population.
        this.gitTree.configure(repoRoot);
        void this.gitTree.reload();
        this.changes.configure(repoRoot);
        void this.changes.reload();
        this.branches.configure(repoRoot);
        void this.branches.reload();
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

    /** Tree body visible ⟺ the Git Tree is the page's main editor. */
    private isTreeVisible(): boolean {
        return this.page?.mainEditorInstance === this;
    }

    /** A panel is the expanded one ⟺ it is the page's active (bare) panel id.
     *  The sidebar is a single-expand accordion (US-619), so at most one of our
     *  panels is visible at a time. */
    private isPanelVisible(panelId: string): boolean {
        return this.page?.activePanelId === panelId;
    }

    /** The merged Git panel is expanded AND showing refs (the "Branches" or
     *  "Tags" segment) — i.e. the branches/tags data is on screen (US-781). */
    private isRefsVisible(): boolean {
        if (!this.isPanelVisible("git-changes")) return false;
        const t = this.state.get().gitPanelTab ?? "changes";
        return t === "branches" || t === "tags";
    }

    /** Reload the commit graph (configure-first, self-healing — sets the root if
     *  a restore left the submodel unconfigured; a no-op when unchanged). */
    private refreshTree(): void {
        this.gitTree.configure(this.state.get().repoRoot);
        void this.gitTree.reload();
    }
    private refreshChanges(): void {
        this.changes.configure(this.state.get().repoRoot);
        void this.changes.reload();
    }
    private refreshBranches(): void {
        this.branches.configure(this.state.get().repoRoot);
        void this.branches.reload();
    }

    /** Unified refresh (US-616): bound to the Git Tree toolbar Refresh and both
     *  panels' header Refresh, and fired by the US-624 auto-refresh watcher.
     *
     *  Visibility-aware (US-634): reload only the CURRENTLY-VISIBLE surfaces; a
     *  hidden surface is marked stale and reloads lazily when next revealed
     *  (`onPanelExpanded` for a panel, promote-to-main for the tree). This avoids
     *  reloading the commit log + status + refs on every working-tree change when
     *  the user is looking at only one of them. */
    refresh = (): void => {
        if (this.isTreeVisible()) { this.refreshTree(); void this.branches.reloadAheadBehind(); }
        else this.gitTree.markStale();
        // Always reload the changes (working-tree status) — even while the panel is
        // collapsed — so the panel header's modified-file count ("Git (N)") stays
        // accurate at all times. The refs surface keeps the visibility-aware gating:
        // it shares the merged panel with changes, only one segment shows at a time,
        // and nothing off-screen depends on its data, so reload it only when visible
        // and mark it stale for lazy catch-up otherwise (US-781).
        this.refreshChanges();
        if (this.isRefsVisible()) this.refreshBranches(); else this.branches.markStale();
    };

    /** Reveal-time catch-up (US-634/US-781): when the user expands the merged Git
     *  panel, reload the active segment's submodel if a hidden-refresh left it
     *  stale. */
    onPanelExpanded(panelId: string): void {
        if (panelId !== "git-changes") return;
        const t = this.state.get().gitPanelTab ?? "changes";
        // Changes always reloads (see `refresh`), so only the refs segments need a
        // stale catch-up. "branches" and "tags" share the `branches` submodel.
        if (t !== "changes" && this.branches.stale) this.refreshBranches();
    }

    /** Open a changed file's Git Diff in this page (US-616, Concern 1). Navigates
     *  the current page to the file with the `file-diff` editor as target; this
     *  editor survives as the secondary "Changes" panel (see `beforeNavigateAway`).
     *
     *  `list` chooses the preselected comparison (US-637): the **Staged** list
     *  opens `Last commit (HEAD) ↔ Staged (index)` so a fully-staged file shows
     *  its real changes (not an empty `Staged ↔ Unstaged`); the **Unstaged** list
     *  keeps the editor's default (`Staged ↔ Unstaged`). Preselection rides the
     *  link pipeline (`diffFrom`/`diffTo`) and is consumed only when the fresh
     *  File Diff editor mounts. Accepted limitation: when the file's diff is
     *  already this page's main editor, the same-file early-return below makes a
     *  repeat click a no-op (it won't re-switch the comparison). */
    openChangeDiff(change: GitFileChange, list: "unstaged" | "staged"): void {
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
        const diffFrom: ILinkDiffRevision | undefined =
            list === "staged" ? { kind: "head" } : undefined;
        const diffTo: ILinkDiffRevision | undefined =
            list === "staged" ? { kind: "staged" } : undefined;
        this.diffNavInFlight = absPath;
        void app.events.openRawLink
            .sendAsync(
                createLinkData(absPath, {
                    target: "file-diff",
                    pageId: this.page.id,
                    sourceId: this.id,
                    diffFrom,
                    diffTo,
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
     *  shows current history + changes (a fresh open would have loaded fresh).
     *  Promotion makes the tree the main editor, so `refresh()` reloads it; the
     *  stale visible panel (if any) catches up too (US-634). */
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
        this.branches.dispose();
        await super.dispose();
    }
}
