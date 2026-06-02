import { TComponentState } from "../../core/state/state";

// =============================================================================
// Types
// =============================================================================

export interface ISecondaryViewsState {
    open: boolean;
    width: number;
    activePanel: string;
}

const DEFAULT_WIDTH = 240;

// =============================================================================
// Model
// =============================================================================

/**
 * SecondaryViewsModel — reactive state for the SecondaryViews sidebar.
 *
 * Pure layout-state container: open/close, width, and the active panel ID.
 * All mutation carrying side effects (panelExpanded / secondaryViewsToggled,
 * onPanelExpanded notification) goes through the owner's controlled setState
 * (PageModel.setSecondaryViewsState) — this model only holds state.
 * Persistence is owned by PageModel (not this model).
 */
export class SecondaryViewsModel {
    state: TComponentState<ISecondaryViewsState>;

    constructor() {
        this.state = new TComponentState<ISecondaryViewsState>({
            open: true,
            width: DEFAULT_WIDTH,
            activePanel: "explorer",
        });
    }

    /** Set state without triggering side effects. Used by PageModel restore + ensure-seed. */
    setStateQuiet(s: Partial<ISecondaryViewsState>): void {
        const current = this.state.get();
        this.state.set({
            open: s.open ?? current.open,
            width: s.width ?? current.width,
            activePanel: s.activePanel ?? current.activePanel,
        });
    }

    dispose = () => {};
}
