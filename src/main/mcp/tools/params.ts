import { Zod } from "../types";

/** Parameter schemas shared across tool groups. Built per server instance because the
 *  zod namespace only exists after the SDK bundle is lazily loaded. */
export function createToolContext(z: Zod) {
    return {
        z,
        // ── Window parameter (shared across tools) ────────────────────
        windowIndex: z.number().int().optional().describe(
            "Target window index (from windows). If omitted, uses the first open window. Use windows[i].open() to reopen closed windows first.",
        ),
    };
}

export type IToolContext = ReturnType<typeof createToolContext>;


