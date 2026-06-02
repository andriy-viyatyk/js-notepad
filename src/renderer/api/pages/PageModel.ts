import { TComponentState, TOneState } from "../../core/state/state";
import type { EditorModel, EditorOrHost } from "../../editors/base";
import { ExplorerEditor, getDefaultExplorerEditorState } from "../../editors/explorer";
import type { PageDescriptor } from "../../../shared/persistence";
import { SecondaryViewsModel, ISecondaryViewsState } from "../../ui/secondary-views/SecondaryViewsModel";
import type { IPageHost } from "./IPageHost";
import type { IContentPipe } from "../types/io.pipe";
import { fs } from "../fs";
import { secondaryViewsToggled, panelExpanded } from "../../core/state/events";
import { fpDirname } from "../../core/utils/file-path";

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

export interface NavigationState {
    /** Currently selected item href (shared between SecondaryViews and secondary views). */
    selectedHref: string | null;
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
}

const defaultPageState: IPageState = {
    pinned: false,
    mainEditorId: null,
    version: 0,
    hasSidebar: false,
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
        // Adjust activePanel if it pointed to a panel this editor owned.
        const panels = editor.secondaryView;
        if (panels?.includes(this.activePanel) || this.activePanel === editor.id) {
            this.activePanel = "explorer";
        }
        this.state.update((s) => {
            s.version++;
            s.hasSidebar = this.hasSidebar;
        });
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
        if (oldMain && oldMain !== newEditor && !oldMain.contributesPanels()) {
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
        const nav = this.ensureSecondaryViewsModel();
        const prev = nav.state.get();
        nav.state.update((s) => {
            if (patch.open !== undefined) s.open = patch.open;
            if (patch.width !== undefined) s.width = Math.max(120, patch.width);
            if (patch.activePanel !== undefined) s.activePanel = patch.activePanel;
        });
        if (patch.activePanel !== undefined && patch.activePanel !== prev.activePanel) {
            this._activePanel = patch.activePanel;
            const owner = this.editors.find((e) => e.secondaryView?.includes(patch.activePanel));
            owner?.onPanelExpanded(patch.activePanel);
            panelExpanded.send({ pageId: this.id, panelId: patch.activePanel });
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

    /** Expand a secondary panel by its panel ID. Called by secondary views directly. */
    expandPanel(panelId: string): void {
        if (!panelId) return;
        if (!this.editors.some((e) => e.secondaryView?.includes(panelId))) return;
        this.setActivePanel(panelId);
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
