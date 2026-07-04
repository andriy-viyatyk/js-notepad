/**
 * `persephone-toolset://` link scheme (EPIC-038 / US-805).
 *
 * Opens a SINGLE toolset by its own root path through the `openRawLink` pipeline, routing to
 * `target: "toolset-view"`. The link is a PURE toolset identifier: it encodes the toolset root
 * and nothing else. Mirrors `persephone-board://` (US-748).
 *
 * A link scheme (not a filename-`accepts` editor) is deliberate: a normal click on
 * `tools-manifest.json` in Explorer must still open the JSON in Monaco; only the Explorer
 * open-icon and the Boards/Tools panels open the toolset editor.
 *
 * Base64-of-JSON so any path (drive letters, spaces, `#`, `?`) round-trips.
 */
import { app } from "../api/app";
import { createLinkData } from "../../shared/link-data";

export const PERSEPHONE_TOOLSET_PREFIX = "persephone-toolset://";

export function encodePersephoneToolsetLink(toolsetRoot: string): string {
    return PERSEPHONE_TOOLSET_PREFIX + btoa(JSON.stringify({ toolsetRoot }));
}

export function decodePersephoneToolsetLink(raw: string): { toolsetRoot: string } | null {
    if (!raw.startsWith(PERSEPHONE_TOOLSET_PREFIX)) return null;
    try {
        const obj = JSON.parse(atob(raw.slice(PERSEPHONE_TOOLSET_PREFIX.length)));
        return typeof obj?.toolsetRoot === "string" ? { toolsetRoot: obj.toolsetRoot } : null;
    } catch {
        return null;
    }
}

/**
 * Open the toolset editor for `toolsetRoot`. Passing `pageId` swaps the current page's main
 * editor (Explorer-scoped panels); omitting it opens a new page (the global sidebar list).
 */
export function openToolset(
    toolsetRoot: string,
    opts?: { pageId?: string; sourceId?: string },
): void {
    void app.events.openRawLink.sendAsync(
        createLinkData(encodePersephoneToolsetLink(toolsetRoot), {
            pageId: opts?.pageId,
            sourceId: opts?.sourceId,
        }),
    );
}
