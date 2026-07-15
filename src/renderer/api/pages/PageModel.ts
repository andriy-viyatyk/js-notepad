import { TComponentState, TOneState } from "../../core/state/state";
import type { EditorModel, EditorOrHost } from "../../editors/base";
import { parseBoardEditorId } from "../../editors/board/custom-editor-registry";
import { ExplorerEditor, getDefaultExplorerEditorState } from "../../editors/explorer";
import type { NavEntry, PageDescriptor } from "../../../shared/persistence";
import { SecondaryViewsModel, ISecondaryViewsState } from "../../ui/secondary-views/SecondaryViewsModel";
import type { IPageHost } from "./IPageHost";
import type { IContentPipe } from "../types/io.pipe";
import { fs } from "../fs";
import { secondaryViewsToggled, panelExpanded } from "../../core/state/events";
import { fpDirname } from "../../core/utils/file-path";
import { panelKey, parsePanelKey, panelIdOf, isCompositePanelKey } from "../../ui/secondary-views/panel-key";

/** Unwrap a text-bearing editor to its TextFileModel host, so legacy consumers
 *  (tab strip, OpenTabsList, PageTabs) see `filePath` / `language` / `encrypted`
 *  on the host directly. Non-text-bearing editors are returned as-is. */
function unwrapToHost(editor: EditorModel | null): EditorOrHost | null {
    if (!editor) return null;
    const host = (editor as { contentHost?: { type?: string } | null }).contentHost;
    if (host && host.type === "textFile") {
        return host as unknown as EditorOrHost;
    }
    return editor;
}

/** Reactive page-level state — UI subscribes to this for re-render on page changes. */
export interface IPageState {
    /** Page-level pinned flag. */
    pinned: boolean;
    /** Current main editor ID — changes on navigation, triggers re-render for editor swap. */
    mainEditorId: string | null;
    /** Bumped whenever `editors[]` changes (attach/detach) or an editor's panel-list
     *  flips. Drives SecondaryViews re-render and the per-page persistence
     *  subscription's editor-membership reconciliation. */
    version: number;
    /** Whether the sidebar (SecondaryViewsModel) exists. Kept for backward compat
     *  with existing UI; equivalent to `hasSidebar` getter. */
    hasSidebar: boolean;
    /** Length of the Markdown back-navigation stack. Drives the Markdown view's
     *  Back button visibility (shown iff > 0). */
    navBackCount: number;
}

const defaultPageState: IPageState = {
    pinned: false,
    mainEditorId: null,
    version: 0,
    hasSidebar: false,
    navBackCount: 0,
};

export class PageModel implements IPageHost {
    /** Stable page UUID — tab identity, React key, cache key. Never changes. */
    readonly id: string;

    /** Reactive page-level state. UI uses `page.state.use()` for re-render. */
    readonly state = new TOneState<IPageState>({ ...defaultPageState });

    /**
     * All editors attached to this page. Order matches sidebar panel order.
     * One of these may also be the main editor (flagged by `_mainEditorId`).
     * Holds EditorModel instances.
     */
    readonly editors: EditorModel[] = [];

    /**
     * Which editor in `editors[]` is the main (content area). Null = no main;
     * page is sidebar-only (explorer-only, archive-root, link-collection).
     */
    private _mainEditorId: string | null = null;

    /** Close callback — set by PagesModel.attachPage(). */
    onClose?: () => void;

    // ── Sidebar state ─────────────────────────────────────────────────

    /** Sidebar model — pure reactive state (open/close/width/activePanel). */
    secondaryViewsModel: SecondaryViewsModel | null = null;
    /** Pre-model seed for `activePanel`, used before the sidebar model is lazily
     *  created (and to carry the value into it on creation). */
    private _activePanel = "explorer";

    /** Which panel is currently active/expanded.
     *  Values: "explorer", "search", or a secondary panel ID.
     *  Backed by the sidebar model once it exists, else the seed. */
    get activePanel(): string {
        return this.secondaryViewsModel?.state.get().activePanel ?? this._activePanel;
    }

    /** Quiet setter — no events. Used by detach-adjust and restore. The
     *  side-effecting path is setSecondaryViewsState(). Does NOT create the
     *  sidebar model (avoids resurrecting a sidebar during a last-panel detach). */
    set activePanel(value: string) {
        this._activePanel = value;
        this.secondaryViewsModel?.setStateQuiet({ activePanel: value });
    }

    /** The bare panel-type id of the active panel (composite `activePanel` is
     *  `${editorId}::${panelId}`). Use this for "is panel X expanded" checks
     *  (US-619). */
    get activePanelId(): string {
        return panelIdOf(this.activePanel);
    }

    // ── Per-editor slice subscriptions (walkthrough 03 / N1) ───────────

    private _editorSubs = new Map<string, () => void>();

    // ── Transient state (not persisted) ────────────────────────────

    /** Runtime-only key-value store. Survives editor navigation, cleared on page close / app restart. */
    private _transient = new Map<string, unknown>();

    /** Get a transient value by key. Returns undefined if not set. */
    getTransient<T>(key: string): T | undefined {
        return this._transient.get(key) as T | undefined;
    }

    /** Set a transient value. Pass undefined to delete. */
    setTransient(key: string, value: unknown): void {
        if (value === undefined) {
            this._transient.delete(key);
        } else {
            this._transient.set(key, value);
        }
    }

    // ── Markdown back-navigation history (US-784) ──────────────────────

    /** Back-navigation stack for the Markdown view (oldest first). Pushed by the
     *  Markdown link interceptor, popped by its Back button. Lives on the page so
     *  it survives the editor swaps each in-place navigation creates, and is
     *  persisted in the page descriptor (survives restart + window moves). */
    private _navBack: NavEntry[] = [];

    /** Push the document being navigated away from onto the back stack. */
    pushNavBack(entry: NavEntry): void {
        this._navBack.push(entry);
        this.state.update((s) => { s.navBackCount = this._navBack.length; });
    }

    /** Pop and return the most recent back entry, or undefined when empty. */
    popNavBack(): NavEntry | undefined {
        const entry = this._navBack.pop();
        if (entry) this.state.update((s) => { s.navBackCount = this._navBack.length; });
        return entry;
    }

    /** Seed the back stack from a persisted descriptor (restore path). */
    seedNavBack(entries: NavEntry[] | undefined): void {
        this._navBack = entries ? [...entries] : [];
        this.state.update((s) => { s.navBackCount = this._navBack.length; });
    }

    constructor(id?: string) {
        this.id = id ?? crypto.randomUUID();
    }

    // ── Derived getters ───────────────────────────────────────────────

    /** Main editor with content-host unwrap: text-bearing editors return their
     *  `TextFileModel` host so consumers reading `filePath` / `language` /
     *  `encrypted` / `modified` (tab strip, OpenTabsList) work uniformly with
     *  no-host editors that return the editor instance itself.
     *  Use `mainEditorInstance` when an `instanceof EditorModel` check or
     *  access to editor-specific fields (`editorId`, `contentHost`) is needed. */
    get mainEditor(): EditorOrHost | null {
        return unwrapToHost(this.mainEditorInstance);
    }

    set mainEditor(editor: EditorModel | null) {
        if (editor && !this.editors.includes(editor)) {
            this.attach(editor);
        }
        this._mainEditorId = editor?.id ?? null;
        this.state.update((s) => { s.mainEditorId = editor?.id ?? null; });
    }

    /** Raw editor instance (no host unwrap). Used by callers that need
     *  `instanceof` checks against concrete editor classes or access to
     *  editor-specific fields like `editorId` and `contentHost`. */
    get mainEditorInstance(): EditorModel | null {
        if (!this._mainEditorId) return null;
        return this.editors.find((e) => e.id === this._mainEditorId) ?? null;
    }

    /** Find an editor already attached to this page whose backing file is
     *  `filePath`. Text-bearing editors are unwrapped to their content host
     *  (where `filePath` lives), matching the property `mainEditor` exposes.
     *  Lets navigation promote an existing editor (e.g. a modified Link editor
     *  surviving as a sidebar panel) back to main instead of building a
     *  duplicate. */
    findEditorByFilePath(filePath: string): EditorModel | null {
        if (!filePath) return null;
        return (
            this.editors.find(
                (e) =>
                    (unwrapToHost(e) as { filePath?: string } | null)?.filePath ===
                    filePath,
            ) ?? null
        );
    }

    /** Editors that currently contribute panels (subset of `editors[]`). All
     *  sidebar-owning editors (Link, Archive, Explorer, Category) live on the
     *  editor; `instanceof` checks resolve against the concrete class. */
    get panelEditors(): EditorModel[] {
        const editors = this.editors.filter((e) => e.contributesPanels());
        // Explorer panel always renders first. The Explorer editor is lazily
        // attached AFTER content editors when the user toggles the navigator,
        // so it would otherwise sort last. Stable-sort the explorer-contributing
        // editor to the front; Array.sort is stable, so other editors keep
        // their attach order.
        const explorerRank = (e: EditorModel) =>
            ((e.state.get() as { secondaryView?: string[] }).secondaryView ?? [])
                .includes("explorer") ? 0 : 1;
        return editors.sort((a, b) => explorerRank(a) - explorerRank(b));
    }

    // ── Pinned (reactive) ────────────────────────────────────────────

    get pinned(): boolean {
        return this.state.get().pinned;
    }

    set pinned(value: boolean) {
        this.state.update((s) => { s.pinned = value; });
    }

    // ── Derived properties ───────────────────────────────────────────

    /** Display title — delegates to mainEditor, or "Empty" for empty pages. */
    get title(): string {
        return this.mainEditorInstance?.title ?? "Empty";
    }

    /** Aggregate modified flag: true if any editor in `editors[]` is modified. */
    get modified(): boolean {
        return this.editors.some((e) => e.modified);
    }

    /** Whether this page has an active sidebar. */
    get hasSidebar(): boolean {
        return this.editors.some((e) => e.contributesPanels()) || this.secondaryViewsModel !== null;
    }

    /** Sidebar is closeable only when the Explorer is the *sole* panel
     *  contributor. Any other secondary view (Link/Archive/Todo/Notebook/…
     *  panels) makes it mandatory and non-closeable. Discriminates on the same
     *  `type === "fileExplorer"` marker as `findExplorer()`. */
    get sidebarMandatory(): boolean {
        return this.editors.some(
            (e) => e.contributesPanels()
                && (e.state.get() as { type?: string }).type !== "fileExplorer",
        );
    }

    // ── Membership primitives ─────────────────────────────────────────

    /** Add an editor to `editors[]`. No-op if already present.
     *
     *  Walkthrough 03 / N1: subscribes to the editor's `secondaryView` slice
     *  via the TOneState selector overload. The handler fires only when the
     *  panel list reference changes; visibility criterion enforced in
     *  `onEditorPanelsChanged`. */
    attach(editor: EditorModel): void {
        if (this.editors.includes(editor)) return;
        this.editors.push(editor);
        editor.setPage(this);
        const prior = this._editorSubs.get(editor.id);
        prior?.();
        const unsub = editor.state.subscribe(
            () => this.onEditorPanelsChanged(editor),
            (s) => (s as { secondaryView?: string[] }).secondaryView,
        );
        this._editorSubs.set(editor.id, unsub);
        this.state.update((s) => {
            s.version++;
            s.hasSidebar = this.hasSidebar;
        });
        this._enforceMandatoryOpen();
    }

    /** Remove an editor from `editors[]`. Does NOT dispose — caller decides.
     *  Used by visibility-criterion auto-detach and explicit user actions. */
    detach(editor: EditorModel): void {
        const idx = this.editors.indexOf(editor);
        if (idx < 0) return;
        this.editors.splice(idx, 1);
        const idStillInUse = this.editors.some((e) => e.id === editor.id);
        if (!idStillInUse) {
            this._editorSubs.get(editor.id)?.();
            this._editorSubs.delete(editor.id);
        }
        editor.setPage(null);
        if (this._mainEditorId === editor.id && !idStillInUse) {
            this._mainEditorId = null;
            this.state.update((s) => { s.mainEditorId = null; });
        }
        // Adjust activePanel if it pointed to a panel this editor owned. A
        // composite key carries the owning editor id; a bare value (a pre-US-619
        // persisted id not yet converted by an accordion click) is matched
        // against the detached editor's own panel ids (US-619).
        const active = parsePanelKey(this.activePanel);
        const ownedByDetached = active.editorId
            ? active.editorId === editor.id
            : (editor.secondaryView?.includes(active.panelId) ?? false);
        if (ownedByDetached) {
            this.activePanel = "explorer";
        }
        this.state.update((s) => {
            s.version++;
            s.hasSidebar = this.hasSidebar;
        });
        this._enforceMandatoryOpen();
    }

    /** Compat shim for the `EditorModel.secondaryView` setter side-effect.
     *  Accepts any editor and looks up an existing adapter by id. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addSecondaryView(editor: any): void {
        // Legacy editors pass themselves; resolve to their adapter via id.
        const id = editor?.state?.get?.()?.id ?? editor?.id;
        if (id) {
            const existing = this.editors.find((e) => e.id === id);
            if (existing) {
                this.state.update((s) => { s.version++; });
                return;
            }
        }
        if (editor && this.editors.includes(editor)) {
            this.state.update((s) => { s.version++; });
            return;
        }
        if (editor) this.attach(editor as EditorModel);
    }

    /** Compat shim — detach without disposing. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeSecondaryViewWithoutDispose(editor: any): void {
        const id = editor?.state?.get?.()?.id ?? editor?.id;
        const target = id ? this.editors.find((e) => e.id === id) : undefined;
        if (target) this.detach(target);
        else if (editor) this.detach(editor as EditorModel);
    }

    /** Compat shim — detach + dispose. Used when the user explicitly closes a panel. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async removeSecondaryView(editor: any): Promise<void> {
        const id = editor?.state?.get?.()?.id ?? editor?.id;
        const target = id ? this.editors.find((e) => e.id === id) : undefined;
        if (target) {
            this.detach(target);
            await target.dispose();
        } else if (editor) {
            this.detach(editor as EditorModel);
            await (editor as EditorModel).dispose();
        }
    }

    /** Compat shim — find a secondary view by its id. */
    findSecondaryView(editorId: string): EditorModel | undefined {
        return this.panelEditors.find((e) => e.id === editorId);
    }

    /**
     * Slice-subscription handler from `attach()`. Fires when the editor's
     * `secondaryView` slice changes (panel list flips). Bumps version and
     * enforces the visibility criterion.
     */
    onEditorPanelsChanged(editor: EditorModel): void {
        this.state.update((s) => {
            s.version++;
            s.hasSidebar = this.hasSidebar;
        });
        this._enforceMandatoryOpen();
        if (!this.editors.includes(editor)) return;
        if (editor.id !== this._mainEditorId && !editor.contributesPanels()) {
            this.detach(editor);
            setTimeout(async () => {
                await editor.dispose();
            }, 0);
        }
    }

    // ── Main editor swap ───────────────────────────────────────────────

    /**
     * Replace (or clear) the main editor. Handles lifecycle:
     *  - calls beforeNavigateAway on the old main
     *  - attaches new editor if not already present
     *  - sets _mainEditorId
     *  - fires notifyMainEditorChanged
     *  - applies visibility criterion to the old main (detach + dispose if no panels)
     *  - compare-mode cleanup: exits compare for the pair if new main's host
     *    isn't TextFileModel.
     */
    async setMainEditor(newEditor: EditorModel | null): Promise<void> {
        const oldMain = this.mainEditorInstance;
        if (oldMain && newEditor && oldMain !== newEditor) {
            oldMain.beforeNavigateAway(newEditor);
        }
        if (newEditor && !this.editors.includes(newEditor)) {
            this.attach(newEditor);
        }
        this._mainEditorId = newEditor?.id ?? null;
        this.state.update((s) => { s.mainEditorId = this._mainEditorId; });

        let editorToDispose: EditorModel | null = null;
        const idTransferred = !!(oldMain && newEditor && oldMain.id === newEditor.id);
        // Survival criteria: panel contributors demote to the sidebar; a
        // keep-alive editor (busy Board, US-799) stays attached as an invisible
        // ownership handle. Everything else is detached + disposed.
        if (
            oldMain &&
            oldMain !== newEditor &&
            !oldMain.contributesPanels() &&
            !oldMain.keepAliveOnNavigation()
        ) {
            this.detach(oldMain);
            editorToDispose = oldMain;
        }

        this.notifyMainEditorChanged();

        // CK7: compare-mode cleanup. If this page is in a compare pair and
        // the new main's host isn't TextFileModel, exit compare.
        if (newEditor) {
            try {
                const { pagesModel } = await import("../pages");
                const inPair = pagesModel.query.isInCompareMode(this.id);
                if (inPair.active && !pagesModel.query.getTextFileHost(this.id)) {
                    pagesModel.layout.exitCompareMode(this.id);
                }
            } catch {
                // PagesModel not yet ready; ignore.
            }
        }

        if (editorToDispose) {
            const editor = editorToDispose;
            setTimeout(async () => {
                await editor.dispose();
                if (!idTransferred) {
                    await fs.deleteCacheFiles(editor.id);
                }
            }, 0);
        }
    }

    async switchMainEditor(newEditorId: string): Promise<void> {
        const oldEditor = this.mainEditorInstance;
        if (!oldEditor) return;
        if (oldEditor.editorId === newEditorId) return;

        // A board editor (either side) has no shared content host to hand over via
        // `switchFrom`, so a board-boundary switch confirms release of the old editor
        // (CE4) and rebuilds the target FRESH over the file (dispose-and-rebuild). The
        // board writes the file directly, so a rebuilt built-in reads current disk
        // content — no stale-cache handling needed.
        const newBoardRoot = parseBoardEditorId(newEditorId);
        const boardInvolved =
            newBoardRoot !== null
            || parseBoardEditorId(oldEditor.editorId) !== null;
        if (boardInvolved) {
            const { editorRegistry } = await import("../../editors/base");
            // A content-host board (EPIC-043) transfers the shared host like Monaco↔Grid;
            // a simple board (EPIC-042) has no host and dispose-and-rebuilds. Determine the
            // NEW board's kind from the registry (a plain built-in is host-capable iff it
            // declares `hasContentHost`).
            let newBoardKind: "simple" | "content-host" | undefined;
            if (newBoardRoot !== null) {
                const { customEditorRegistry } = await import(
                    "../../editors/board/custom-editor-registry"
                );
                newBoardKind =
                    customEditorRegistry.entries.find((e) => e.editorId === newEditorId)
                        ?.editorKind ?? "simple";
            }
            const oldHostCapable = !!oldEditor.contentHost;
            const newHostCapable =
                newBoardRoot !== null
                    ? newBoardKind === "content-host"
                    : !!editorRegistry.getById(newEditorId)?.hasContentHost;

            if (oldHostCapable && newHostCapable) {
                // Host-transfer switch — no reload, no confirmRelease (nothing is lost).
                let newEditor: EditorModel;
                if (newBoardRoot !== null) {
                    const { getDefaultBoardEditorState } = await import("../../editors/board");
                    const { BoardContentEditorModel } = await import(
                        "../../editors/board/BoardContentEditorModel"
                    );
                    const filePath =
                        (oldEditor.contentHost as { filePath?: string } | null)?.filePath
                        ?? oldEditor.filePath;
                    const model = new BoardContentEditorModel(
                        new TComponentState(getDefaultBoardEditorState()),
                    );
                    model.initFromBoardRoot(newBoardRoot, filePath ?? undefined);
                    newEditor = model as unknown as EditorModel;
                } else {
                    newEditor = await editorRegistry.createEditor(newEditorId);
                }
                newEditor.switchFrom(oldEditor); // extracts + adopts the shared host
                await newEditor.restore();
                await this.setMainEditor(newEditor);
                return;
            }

            // Simple board (either direction) — dispose-and-rebuild + confirmRelease (EPIC-042).
            const filePath =
                (oldEditor.contentHost as { filePath?: string } | null)?.filePath
                ?? oldEditor.filePath;
            if (!filePath) return;
            const released = await oldEditor.confirmRelease();
            if (!released) return; // Cancel → stay on the current editor
            const { pagesModel } = await import("../pages");
            const { attachEditorToPage } = await import("./PagesLifecycleModel");
            const built = await pagesModel.lifecycle.createEditorFromFile(
                filePath,
                undefined,
                newEditorId,
            );
            // Honor an explicit built-in target that differs from the file's natural
            // resolveId (mirrors openFile / navigatePageTo); no-op for board targets.
            if (
                built.state.get().type === "textFile"
                && parseBoardEditorId(newEditorId) === null
            ) {
                built.state.update((s) => {
                    (s as { editor?: string }).editor = newEditorId;
                });
            }
            await this.setMainEditor(attachEditorToPage(built));
            return;
        }

        const { editorRegistry } = await import("../../editors/base");
        const def = editorRegistry.getById(newEditorId);
        if (!def) {
            throw new Error(`No editor registered for id: ${newEditorId}`);
        }
        const newEditor = await editorRegistry.createEditor(newEditorId);
        newEditor.switchFrom(oldEditor);
        await newEditor.restore();
        await this.setMainEditor(newEditor);
    }

    /**
     * Notify every editor (except the new main) that the main editor changed.
     * Editors may react — e.g., ArchiveEditor self-evicts when the new main
     * wasn't opened from its archive.
     */
    notifyMainEditorChanged(): void {
        const main = this.mainEditorInstance;
        for (const editor of [...this.editors]) {
            if (editor === main) continue;
            editor.onMainEditorChanged(main);
        }
        // Some editors may have cleared their secondaryView during the
        // notification — their slice subscriptions will fire detach via
        // onEditorPanelsChanged.
    }

    /** Compat alias kept for legacy code that called `promoteSecondaryToMain`.
     *  Just delegates to `setMainEditor` (Pattern B inexpressible). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async promoteSecondaryToMain(model: any): Promise<void> {
        const id = model?.id ?? model?.state?.get?.()?.id;
        const target = id ? this.editors.find((e) => e.id === id) : null;
        if (this._mainEditorId === id) {
            await this.setMainEditor(null);
        } else if (target) {
            await this.setMainEditor(target);
        }
    }

    // ── Sidebar / SecondaryViews ────────────────────────────────────────

    /**
     * Owner-provided controlled setState for the SecondaryViews component.
     * The single side-effecting entry point: merges the patch into the sidebar
     * model and fires the matching effects — onPanelExpanded + panelExpanded on
     * activePanel change, secondaryViewsToggled on open change. Width is clamped.
     */
    setSecondaryViewsState = (patch: Partial<ISecondaryViewsState>): void => {
        // Mandatory-open clamp: ignore close requests while a non-Explorer panel
        // is present (width / activePanel still apply).
        if (patch.open === false && this.sidebarMandatory) {
            patch = { ...patch, open: true };
        }
        const nav = this.ensureSecondaryViewsModel();
        const prev = nav.state.get();
        nav.state.update((s) => {
            if (patch.open !== undefined) s.open = patch.open;
            if (patch.width !== undefined) s.width = Math.max(120, patch.width);
            if (patch.activePanel !== undefined) s.activePanel = patch.activePanel;
        });
        if (patch.activePanel !== undefined && patch.activePanel !== prev.activePanel) {
            this._activePanel = patch.activePanel;
            // Side effects use the BARE panel id (the composite key carries the
            // owning editor id). Resolve the owner by id first, then fall back to
            // a panel-type match for a bare/seed value (US-619).
            const { editorId, panelId } = parsePanelKey(patch.activePanel);
            const owner = this.editors.find((e) => e.id === editorId)
                ?? this.editors.find((e) => e.secondaryView?.includes(panelId));
            owner?.onPanelExpanded(panelId);
            panelExpanded.send({ pageId: this.id, panelId });
        }
        if (patch.open !== undefined && patch.open !== prev.open) {
            secondaryViewsToggled.send({ pageId: this.id, isOpen: patch.open });
        }
    };

    /** Set the active panel. Delegates to the controlled setState (which fires
     *  onPanelExpanded + panelExpanded). */
    setActivePanel(panel: string): void {
        this.setSecondaryViewsState({ activePanel: panel });
    }

    /** Expand a secondary panel. Accepts a BARE panel-type id (resolved to the
     *  owning editor's composite key) or an already-composite key (passed
     *  through). Models call this with their bare panel id; since every current
     *  multi-instance concern (`git-changes`) has no `expandPanel` caller, the
     *  first-owner resolution is unambiguous in practice. A future multi-owner
     *  panel that calls `expandPanel` should pass the composite key (US-619). */
    expandPanel(panelId: string): void {
        if (!panelId) return;
        if (isCompositePanelKey(panelId)) {
            this.setActivePanel(panelId);
            return;
        }
        const owner = this.editors.find((e) => e.secondaryView?.includes(panelId));
        if (!owner) return;
        this.setActivePanel(panelKey(owner.id, panelId));
    }

    /** Force the sidebar open when a non-Explorer panel is present, and
     *  auto-initialize the Explorer panel for a panel editor opened from local
     *  disk. Called from the lifecycle points that recompute `hasSidebar`
     *  (attach / detach / onEditorPanelsChanged) so opening a Link/Archive/etc.
     *  editor force-opens the sidebar even on the initial attach.
     *  `setStateQuiet` avoids re-firing `secondaryViewsToggled`; the model's own
     *  subscription bumps version. */
    private _enforceMandatoryOpen(): void {
        if (this.sidebarMandatory) {
            this.ensureSecondaryViewsModel().setStateQuiet({ open: true });
        }
        this._maybeAutoInitExplorer();
        this._enforceActivePanelExpanded();
    }

    /** Invariant: whenever the sidebar has panels, exactly one is expanded — no
     *  empty sidebar space. If the current `activePanel` doesn't resolve to a
     *  present panel (e.g. the seed "explorer" on a page with no Explorer, or the
     *  previously-active panel's editor was detached), expand the first available
     *  panel. `panelEditors` orders Explorer first, so an Explorer (when present)
     *  is preferred; otherwise the next panel (Link/Mneme/…) is expanded.
     *  No-op when there are no panels — leaving the seed untouched so a last-panel
     *  detach doesn't resurrect the sidebar. */
    private _enforceActivePanelExpanded(): void {
        const panels: { key: string; panelId: string }[] = [];
        for (const e of this.panelEditors) {
            const views = (e.state.get() as { secondaryView?: string[] }).secondaryView ?? [];
            for (const pId of views) panels.push({ key: panelKey(e.id, pId), panelId: pId });
        }
        if (!panels.length) return; // no panels — nothing to keep expanded

        const active = parsePanelKey(this.activePanel);
        const resolves = active.editorId
            ? panels.some((p) => p.key === this.activePanel)
            : panels.some((p) => p.panelId === active.panelId);
        if (resolves) return;

        this.setActivePanel(panels[0].key);
    }

    /** When the sidebar is mandatory (a panel editor like Links is present) and
     *  there is no Explorer yet, auto-create one rooted at the panel editor's
     *  file folder — restoring the pre-mandatory-sidebar affordance where the
     *  user could toggle a file-folder Explorer alongside the panels. Deferred
     *  to a microtask + guarded by `findExplorer()` so a persisted Explorer
     *  re-attached during session restore is never duplicated (all restore
     *  attaches run synchronously before the microtask fires). */
    private _autoInitExplorerQueued = false;

    private _maybeAutoInitExplorer(): void {
        if (this._autoInitExplorerQueued) return;
        if (!this.sidebarMandatory) return;
        if (this.findExplorer()) return;
        if (!this._explorerRootForPanels()) return;
        this._autoInitExplorerQueued = true;
        queueMicrotask(() => {
            this._autoInitExplorerQueued = false;
            void this._autoInitExplorer();
        });
    }

    /** Derive the Explorer root folder from the first panel-contributing editor
     *  exposing a local-file navigator target (Link/Todo/Notebook/…). Returns
     *  "" when none has a file target (e.g. an unsaved collection). */
    private _explorerRootForPanels(): string {
        for (const e of this.editors) {
            if (!e.contributesPanels()) continue;
            const target = e.getNavigatorTarget();
            if (!target) continue;
            if (target.pipe?.provider.type === "file" && target.pipe.provider.sourceUrl) {
                return fpDirname(target.pipe.provider.sourceUrl);
            }
            if (target.filePath) {
                return fpDirname(target.filePath);
            }
        }
        return "";
    }

    private async _autoInitExplorer(): Promise<void> {
        if (this.findExplorer()) return;
        if (!this.sidebarMandatory) return;
        const rootPath = this._explorerRootForPanels();
        if (!rootPath) return;
        const state = new TComponentState({
            ...getDefaultExplorerEditorState(),
            rootPath,
        });
        const explorer = new ExplorerEditor(state);
        this.attach(explorer);
        await explorer.restore();
    }

    // ── Explorer helpers ─────────────────────────────────────────────

    /** Find the Explorer in editors[]. */
    findExplorer(): EditorModel | undefined {
        return this.editors.find(
            (m) => (m.state.get() as { type?: string }).type === "fileExplorer",
        );
    }

    // ── SecondaryViewsModel ───────────────────────────────────────────

    /** Lazy-create SecondaryViewsModel on first access. */
    ensureSecondaryViewsModel(): SecondaryViewsModel {
        if (!this.secondaryViewsModel) {
            this.secondaryViewsModel = new SecondaryViewsModel();
            // Carry the current activePanel seed into the new model.
            this.secondaryViewsModel.setStateQuiet({ activePanel: this._activePanel });
            // Bump version so UI knows sidebar exists. Persistence subscription
            // is in PagesModel.attachPage — it watches page.state for save
            // triggers, so navigator mutations ride the same channel.
            this.secondaryViewsModel.state.subscribe(() => {
                this.state.update((s) => { s.version++; });
            });
            this.state.update((s) => { s.hasSidebar = true; });
        }
        return this.secondaryViewsModel;
    }

    // ── Navigator toggle ─────────────────────────────────────────────

    /** Toggle the SecondaryViews panel. Creates ExplorerEditorModel if needed. */
    async toggleNavigator(pipe?: IContentPipe | null, filePath?: string): Promise<void> {
        const existing = this.findExplorer();
        if (existing || this.secondaryViewsModel) {
            const open = this.ensureSecondaryViewsModel().state.get().open;
            this.setSecondaryViewsState({ open: !open });
            return;
        }

        let rootPath = "";
        if (pipe?.provider.type === "file" && pipe.provider.sourceUrl) {
            rootPath = fpDirname(pipe.provider.sourceUrl);
        } else if (filePath) {
            rootPath = fpDirname(filePath);
        }
        if (!rootPath) return;

        const state = new TComponentState({
            ...getDefaultExplorerEditorState(),
            rootPath,
        });
        const explorer = new ExplorerEditor(state);
        this.attach(explorer);
        await explorer.restore();

        this.setSecondaryViewsState({ open: true });
    }

    /** Whether the navigator can be opened. */
    canOpenNavigator(pipe?: IContentPipe | null, filePath?: string): boolean {
        if (this.findExplorer()) return true;
        if (this.secondaryViewsModel) return true;
        if (pipe?.provider.type === "file") return true;
        if (filePath) return true;
        return false;
    }

    // ── Close ────────────────────────────────────────────────────────

    /**
     * Close this page (tab). Iterates panel-contributing editors first, then
     * the main editor (walkthrough 03 / N7). Cancellation on any modified
     * editor aborts the close while leaving the page visible.
     */
    async close(): Promise<boolean> {
        // Panel-contributing editors first.
        for (const editor of this.editors) {
            if (editor.id === this._mainEditorId) continue;
            if (!editor.modified) continue;
            const released = await editor.confirmRelease();
            if (!released) return false;
        }
        // Main editor last — closing it commits to closing the page tab.
        const main = this.mainEditor;
        if (main && main.modified) {
            const released = await main.confirmRelease();
            if (!released) return false;
        }
        this.onClose?.();
        return true;
    }

    // ── Persistence ──────────────────────────────────────────────────

    /**
     * Build the page's serialized descriptor (walkthrough 04 / C7 +
     * walkthrough 08 / T3). Consumed by PagesPersistenceModel.saveState,
     * PageTab.getDragData, and PagesLifecycleModel.duplicatePage.
     */
    getDescriptor(): PageDescriptor {
        const navState = this.secondaryViewsModel?.state.get();
        return {
            id: this.id,
            pinned: this.pinned,
            modified: this.modified,
            mainEditorId: this._mainEditorId,
            editors: this.editors.map((e) => e.getRestoreData()),
            sidebar: this.secondaryViewsModel
                ? {
                    open: navState?.open ?? true,
                    width: navState?.width ?? 240,
                    activePanel: this.activePanel,
                }
                : undefined,
            navBack: this._navBack.length ? [...this._navBack] : undefined,
        };
    }

    /** Compat shim used by PagesPersistenceModel's v3 restore path. */
    setMainEditorId(id: string | null): void {
        this._mainEditorId = id;
        this.state.update((s) => { s.mainEditorId = id; });
    }

    /** Flush per-editor caches. Awaitable. Window-level descriptor is
     *  written by PagesPersistenceModel.saveState separately. */
    async saveState(): Promise<void> {
        await Promise.all(this.editors.map((e) => e.saveState?.()));
    }

    // ── Cleanup ──────────────────────────────────────────────────────

    async dispose(): Promise<void> {
        // Defensively drain slice subscriptions.
        for (const unsub of this._editorSubs.values()) unsub();
        this._editorSubs.clear();

        for (const editor of this.editors) {
            editor.setPage(null);
            await editor.dispose();
            await fs.deleteCacheFiles(editor.id);
        }
        this.editors.length = 0;
        this._mainEditorId = null;

        this.secondaryViewsModel?.dispose();
        this.secondaryViewsModel = null;
        // No page-level cache file; per-editor caches were cleaned in the
        // loop above.
    }
}
