/**
 * A reference that can also be awaited.
 *
 * It exists so imperative calls can run before the DOM is ready: a `scrollToRow(50_000)` issued
 * while the grid container is still unmounted awaits the container rather than silently doing
 * nothing. Once a value is set, `async` is an already-resolved promise, so awaiting costs a
 * microtask and nothing more.
 *
 * **The promise is built in the constructor body, and that ordering is the whole point.** Class
 * field initializers run *before* the constructor body. An earlier version declared
 * `async = new Promise(...)` as a field — whose initializer installed `resolveAsync` — and then
 * reset `this.resolveAsync = undefined` in the constructor body, wiping it. The first `ref()` then
 * took the `else` branch and *replaced* `async` with a fresh promise, so any caller already
 * awaiting the original waited forever. Assigning inside the constructor, after the reset, is the
 * fix. Do not move `async` back to a field initializer.
 *
 * Shared by both virtualization engines: `uikit/VirtualGrid/VirtualGridModel.ts` (live) and
 * `uikit/RenderGrid/RenderGridModel.ts` (React-only, pending removal).
 */
export class AsyncRef<T> {
    current: T;
    /** Resolves the initial `async` promise; cleared once used. */
    private resolveAsync: ((v: T) => void) | undefined;
    async: Promise<T>;

    constructor(initialValue: T) {
        this.current = initialValue;
        this.async = new Promise<T>((resolve) => {
            this.resolveAsync = (value: T) => {
                this.resolveAsync = undefined;
                resolve(value);
            };
        });
    }

    /** Set the value. Falsy values are ignored — the ref only ever moves to something real. */
    ref = (value: T | null) => {
        if (value && this.current !== value) {
            this.current = value;
            if (this.resolveAsync) {
                this.resolveAsync(value);
            } else {
                this.async = Promise.resolve(value);
            }
        }
    };
}
