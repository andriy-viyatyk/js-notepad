import type { TOneState } from "../../core/state/state";
import type { EditorModel, EditorOrHost } from "../../editors/base";
import type { IContentPipe } from "../types/io.pipe";
import type { ISecondaryViewsState, SecondaryViewsModel } from "../../ui/secondary-views/SecondaryViewsModel";
import type { IPageState } from "./PageModel";

/**
 * The editor↔owner contract that `EditorModel.page` is typed as. `PageModel`
 * implements it in full; a future `BrowserPanelHost` (US-601) implements the
 * required members and omits the optional main-editor-navigation group.
 *
 * The required core (identity, reactive state, panels/sidebar, transient store)
 * is shared by every host. The optional members are main-editor navigation — a
 * host that never swaps a main editor (e.g. the Browser empty page) omits them,
 * and call sites reach them through optional chaining (`editor.page?.foo?.()`).
 */
export interface IPageHost {
    // identity + reactive page state
    readonly id: string;
    readonly state: TOneState<IPageState>;

    // panels / sidebar — every host has panels
    panelEditors: EditorModel[];
    activePanel: string;
    hasSidebar: boolean;
    expandPanel(panelId: string): void;
    setActivePanel(panel: string): void;
    setSecondaryViewsState(patch: Partial<ISecondaryViewsState>): void;
    secondaryViewsModel: SecondaryViewsModel | null;
    ensureSecondaryViewsModel(): SecondaryViewsModel;
    canOpenNavigator(pipe?: IContentPipe | null, filePath?: string): boolean;
    toggleNavigator(pipe?: IContentPipe | null, filePath?: string): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeSecondaryView(editor: any): Promise<void>;

    // transient store (survives navigation, cleared on close)
    getTransient<T>(key: string): T | undefined;
    setTransient(key: string, value: unknown): void;

    // ── OPTIONAL — page-tab property (an embedded host isn't a pinnable tab) ──
    pinned?: boolean;

    // ── OPTIONAL — main-editor navigation (a Browser host omits these).
    //    Membership FINAL as of US-600 (Link exercised the full surface): every
    //    member below has a live `editor.page?.…` caller. `setMainEditor`/`close`
    //    were trimmed — they are only ever called via the concrete `pagesModel`,
    //    never through `editor.page`. ──
    mainEditor?: EditorOrHost | null;
    mainEditorInstance?: EditorModel | null;
    switchMainEditor?(newEditorId: string): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    promoteSecondaryToMain?(editor: any): Promise<void>;
}
