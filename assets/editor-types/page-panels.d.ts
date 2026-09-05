/** A live sidebar panel contributed by one editor instance on a page. */
export interface IPagePanel {
    /** Bare registered panel id. */
    readonly id: string;
    /** Current display label. */
    readonly label: string;
    /** Owning EditorModel instance id. */
    readonly editorId: string;
    /** Owning EditorModel kind/registry id. */
    readonly editorKind: string;
    /** Whether this rendered panel is expanded. */
    readonly expanded: boolean;
}

/** Live sidebar panels and whole-sidebar controls for a page. */
export interface IPagePanels {
    /** Current rendered panel records, in sidebar order. */
    readonly items: readonly IPagePanel[];
    /** Observation of the sidebar's current visibility; readonly. */
    readonly isOpen: boolean;
    /** Measured sidebar width, or null until the lazy sidebar model exists; readonly. */
    readonly width: number | null;
    /**
     * Expand a bare panel id. If multiple owners contribute that id, the first rendered
     * owner is selected; use each item's editorId to see the distinct owners. Composite
     * rendered keys are not accepted.
     */
    expand(panelId: string): void;
    /**
     * Show or hide the whole sidebar container. Throws when the page has no sidebar panels.
     * Closing an individual panel is performed by that panel's own header control.
     */
    toggleSidebar(): void;
}
