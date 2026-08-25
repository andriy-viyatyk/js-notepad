import { createElement, type ReactNode } from "react";

import type { EditorStateBase, RestoreData } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence";
import { TextFileModel } from "../text/TextEditorModel";
import { fpRelative } from "../../core/utils/file-path";
import { GitTreeModel } from "../../components/git-tree";
import { CompareIcon } from "../../theme/icons";
import { git } from "../../api/git";
import type { ILinkDiffRevision } from "../../api/types/io.link-data";

/**
 * A revision selection for one side of the diff (EPIC-030 / US-613).
 *   - unstaged → the working tree = current editor content (live host content)
 *   - staged   → the git index (`:path`) = staged changes
 *   - head     → the last commit (`HEAD:path`)
 *   - commit   → a specific commit (`<hash>:path`); an empty `hash` means the
 *     empty tree (a root commit's absent parent → empty side)
 *
 * Aliased to the link-pipeline type `ILinkDiffRevision` so a caller can preselect
 * the comparison via `diffFrom`/`diffTo` link metadata (single source of truth).
 */
export type RevSel = ILinkDiffRevision;

export interface FileDiffEditorState extends EditorStateBase {
    /** Left / original. Default = staged (index). The `from` side is never "unstaged". */
    from: RevSel;
    /** Right / modified. Default = unstaged (working tree). Editable only when "unstaged". */
    to: RevSel;
    /** Whether the file has staged changes (index ≠ HEAD). When false the pickers
     *  hide the "Staged" option (it would just show HEAD). Detected on adopt;
     *  derived (not persisted). */
    hasStaged: boolean;
}

export const defaultFileDiffEditorState: FileDiffEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    from: { kind: "staged" },
    to: { kind: "unstaged" },
    hasStaged: false,
};

/**
 * File Diff editor (EPIC-030 / US-613).
 *
 * A host-adopting (`hasContentHost: true`) editor surfaced via the editor switch
 * for any text file in a git repo. Renders a Monaco diff of the file between two
 * selected revisions (`from`/`to`). Structurally mirrors `MarkdownEditor`: it
 * adopts the shared `TextFileModel` via `CONTENT_HOST_TRAIT`, so the user can
 * switch back to Text Editor / Preview. The body (Monaco diff + from/to pickers)
 * lives in `FileDiffBody`.
 */
export class FileDiffEditor extends TextHostEditorModel<FileDiffEditorState> {
    readonly editorId = "file-diff";
    protected readonly displayName = "File Diff";

    /** Set once `applyDiffRevisions` has installed a caller-chosen comparison
     *  (US-637). Tells `initDiffDefaults` to keep `from`/`to` untouched so a late
     *  git-detection re-run can't clobber the explicit selection. */
    private _explicitRevs = false;

    /** Single file-scoped commit-list model (model-view), shared by both toolbar
     *  popovers AND the "Revisions" secondary panel (US-618). All three render the
     *  same single-file history; selection is a render prop (`selectedHash` /
     *  `sideSelect`), not model state, so one model backs them all. Owned here so
     *  it survives popover open/close; loaded eagerly in `configureForRepo` (the
     *  panel is visible as soon as the diff opens). */
    readonly fileTree = new GitTreeModel();

    /** Tab icon — reuse the compare glyph. */
    getIcon = (): ReactNode => createElement(CompareIcon, { width: 16, height: 16 });
    getIconElement = (): SVGElement | undefined => CompareIcon.createElement?.({ width: 16, height: 16 });

    // ── Diff helpers (consumed by the body) ─────────────────────────────

    /** Repo top-level for the host's file, or undefined when not in a repo. */
    get repoRoot(): string | undefined {
        return this._host?.state.get().gitRepo?.root;
    }

    /** Repo-relative path (forward-slashed for git), or undefined. */
    get relPath(): string | undefined {
        const root = this.repoRoot;
        const filePath = this._host?.state.get().filePath;
        if (!root || !filePath) return undefined;
        return fpRelative(root, filePath).replace(/\\/g, "/");
    }

    get language(): string | undefined {
        return this._host?.state.get().language;
    }

    setFrom = (sel: RevSel): void => {
        this.state.update((s) => { s.from = sel; });
    };

    setTo = (sel: RevSel): void => {
        this.state.update((s) => { s.to = sel; });
    };

    /**
     * Apply a caller-chosen comparison from link metadata (US-637). Called once,
     * right after a fresh File Diff editor is constructed on open (the open
     * pipeline never calls this on a reuse/activate path). Marks the selection
     * explicit so a late `initDiffDefaults()` (fired when git detection lands on
     * the restore/open path) won't overwrite it. A no-op when neither side is given.
     */
    applyDiffRevisions = (from?: RevSel, to?: RevSel): void => {
        if (!from && !to) return;
        this._explicitRevs = true;
        this.state.update((s) => {
            if (from) s.from = from;
            if (to) s.to = to;
        });
    };

    /**
     * On adopt, resolve the diff defaults from git:
     *   - `hasStaged` (index ≠ HEAD) — when false the pickers hide "Staged".
     *   - the file's **latest commit**, used as the default left side instead of
     *     a "HEAD" pointer (matches the grid; user request). When there are
     *     staged changes the default stays "Staged"; otherwise it becomes the
     *     latest commit (falling back to `head` only when the file has no commits).
     * Only replaces a still-default `staged`/`head` selection — a restored or
     * user-picked commit is left untouched.
     */
    /** Configure the shared commit-list model for the current repo/file and resolve
     *  the diff defaults. Called on adopt and again when git detection lands
     *  (restore). Eagerly reloads so the "Revisions" panel shows history immediately;
     *  the popovers' lazy `ensureLoaded()` then finds it already loaded. */
    private configureForRepo(): void {
        this.fileTree.configure(this.repoRoot, this.relPath);
        void this.fileTree.reload();
        void this.initDiffDefaults();
    }

    /** Header "Refresh" for the Revisions panel (US-618): reload the commit list
     *  and re-derive `hasStaged` (which drives the panel's Staged endpoint row).
     *  `configure` is a no-op when the repo/file is unchanged, so this just
     *  re-fetches (it never wipes the list). */
    refreshPanel = (): void => {
        this.configureForRepo();
    };

    private async initDiffDefaults(): Promise<void> {
        const root = this.repoRoot;
        const relPath = this.relPath;
        // Repo not resolved yet (restore: detection still in flight) — wait for the
        // gitRepo subscription to re-run this; don't normalize against unknowns.
        if (!root || !relPath) {
            this.state.update((s) => { s.hasStaged = false; });
            return;
        }
        const [index, head, log] = await Promise.all([
            git.show(root, "", relPath),   // index (`:path`)
            git.show(root, "HEAD", relPath),
            git.log(root, { file: relPath, maxCount: 1 }),
        ]);
        const hasStaged = index !== head;
        const c = log[0];
        const fallback: RevSel = c
            ? { kind: "commit", hash: c.hash, shortHash: c.shortHash }
            : { kind: "head" };
        this.state.update((s) => {
            s.hasStaged = hasStaged;
            // A caller-chosen comparison (link metadata) wins — never normalize
            // over an explicit selection (US-637).
            if (this._explicitRevs) return;
            if (!hasStaged) {
                // No staged version → "Staged"/"HEAD" all equal the latest commit;
                // prefer the concrete commit so the label matches the grid.
                if (s.from.kind === "staged" || s.from.kind === "head") s.from = fallback;
                if (s.to.kind === "staged" || s.to.kind === "head") s.to = fallback;
            }
        });
    }

    // ── Persistence ─────────────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        // Persist `from`/`to` so the exact comparison restores (app restart +
        // cross-window drag both use this descriptor path; Concern 1).
        const d = super.getRestoreData();
        const s = this.state.get();
        (d.state as Record<string, unknown>).from = s.from;
        (d.state as Record<string, unknown>).to = s.to;
        return d;
    }

    applyRestoreData(data: RestoreData<FileDiffEditorState>): void {
        // The persistence restore path passes the full descriptor
        // (`{ editorId, id, state, host }`), so our persisted fields live under
        // `state`. Fall back to a flat shape for any direct caller.
        const d = data as unknown as {
            state?: Partial<FileDiffEditorState>;
            host?: HostDescriptor;
        } & Partial<FileDiffEditorState>;
        const st: Partial<FileDiffEditorState> = d.state ?? d;
        this.state.update((cur) => {
            if (st.title !== undefined) cur.title = st.title;
            if (st.modified !== undefined) cur.modified = st.modified;
            if (st.secondaryView !== undefined) cur.secondaryView = st.secondaryView;
            if (st.from !== undefined) cur.from = st.from;
            if (st.to !== undefined) cur.to = st.to;
        });
        if (d.host) this._pendingHost = d.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    adoptHost(host: TextFileModel): void {
        super.adoptHost(host);

        // Detect git membership (no-op if already detected). On restore the host
        // is fresh and `gitRepo` resolves asynchronously — so (re)configure the
        // pickers + defaults both now and again when detection lands.
        void host.detectGitRepo();
        this.configureForRepo();
        this.registerHostSubscription(
            host.state.subscribe(
                () => this.configureForRepo(),
                (s) => (s as { gitRepo?: { root: string } | null }).gitRepo?.root,
            ),
        );

        // Register the "Revisions" sidebar panel (Pattern B — the main editor is
        // also its own secondary view). We do NOT
        // override `beforeNavigateAway`, so the base default clears this panel when
        // the editor stops being main — it disappears on navigation to another file
        // AND on switching the Git Diff back to the Text Editor (US-618).
        this.secondaryView = ["git-diff-revisions"];
    }

    // ── Save / release / dispose ────────────────────────────────────────

    async dispose(): Promise<void> {
        this.fileTree.dispose();
        await super.dispose();
    }
}
