import { TOneState } from "../../core/state/state";
import type { EditorModel } from "../base";
import type { IPageHost } from "../../api/pages/IPageHost";
import type { IPageState } from "../../api/pages/PageModel";
import { SecondaryViewsModel, ISecondaryViewsState } from "../../ui/secondary-views/SecondaryViewsModel";
import { panelExpanded } from "../../core/state/events";
import { panelKey, panelIdOf, isCompositePanelKey } from "../../ui/secondary-views/panel-key";
import type { LinkEditor } from "../link-editor";

const defaultPageState: IPageState = {
    pinned: false,
    mainEditorId: null,
    version: 0,
    hasSidebar: false,
    navBackCount: 0,
};

/**
 * BrowserPanelHost — a non-Page `IPageHost` (EPIC-029 Phase 2 / US-601).
 *
 * Owns the browser's bookmarks `LinkEditor` as its sole panel editor plus its
 * own `SecondaryViewsModel`, so the controlled `SecondaryViews` component can be
 * mounted in the browser empty page (`BlankPageLinks`) and the bookmarks drawer
 * (`BookmarksDrawer`) exactly like a Page mounts it.
 *
 * Differences from `PageModel`:
 *  - The sidebar is always mandatory-open (`sidebarMandatory: true`); `open`
 *    never toggles and is never persisted.
 *  - The embedded Link editor IS the host's main content — `mainEditorInstance`
 *    returns it, so `linkEditor.isMain === true` (Concern D). The main-editor
 *    SWAP members (`switchMainEditor` / `promoteSecondaryToMain`) are omitted —
 *    there is no main-editor navigation in the browser.
 *  - No Explorer auto-init (PageModel's mandatory-sidebar Explorer seeding is
 *    Page-only — the bookmarks sidebar shows only the three Link panels).
 *
 * Sidebar width is persisted in browser state via `onWidthChange` (Concern C);
 * `activePanel` restores for free through the LinkEditor HS1 `expandedPanel` slot.
 */
export class BrowserPanelHost implements IPageHost {
    readonly id = crypto.randomUUID();
    readonly state = new TOneState<IPageState>({ ...defaultPageState });

    secondaryViewsModel: SecondaryViewsModel | null = null;

    /** Notified when the sidebar width changes, so the owning browser model can
     *  persist it in browser state (US-601 Concern C). */
    onWidthChange?: (width: number) => void;

    private _editor: LinkEditor | null = null;
    private _editorSub: (() => void) | null = null;
    private _activePanel = "link-category";
    private _pendingWidth: number | undefined = undefined;
    private _transient = new Map<string, unknown>();

    // ── Membership ────────────────────────────────────────────────────────

    /** Attach the bookmarks Link editor. Wires the panel-slice subscription,
     *  points the editor at this host (which seeds its active panel from the
     *  restored `expandedPanel`), and force-opens the mandatory sidebar. */
    attach(editor: EditorModel): void {
        this._editor = editor as LinkEditor;
        editor.setPage(this);
        this._editorSub?.();
        this._editorSub = editor.state.subscribe(
            () => this.state.update((s) => { s.version++; s.hasSidebar = this.hasSidebar; }),
            (s) => (s as { secondaryView?: string[] }).secondaryView,
        );
        this.state.update((s) => { s.version++; s.hasSidebar = this.hasSidebar; });
        this.ensureSecondaryViewsModel().setStateQuiet({ open: true });
    }

    /** No-op: the browser never removes the bookmarks panel editor (kept to
     *  satisfy `IPageHost`). */
    async removeSecondaryView(): Promise<void> {}

    // ── Derived getters ─────────────────────────────────────────────────────

    get panelEditors(): EditorModel[] {
        return this._editor?.contributesPanels() ? [this._editor] : [];
    }

    get hasSidebar(): boolean {
        return !!this._editor?.contributesPanels();
    }

    get sidebarMandatory(): boolean {
        return true;
    }

    /** The embedded Link editor is the host's main content ⇒ `isMain === true`. */
    get mainEditorInstance(): EditorModel | null {
        return this._editor;
    }

    get activePanel(): string {
        return this.secondaryViewsModel?.state.get().activePanel ?? this._activePanel;
    }

    set activePanel(value: string) {
        this._activePanel = value;
        this.secondaryViewsModel?.setStateQuiet({ activePanel: value });
    }

    /** Bare panel-type id of the active composite key (US-619). */
    get activePanelId(): string {
        return panelIdOf(this.activePanel);
    }

    // ── SecondaryViews ───────────────────────────────────────────────────────

    /** Seed the initial sidebar width before `attach` creates the model
     *  (restored from browser state — US-601 Concern C). */
    setInitialWidth(width: number | undefined): void {
        this._pendingWidth = width;
        if (this.secondaryViewsModel && width) {
            this.secondaryViewsModel.setStateQuiet({ width });
        }
    }

    ensureSecondaryViewsModel(): SecondaryViewsModel {
        if (!this.secondaryViewsModel) {
            this.secondaryViewsModel = new SecondaryViewsModel();
            this.secondaryViewsModel.setStateQuiet({
                open: true,
                activePanel: this._activePanel,
                ...(this._pendingWidth ? { width: this._pendingWidth } : undefined),
            });
            this.secondaryViewsModel.state.subscribe(() => {
                this.state.update((s) => { s.version++; });
            });
            this.state.update((s) => { s.hasSidebar = true; });
        }
        return this.secondaryViewsModel;
    }

    /** Controlled setState for the `SecondaryViews` component. `open` is forced
     *  true (mandatory); width is clamped + mirrored to browser state; an
     *  activePanel change fires `onPanelExpanded` + the `panelExpanded` event
     *  (which drives the LinkBody breadcrumb/filter sync). */
    setSecondaryViewsState = (patch: Partial<ISecondaryViewsState>): void => {
        const nav = this.ensureSecondaryViewsModel();
        const prev = nav.state.get();
        let nextWidth: number | undefined;
        nav.state.update((s) => {
            s.open = true;
            if (patch.width !== undefined) { s.width = Math.max(120, patch.width); nextWidth = s.width; }
            if (patch.activePanel !== undefined) s.activePanel = patch.activePanel;
        });
        if (patch.activePanel !== undefined && patch.activePanel !== prev.activePanel) {
            this._activePanel = patch.activePanel;
            // Side effects use the BARE panel id (US-619).
            const panelId = panelIdOf(patch.activePanel);
            this._editor?.onPanelExpanded(panelId);
            panelExpanded.send({ pageId: this.id, panelId });
        }
        if (nextWidth !== undefined && nextWidth !== prev.width) {
            this.onWidthChange?.(nextWidth);
        }
    };

    setActivePanel(panel: string): void {
        this.setSecondaryViewsState({ activePanel: panel });
    }

    expandPanel(panelId: string): void {
        if (!panelId) return;
        if (isCompositePanelKey(panelId)) {
            this.setActivePanel(panelId);
            return;
        }
        if (!this._editor?.secondaryView?.includes(panelId)) return;
        this.setActivePanel(panelKey(this._editor.id, panelId));
    }

    // ── Navigator toggle (inert in the browser) ──────────────────────────────

    canOpenNavigator(): boolean {
        return false;
    }

    async toggleNavigator(): Promise<void> {}

    // ── Transient store ───────────────────────────────────────────────────────

    getTransient<T>(key: string): T | undefined {
        return this._transient.get(key) as T | undefined;
    }

    setTransient(key: string, value: unknown): void {
        if (value === undefined) this._transient.delete(key);
        else this._transient.set(key, value);
    }

    // ── Markdown back-navigation (inert — the browser has no main-editor nav) ──

    pushNavBack(): void {}

    popNavBack(): undefined {
        return undefined;
    }

    // ── Cleanup ─────────────────────────────────────────────────────────────

    dispose(): void {
        this._editorSub?.();
        this._editorSub = null;
        this._editor?.setPage(null);
        this._editor = null;
        this.secondaryViewsModel?.dispose();
        this.secondaryViewsModel = null;
    }
}
