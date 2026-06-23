/**
 * `persephone-board://` link scheme (EPIC-035 / US-748).
 *
 * Opens a SINGLE board by its own root path through the `openRawLink` pipeline,
 * routing to `target: "board-view"`. The link is a PURE board identifier: it
 * encodes the board root and nothing else. Any future per-open parameter (e.g. a
 * `filePath` to edit) rides as `ILinkData` metadata on the openRawLink call —
 * like `revealLine` / `highlightText` — never baked into this URL.
 *
 * Base64-of-JSON so any path (drive letters, spaces, `#`, `?`) round-trips.
 *
 * Distinct from `board://` — that is the webview file-serving Electron protocol
 * (board-protocol-service.ts), NOT an in-app link scheme. This is never
 * registered with `protocol.handle`.
 */
export const PERSEPHONE_BOARD_PREFIX = "persephone-board://";

export function encodePersephoneBoardLink(boardRoot: string): string {
    return PERSEPHONE_BOARD_PREFIX + btoa(JSON.stringify({ boardRoot }));
}

export function decodePersephoneBoardLink(raw: string): { boardRoot: string } | null {
    if (!raw.startsWith(PERSEPHONE_BOARD_PREFIX)) return null;
    try {
        const obj = JSON.parse(atob(raw.slice(PERSEPHONE_BOARD_PREFIX.length)));
        return typeof obj?.boardRoot === "string" ? { boardRoot: obj.boardRoot } : null;
    } catch {
        return null;
    }
}
