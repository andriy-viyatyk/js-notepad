/**
 * Best-effort human-readable message for an unknown catch value.
 *
 * Deliberately does NOT rely on `instanceof Error`: errors that cross the
 * main↔renderer IPC boundary (and MCP JSON-RPC replies) arrive as plain objects
 * that still carry a `message` string, so a prototype check alone would render
 * them as "[object Object]".
 *
 * `fallback` covers the cases with nothing readable to show — a thrown
 * `undefined`, an empty message, or an object that stringifies to nothing useful.
 */
export function errMessage(e: unknown, fallback = "Unexpected error"): string {
    if (typeof e === "string") return e.trim() || fallback;
    const message = (e as { message?: unknown } | null | undefined)?.message;
    if (typeof message === "string" && message.trim()) return message;
    if (e === null || e === undefined) return fallback;
    const text = String(e);
    return text && text !== "[object Object]" ? text : fallback;
}

export function debounce<T extends (...args: unknown[]) => void>(
    func: T,
    delay: number,
    canRun?: () => boolean
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        const run = () => {
            if (!canRun || canRun()) {
                func(...args);
                return;
            }
            timeoutId = setTimeout(run, delay);
        };

        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(run, delay);
    };
}