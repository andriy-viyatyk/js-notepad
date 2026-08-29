import { depsChanged } from "../../core/state/model";

/**
 * A one-slot dependency comparison, for a vanilla view that has to decide whether a prop pump
 * changed anything its DOM reads.
 *
 * The model publishes a fixed-length signature for the "did any of these nine inputs move?"
 * question, and the host view checks it at the prop-pump boundary. It uses the shared comparator
 * (`depsChanged`), so the behaviour is identical by construction.
 *
 * Two rules come with it, and both are load-bearing:
 *
 * 1. **The dependency array must be a fixed length.** `depsChanged` treats a length mismatch as a
 *    change, so a conditionally-pushed slot degenerates into "always changed" — which reads as a
 *    working gate while quietly repainting everything on every update.
 * 2. **Call `changed()` at most once per update.** Building the array may evaluate a model `memo()`,
 *    which is a real computation; and two calls in one update would report the second as unchanged,
 *    so a caller that gates two different consequences would silently drop one of them.
 */
export interface DepsGate {
    /** True — and stores `next` — when any slot moved since the last `changed()` or `prime()`. */
    changed(next: readonly unknown[]): boolean;
    /**
     * Store `next` without reporting. Used at the end of `onMount()` to align the gate with the
     * paint that mount already performed; without it the first `onUpdate` always reports a change
     * (there is no previous array to compare against) and repaints the whole window for nothing.
     */
    prime(next: readonly unknown[]): void;
}

export function createDepsGate(): DepsGate {
    let previous: readonly unknown[] | undefined;

    return {
        changed(next: readonly unknown[]): boolean {
            if (!depsChanged(previous, next)) return false;
            previous = [...next];
            return true;
        },
        prime(next: readonly unknown[]): void {
            previous = [...next];
        },
    };
}
