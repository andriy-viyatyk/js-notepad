/** Panel-id prefix for a board's declared secondary views (EPIC-044). Each declared
 *  view maps to `board-secondary:<viewId>`; the sidebar composite key is
 *  `<editorId>::board-secondary:<viewId>`. */
export const BOARD_SECONDARY_PREFIX = "board-secondary:";

/** Build the sidebar panel id for a board secondary view id. */
export function boardSecondaryPanelId(viewId: string): string {
    return BOARD_SECONDARY_PREFIX + viewId;
}

/** True iff `panelId` belongs to the board-secondary family. */
export function isBoardSecondaryPanelId(panelId: string): boolean {
    return panelId.startsWith(BOARD_SECONDARY_PREFIX);
}

/** Extract the view id from a `board-secondary:<viewId>` panel id, or null. */
export function parseBoardSecondaryPanelId(panelId: string): string | null {
    return isBoardSecondaryPanelId(panelId)
        ? panelId.slice(BOARD_SECONDARY_PREFIX.length)
        : null;
}
