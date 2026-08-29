/**
 * Debounces asynchronous or synchronous work and shares the completion promise
 * for calls in the same pending cycle.
 */
export class Delayer<T> {
    private cycle: DelayerCycle<T> | undefined;
    private readonly cycles = new Set<DelayerCycle<T>>();
    private disposed = false;

    public constructor(private readonly defaultDelay: number) {}

    /** Schedules the latest task after the configured delay. */
    public trigger(task: () => PromiseLike<T> | T, delay = this.defaultDelay): Promise<T> {
        if (this.disposed) return Promise.reject(new Error("Delayer disposed."));

        const current = this.cycle;
        if (current?.state === "pending") {
            current.task = task;
            clearTimeout(current.timer);
            current.timer = setTimeout(() => this.run(current), delay);
            return current.promise;
        }

        let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
        let rejectPromise: (reason?: unknown) => void = () => undefined;
        const promise = new Promise<T>((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });
        const next: DelayerCycle<T> = {
            promise,
            task,
            timer: undefined,
            state: "pending",
            resolve: resolvePromise,
            reject: rejectPromise,
        };
        this.cycles.add(next);
        next.timer = setTimeout(() => this.run(next), delay);
        this.cycle = next;
        return promise;
    }

    /** Cancels pending work while keeping this Delayer reusable. */
    public cancel(): void {
        const current = this.cycle;
        if (current?.state !== "pending") return;
        clearTimeout(current.timer);
        this.reject(current, new Error("Delayer cancelled."));
    }

    /** Permanently cancels this Delayer and rejects any unsettled work. */
    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const cycle of this.cycles) {
            if (cycle.state === "pending") clearTimeout(cycle.timer);
            this.reject(cycle, new Error("Delayer disposed."));
        }
    }

    private run(cycle: DelayerCycle<T>): void {
        if (this.cycle !== cycle || cycle.state !== "pending") return;
        cycle.state = "running";
        cycle.timer = undefined;
        const task = cycle.task;
        cycle.task = undefined;

        let result: PromiseLike<T> | T;
        try {
            if (!task) {
                this.reject(cycle, new Error("Delayer task missing."));
                return;
            }
            result = task();
        } catch (error) {
            this.reject(cycle, error);
            return;
        }
        Promise.resolve(result).then(
            (value) => this.resolve(cycle, value),
            (error: unknown) => this.reject(cycle, error),
        );
    }

    private resolve(cycle: DelayerCycle<T>, value: T): void {
        if (cycle.state === "settled") return;
        cycle.state = "settled";
        cycle.resolve(value);
        this.cycles.delete(cycle);
        if (this.cycle === cycle) this.cycle = undefined;
    }

    private reject(cycle: DelayerCycle<T>, error: unknown): void {
        if (cycle.state === "settled") return;
        cycle.state = "settled";
        cycle.reject(error);
        this.cycles.delete(cycle);
        if (this.cycle === cycle) this.cycle = undefined;
    }
}

type DelayerCycle<T> = {
    promise: Promise<T>;
    task: (() => PromiseLike<T> | T) | undefined;
    timer: ReturnType<typeof setTimeout> | undefined;
    state: "pending" | "running" | "settled";
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
};

/**
 * Runs a callback after the next paint, with a fallback required for callers
 * created in background-capable windows where requestAnimationFrame may not run.
 * This is not a substitute for the ordering decisions deferred to R8.
 */
export function afterPaint(run: () => void): () => void {
    let active = true;
    const handles: {
        frame?: number;
        fallback?: ReturnType<typeof setTimeout>;
    } = {};

    const runOnce = (): void => {
        if (!active) return;
        active = false;
        if (handles.frame !== undefined) cancelAnimationFrame(handles.frame);
        if (handles.fallback !== undefined) clearTimeout(handles.fallback);
        run();
    };

    handles.frame = requestAnimationFrame(runOnce);
    if (!active) cancelAnimationFrame(handles.frame);
    handles.fallback = setTimeout(runOnce, 100);
    if (!active) clearTimeout(handles.fallback);

    return (): void => {
        if (!active) return;
        active = false;
        if (handles.frame !== undefined) cancelAnimationFrame(handles.frame);
        if (handles.fallback !== undefined) clearTimeout(handles.fallback);
    };
}

/** Schedules focus, or selection when requested, after the next paint. */
export function focusAfterPaint(
    element: HTMLElement | null | undefined,
    options?: { select?: boolean | (() => boolean) },
): () => void {
    return afterPaint(() => {
        if (!element) return;
        const select = typeof options?.select === "function"
            ? options.select()
            : options?.select === true;
        const selectableElement = element as HTMLInputElement | HTMLTextAreaElement;
        if (select && typeof selectableElement.select === "function") selectableElement.select();
        else element.focus();
    });
}
