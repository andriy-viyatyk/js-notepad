import { Zod } from "../types";

/** Parameter schemas shared across tool groups. Built per server instance because the
 *  zod namespace only exists after the SDK bundle is lazily loaded. */
export function createToolContext(z: Zod) {
    return {
        z,
        // ── Window parameter (shared across tools) ────────────────────
        windowIndex: z.number().int().optional().describe(
            "Target window index (from list_windows). If omitted, uses the first open window. Use open_window to reopen closed windows first.",
        ),
        // ── Browser-targeting parameters (shared across browser_* tools) ──
        browserPageId: z.string().optional().describe(
            "Target a specific browser page by page ID (from list_pages). Takes precedence over profileName. " +
            "Use the special value \"app\" to drive Persephone's OWN window instead of a web page — its tab strip, " +
            "sidebar, toolbars, dialogs, and the active editor (snapshot/click/type/press_key/screenshot/evaluate " +
            "work; navigation and tabs don't). Useful for helping the user with Persephone's UI itself.",
        ),
        browserProfile: z.string().optional().describe(
            "Target the browser page of this profile (profile names: get_app_info → browserProfiles; '' = default profile). If omitted, uses the active (or first) browser page.",
        ),
    };
}

export type IToolContext = ReturnType<typeof createToolContext>;
