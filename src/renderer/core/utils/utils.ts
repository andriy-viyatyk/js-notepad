type SetStateAction<S> = S | ((previous: S) => S);

export const isNullOrUndefined = (v: unknown) => v === null || v === undefined;

export function resolveState<S>(
    newState: SetStateAction<S>,
    getPrevState: () => S
): S {
    return typeof newState === "function"
        ? (newState as (prev: S) => S)(getPrevState())
        : newState;
}

export const range = (from: number, to: number) => from <= to
    ? Array.from({ length: to - from + 1 }, (_, i) => from + i)
    : Array.from({ length: from - to + 1 }, (_, i) => to + i);

export function toClipboard(text: string): void {
    navigator.clipboard.writeText(text);
}

/** Format an ISO date string as YYYY-MM-DD */
export function formatDate(isoString: string): string {
    const d = new Date(isoString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Resolve with `promise`'s value if it settles within `ms`, otherwise with `fallback`.
 *
 * For probes whose result is a nice-to-have rather than a requirement. The motivating
 * case is `<webview>.executeJavaScript`, which queues on the *page's* renderer main
 * thread: a page that is mid-load or busy can leave the call pending for a minute or
 * more, and anything awaiting it stalls with it. Racing keeps our UI responsive and
 * degrades to what we already know.
 *
 * A rejection resolves to `fallback` too — before or after the deadline — so a late
 * failure of an abandoned probe can never surface as an unhandled rejection.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return new Promise<T>((resolve) => {
        const timer = setTimeout(() => resolve(fallback), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            () => {
                clearTimeout(timer);
                resolve(fallback);
            },
        );
    });
}

export function splitWithSeparators(text: string, separators: string, withTrim = true): string[] {
    // Escape special regex characters in the separators string
    const escapedSeparators = separators.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Create a character class regex from the separators
    const regex = new RegExp(`[${escapedSeparators}]`);

    let res = text.split(regex);
    if (withTrim) {
        res = res.map(part => part.trim()).filter(part => part);
    }
    return res;
}

/**
 * Element-wise identity comparison of two arrays.
 *
 * For props that arrive as a freshly allocated array on every read — `PageModel.panelEditors`
 * and `BrowserPanelHost.panelEditors` both filter or rebuild per call — an identity check on the
 * array itself always reports "changed", so a caller gating on it would never skip an update.
 * Compare length plus each element instead.
 */
export function sameItems<T>(a: readonly T[] | undefined, b: readonly T[]): boolean {
    if (!a || a.length !== b.length) return false;
    return a.every((item, index) => item === b[index]);
}
