import { TComponentState } from "../../core/state/state";
import { secondaryViewsToggled } from "../../core/state/events";

// =============================================================================
// Types
// =============================================================================

export interface SecondaryViewsState {
    open: boolean;
    width: number;
}

const DEFAULT_WIDTH = 240;

// =============================================================================
// Model
// =============================================================================

/**
 * SecondaryViewsModel — reactive state for the SecondaryViews sidebar.
 *
 * Pure layout container: open/close, width.
 * Persistence is owned by PageModel (not this model).
 */
export class SecondaryViewsModel {
    state: TComponentState<SecondaryViewsState>;

    constructor(private readonly pageId: string) {
        this.state = new TComponentState<SecondaryViewsState>({
            open: true,
            width: DEFAULT_WIDTH,
        });
    }

    /** Set state without triggering subscriptions. Used by PageModel.restoreSidebar(). */
    setStateQuiet(s: Partial<SecondaryViewsState>): void {
        const current = this.state.get();
        this.state.set({
            open: s.open ?? current.open,
            width: s.width ?? current.width,
        });
    }

    dispose = () => {};

    // ── State management ─────────────────────────────────────────────────

    setWidth = (width: number) => {
        this.state.update((s) => {
            s.width = Math.max(120, width);
        });
    };

    toggle = () => {
        this.state.update((s) => {
            s.open = !s.open;
        });
        secondaryViewsToggled.send({ pageId: this.pageId, isOpen: this.state.get().open });
    };

    close = () => {
        this.state.update((s) => {
            s.open = false;
        });
        secondaryViewsToggled.send({ pageId: this.pageId, isOpen: false });
    };
}
