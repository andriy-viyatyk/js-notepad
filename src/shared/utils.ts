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

/** Join binary chunks (stdout/stderr from a spawned process) into one buffer. */
export function concatChunks(chunks: Uint8Array[]): Uint8Array {
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out;
}

export type Debounced<T extends (...args: unknown[]) => void> =
    ((...args: Parameters<T>) => void) & { cancel(): void };

export function debounce<T extends (...args: unknown[]) => void>(
    func: T,
    delay: number,
    canRun?: () => boolean
): Debounced<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const debounced = ((...args: Parameters<T>) => {
        const run = () => {
            timeoutId = null;
            if (!canRun || canRun()) {
                func(...args);
                return;
            }
            timeoutId = setTimeout(run, delay);
        };

        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(run, delay);
    }) as Debounced<T>;

    debounced.cancel = () => {
        if (timeoutId === null) return;
        clearTimeout(timeoutId);
        timeoutId = null;
    };

    return debounced;
}
