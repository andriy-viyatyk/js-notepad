import { TComponentState, TOneState } from "../../core/state/state";
import { type EditorModel as V4EditorModel } from "../../editors/base/v4";
import type { TextFileModel } from "../../editors/text/TextEditorModel";

/**
 * Post-US-559 type alias used in `mainEditor` return signature. The legacy
 * `EditorModel` base was deleted; `mainEditor` returns either the v4 editor
 * itself (no-host editors) or its content host (TextFileModel for text-bearing
 * editors). Modeled as the explicit union — callers narrow via `isTextFileModel`
 * or by reading state fields duck-typed across both branches.
 */
type LegacyEditorModel = V4EditorModel | TextFileModel;
import { ExplorerEditor, getDefaultExplorerEditorState } from "../../editors/explorer";
import type { PageDescriptor } from "../../../shared/persistence-v4";
import { PageNavigatorModel } from "../../ui/navigation/PageNavigatorModel";
import type { IContentPipe } from "../types/io.pipe";
import { fs } from "../fs";
import { pageNavigatorToggled, panelExpanded } from "../../core/state/events";
import { fpDirname } from "../../core/utils/file-path";

/**
 * Surface returned by `PageModel.mainEditor`. Post-US-559: returns the
 * TextFileModel content host for text-bearing v4 editors, or the v4 editor
 * itself for no-host editors. Legacy `EditorModel` typing kept as an alias
 * so consumers that do `instanceof TextFileModel` keep working — Phase 3b
 * folds the legacy base into TextFileModel and retypes consumers.
 */
type EditorModel = LegacyEditorModel;

function unwrapAdapter(editor: V4EditorModel | null): LegacyEditorModel | null {
    if (!editor) return null;
    // For text-bearing editors the content host IS a TextFileModel — return
    // it so legacy consumers (tab strip, OpenTabsList, PageTabs) see
    // filePath / language / encrypted / etc.
    const host = (editor as { contentHost?: { type?: string } | null }).contentHost;
    if (host && host.type === "textFile") {
        return host as unknown as LegacyEditorModel;
    }
    // No content host (or non-textFile host) — return the v4 editor cast as
    // legacy. Consumers reading legacy-shape fields will see undefined; their
    // per-editor migrations replaced those reads with v4-aware paths.
    return editor as unknown as LegacyEditorModel;
}

export interface NavigationState {
    /** Currently selected item href (shared between PageNavigator and secondary editors). */
    selectedHref: string | null;
}

/** Reactive page-level state — UI subscribes to this for re-render on page changes. */
export interface IPageState {
    /** Page-level pinned flag. */
    pinned: boolean;
    /** Current main editor ID — changes on navigation, triggers re-render for editor swap. */
    mainEditorId: string | null;
    /** Bumped whenever `editors[]` changes (attach/detach) or an editor's panel-list
     *  flips. Drives PageNavigator re-render and the per-page persistence
     *  subscription's editor-membership reconciliation. */
    version: number;
    /** Whether the sidebar (PageNavigatorModel) exists. Kept for backward compat
     *  with existing UI; equivalent to `hasSidebar` getter. */
    hasSidebar: boolean;
}

const defaultPageState: IPageState = {
    pinned: false,
    mainEditorId: null,
    version: 0,
    hasSidebar: false,
};

/**
 * PageModel — one per tab. Stable identity that survives navigation.
 *
 * Unified-array shape (EPIC-028 / US-548). Replaces the legacy
 * `_mainEditor: EditorModel | null` + `secondaryEditors: EditorModel[]`
 * dual-field design. An editor's role is now described by two derived flags:
 *
 *   - "is main" — `editor.id === _mainEditorId`
 *   - "contributes panels" — `editor.contributesPanels()` (read from
 *     `editor.state.secondaryEditor.length > 0`)
 *
 * Visibility criterion (walkthrough 01 / A8): an editor is kept in `editors[]`
 * iff `(editor.id === _mainEditorId) || editor.contributesPanels()`. The slice
 * subscription wired in `attach()` (walkthrough 03 / N1) enforces this on
 * every panel-list change.
 *
 * Pattern B (same model as both main and secondary, historically used by
 * ArchiveFileModel during demote) is inexpressible — a model has exactly one
 * membership in `editors[]`, with separate role flags.
 */
export class PageModel {
    /** Stable page UUID — tab identity, React key, cache key. Never changes. */
    readonly id: string;

    /** Reactive page-level state. UI uses `page.state.use()` for re-render. */
    readonly state = new TOneState<IPageState>({ ...defaultPageState });

    /**
     * All editors attached to this page. Order matches sidebar panel order.
     * One of these may also be the main editor (flagged by `_mainEditorId`).
     * Holds v4 EditorModel instances (LegacyEditorAdapter or future natives).
     */
    readonly editors: V4EditorModel[] = [];

    /**
     * Which editor in `editors[]` is the main (content area). Null = no main;
     * page is sidebar-only (explorer-only, archive-root, link-collection).
     */
    private _mainEditorId: string | null = null;

    /** Close callback — set by PagesModel.attachPage(). */
    onClose?: () => void;

    // ── Sidebar state ─────────────────────────────────────────────────

    /** Sidebar model — pure reactive state (open/close/width). */
    pageNavigatorModel: PageNavigatorModel | null = null;
    /** Which panel is currently active/expanded.
     *  Values: "explorer", "search", or a secondary panel ID. */
    activePanel = "explorer";

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

    /** Returns the unwrapped legacy editor (auto-unwraps LegacyEditorAdapter)
     *  so existing `editor instanceof X` call sites keep working. v4-aware
     *  callers access the adapter via `mainEditorV4` or by iterating `editors[]`. */
    get mainEditor(): EditorModel | null {
        return unwrapAdapter(this.mainEditorV4);
    }

    /** Legacy setter retained for backward compat. Prefer `setMainEditor`.
     *  Direct assignment skips lifecycle; used during restore. */
    set mainEditor(editor: V4EditorModel | EditorModel | null) {
        const v4 = editor && !(editor as V4EditorModel).editorId
            // Bare legacy editor — caller should wrap. Best-effort: reject.
            ? null
            : (editor as V4EditorModel | null);
        if (v4 && !this.editors.includes(v4)) {
            this.attach(v4);
        }
        this._mainEditorId = v4?.id ?? null;
        this.state.update((s) => { s.mainEditorId = v4?.id ?? null; });
    }

    /** v4 surface of the main editor. Returns the adapter (or future v4-native). */
    get mainEditorV4(): V4EditorModel | null {
        if (!this._mainEditorId) return null;
        return this.editors.find((e) => e.id === this._mainEditorId) ?? null;
    }

    /** Editors that currently contribute panels (subset of `editors[]`).
     *  Returns v4 editors cast as the legacy alias. All sidebar-owning
     *  editors (US-555 Link, US-570 Archive, US-567 Explorer, US-576 Category)
     *  are v4-native, so their panel state lives on the v4 editor and
     *  `instanceof` checks resolve against the v4 class. */
    get panelEditors(): EditorModel[] {
        const editors = this.editors
            .filter((e) => e.contributesPanels())
            .map((e) => e as unknown as EditorModel);
        // Explorer panel always renders first (original design). The Explorer
        // editor is lazily attached AFTER content editors when the user toggles
        // the navigator, so it would otherwise sort last. Stable-sort the
        // explorer-contributing editor to the front; Array.sort is stable, so
        // all other editors keep their attach order.
        const explorerRank = (e: EditorModel) =>
            ((e.state.get() as { secondaryEditor?: string[] }).secondaryEditor ?? [])
                .includes("explorer") ? 0 : 1;
        return editors.sort((a, b) => explorerRank(a) - explorerRank(b));
    }

    /** v4 surface of the panel editors. */
    get panelEditorsV4(): V4EditorModel[] {
        return this.editors.filter((e) => e.contributesPanels());
    }

    /** Compat shim — legacy code reads `page.secondaryEditors`. Returns the
     *  same set as `panelEditors` (unwrapped). Retired in US-559. */
    get secondaryEditors(): EditorModel[] {
        return this.panelEditors;
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
        return this.mainEditorV4?.title ?? "Empty";
    }

    /** Aggregate modified flag: true if any editor in `editors[]` is modified. */
    get modified(): boolean {
        return this.editors.some((e) => e.modified);
    }

    /** Whether this page has an active sidebar. */
    get hasSidebar(): boolean {
        return this.editors.some((e) => e.contributesPanels()) || this.pageNavigatorModel !== null;
    }

    // ── Membership primitives ─────────────────────────────────────────

    /** Add an editor to `editors[]`. No-op if already present.
     *
     *  Walkthrough 03 / N1: subscribes to the editor's `secondaryEditor` slice
     *  via the TOneState selector overload. The handler fires only when the
     *  panel list reference changes; visibility criterion enforced in
     *  `onEditorPanelsChanged`. */
    attach(editor: V4EditorModel): void {
        if (this.editors.includes(editor)) return;
        this.editors.push(editor);
        editor.setPage(this);
        // EPIC-028 / US-551 — when a host transfers between editors (e.g.,
        // monaco ↔ md-view), the successor's id equals the predecessor's id.
        // Clean up any prior slice subscription for this id before our set()
        // would silently drop it.
        const prior = this._editorSubs.get(editor.id);
        prior?.();
        const unsub = editor.state.subscribe(
            () => this.onEditorPanelsChanged(editor),
            (s) => (s as { secondaryEditor?: string[] }).secondaryEditor,
        );
        this._editorSubs.set(editor.id, unsub);
        this.state.update((s) => {
            s.version++;
            s.hasSidebar = this.hasSidebar;
        });
    }

    /** Remove an editor from `editors[]`. Does NOT dispose — caller decides.
     *  Used by visibility-criterion auto-detach and explicit user actions. */
    detach(editor: V4EditorModel): void {
        const idx = this.editors.indexOf(editor);
        if (idx < 0) return;
        this.editors.splice(idx, 1);
        // EPIC-028 / US-551 — when a host transfers between editors (e.g.,
        // monaco ↔ md-view), the successor's id equals the predecessor's id.
        // If another editor in editors[] still holds this id, skip the
        // _editorSubs cleanup and the _mainEditorId clear so we don't clobber
        // the successor's wiring.
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
        const panels = editor.secondaryEditor;
        if (panels?.includes(this.activePanel) || this.activePanel === editor.id) {
            this.activePanel = "explorer";
        }
        this.state.update((s) => {
            s.version++;
            s.hasSidebar = this.hasSidebar;
        });
    }

    /** Compat shim for legacy EditorModel.secondaryEditor setter side-effect.
     *  Accepts ANY editor (legacy or v4) — the legacy editor's setter passes
     *  itself, and we look up an existing adapter by id. Retired in US-559. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addSecondaryEditor(editor: any): void {
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
        if (editor) this.attach(editor as V4EditorModel);
    }

    /** Compat shim — detach without disposing. Retired in US-559. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeSecondaryEditorWithoutDispose(editor: any): void {
        const id = editor?.state?.get?.()?.id ?? editor?.id;
        const target = id ? this.editors.find((e) => e.id === id) : undefined;
        if (target) this.detach(target);
        else if (editor) this.detach(editor as V4EditorModel);
    }

    /** Compat shim — detach + dispose. Used when the user explicitly closes a panel. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async removeSecondaryEditor(editor: any): Promise<void> {
        const id = editor?.state?.get?.()?.id ?? editor?.id;
        const target = id ? this.editors.find((e) => e.id === id) : undefined;
        if (target) {
            this.detach(target);
            await target.dispose();
        } else if (editor) {
            this.detach(editor as V4EditorModel);
            await (editor as V4EditorModel).dispose();
        }
    }

    /** Compat shim — find a secondary editor by its id. Retired in US-559. */
    findSecondaryEditor(editorId: string): EditorModel | undefined {
        return this.panelEditors.find((e) => e.id === editorId);
    }

    /**
     * Slice-subscription handler from `attach()`. Fires when the editor's
     * `secondaryEditor` slice changes (panel list flips). Bumps version and
     * enforces the visibility criterion.
     */
    onEditorPanelsChanged(editor: V4EditorModel): void {
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
     *  - compare-mode cleanup (CK7): exits compare for the pair if new main's host
     *    isn't TextFileModel.
     */
    async setMainEditor(newEditor: V4EditorModel | null): Promise<void> {
        const oldMain = this.mainEditorV4;
        if (oldMain && newEditor && oldMain !== newEditor) {
            oldMain.beforeNavigateAway(newEditor);
        }
        if (newEditor && !this.editors.includes(newEditor)) {
            this.attach(newEditor);
        }
        this._mainEditorId = newEditor?.id ?? null;
        this.state.update((s) => { s.mainEditorId = this._mainEditorId; });

        let editorToDispose: V4EditorModel | null = null;
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

    /**
     * Switch the main editor to a different editor type.
     *
     * For US-548, adapter-wrapped editors throw on `switchFrom`. Real
     * view-switching for adapter-wrapped Monaco/Grid still goes through the
     * legacy `model.changeEditor(view)` path on the underlying TextFileModel
     * (host-preserving in-place mutation). Per-editor migrations US-551+
     * replace this with `createEditor → switchFrom → restore`.
     */
    async switchMainEditor(newEditorId: string): Promise<void> {
        const oldEditor = this.mainEditorV4;
        if (!oldEditor) return;
        if (oldEditor.editorId === newEditorId) return;
        const { editorRegistry } = await import("../../editors/base/v4");
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
        const main = this.mainEditorV4;
        for (const editor of [...this.editors]) {
            if (editor === main) continue;
            editor.onMainEditorChanged(main);
        }
        // Some editors may have cleared their secondaryEditor during the
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

    // ── Sidebar / PageNavigator ────────────────────────────────────────

    /** Set the active panel. Notifies the owning editor via onPanelExpanded(). */
    setActivePanel(panel: string): void {
        this.activePanel = panel;
        this.state.update((s) => { s.version++; });
        const owner = this.editors.find((e) => e.secondaryEditor?.includes(panel));
        if (owner) {
            owner.onPanelExpanded(panel);
        }
        panelExpanded.send({ pageId: this.id, panelId: panel });
    }

    /** Expand a secondary panel by its panel ID. Called by secondary editors directly. */
    expandPanel(panelId: string): void {
        if (!panelId) return;
        if (!this.editors.some((e) => e.secondaryEditor?.includes(panelId))) return;
        this.setActivePanel(panelId);
    }

    // ── Explorer helpers ─────────────────────────────────────────────

    /** Find the Explorer in editors[] (unwrapped from `LegacyEditorAdapter`
     *  if present — Explorer is v4-native post-US-567 so the unwrap is usually
     *  a passthrough). */
    findExplorer(): EditorModel | undefined {
        const editor = this.editors.find(
            (m) => (m.state.get() as { type?: string }).type === "fileExplorer",
        );
        return unwrapAdapter(editor ?? null) ?? undefined;
    }

    // ── PageNavigatorModel ───────────────────────────────────────────

    /** Lazy-create PageNavigatorModel on first access. */
    ensurePageNavigatorModel(): PageNavigatorModel {
        if (!this.pageNavigatorModel) {
            this.pageNavigatorModel = new PageNavigatorModel(this.id);
            // Bump version so UI knows sidebar exists. Persistence subscription
            // is in PagesModel.attachPage — it watches page.state for save
            // triggers, so navigator mutations ride the same channel.
            this.pageNavigatorModel.state.subscribe(() => {
                this.state.update((s) => { s.version++; });
            });
            this.state.update((s) => { s.hasSidebar = true; });
        }
        return this.pageNavigatorModel;
    }

    // ── Navigator toggle ─────────────────────────────────────────────

    /** Toggle the PageNavigator panel. Creates ExplorerEditorModel if needed. */
    async toggleNavigator(pipe?: IContentPipe | null, filePath?: string): Promise<void> {
        const existing = this.findExplorer();
        if (existing || this.pageNavigatorModel) {
            this.ensurePageNavigatorModel().toggle();
            return;
        }

        let rootPath = "";
        if (pipe?.provider.type === "file" && pipe.provider.sourceUrl) {
            rootPath = fpDirname(pipe.provider.sourceUrl);
        } else if (filePath) {
            rootPath = fpDirname(filePath);
        }
        if (!rootPath) return;

        // EPIC-028 / US-567 / EX10 — inline Explorer construction; replaces
        // the deleted `createExplorer` helper. Same attach-before-restore
        // ordering as `PagesLifecycleModel.addEmptyPageWithNavPanel`.
        const state = new TComponentState({
            ...getDefaultExplorerEditorState(),
            rootPath,
        });
        const explorer = new ExplorerEditor(state);
        this.attach(explorer);
        await explorer.restore();

        this.ensurePageNavigatorModel();
        pageNavigatorToggled.send({ pageId: this.id, isOpen: true });
    }

    /** Whether the navigator can be opened. */
    canOpenNavigator(pipe?: IContentPipe | null, filePath?: string): boolean {
        if (this.findExplorer()) return true;
        if (this.pageNavigatorModel) return true;
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
        const navState = this.pageNavigatorModel?.state.get();
        return {
            id: this.id,
            pinned: this.pinned,
            modified: this.modified,
            mainEditorId: this._mainEditorId,
            editors: this.editors.map((e) => e.getRestoreData()),
            sidebar: this.pageNavigatorModel
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

        this.pageNavigatorModel?.dispose();
        this.pageNavigatorModel = null;
        // No page-level cache file in v4 (walkthrough 04 / P3); per-editor
        // caches were cleaned in the loop above.
    }
}
