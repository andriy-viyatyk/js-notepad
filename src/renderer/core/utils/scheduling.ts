import { DisposableStore, type Cleanup } from "./DisposableStore";

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

type PendingRaf = {
    active: boolean;
    release: Cleanup;
    cancel: Cleanup;
};

/** Owns scheduled renderer work and cancels it with the supplied owner store. */
export class OwnerScheduler {
    private pendingRaf: PendingRaf | undefined;

    public constructor(
        private readonly disposables: DisposableStore,
        private readonly assertActive?: () => void,
    ) {}

    /**
     * Schedules a callback after paint using one owner-wide coalescing slot: a second pending
     * request replaces the first. Independent concurrent loops must keep raw handles because one
     * owner-wide slot would make either loop clobber the other's pending frame.
     */
    public raf(run: () => void): Cleanup {
        this.assertActive?.();
        this.pendingRaf?.release();

        const pending: PendingRaf = {
            active: true,
            release: () => undefined,
            cancel: () => undefined,
        };
        pending.release = this.disposables.add(() => {
            pending.active = false;
            if (this.pendingRaf === pending) this.pendingRaf = undefined;
            pending.cancel();
        });
        this.pendingRaf = pending;
        try {
            pending.cancel = afterPaint(() => {
                if (!pending.active) return;
                pending.active = false;
                if (this.pendingRaf === pending) this.pendingRaf = undefined;
                pending.release();
                run();
            });
        } catch (error) {
            pending.release();
            throw error;
        }
        return pending.release;
    }

    /** Schedules a one-shot callback owned by this scheduler's store. */
    public timeout(delay: number, run: () => void): Cleanup {
        this.assertActive?.();
        let active = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const release = this.disposables.add(() => {
            active = false;
            if (timer !== undefined) clearTimeout(timer);
        });
        try {
            timer = setTimeout(() => {
                if (!active) return;
                active = false;
                release();
                run();
            }, delay);
        } catch (error) {
            release();
            throw error;
        }
        return release;
    }

    /** Waits for the first usable layout or for a quiet period after layout observations. */
    public firstLayout(element: HTMLElement, run: () => void): Cleanup {
        return this.layoutWait(element, run, undefined);
    }

    /** Waits for a usable layout to remain unobserved for the quiet period. */
    public settledLayout(
        element: HTMLElement,
        run: () => void,
        quietMs = 200,
    ): Cleanup {
        return this.layoutWait(element, run, quietMs);
    }

    private layoutWait(
        element: HTMLElement,
        run: () => void,
        quietMs: number | undefined,
    ): Cleanup {
        this.assertActive?.();
        let active = true;
        let observer: ResizeObserver | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let release: Cleanup = () => undefined;

        const cleanup = (): void => {
            active = false;
            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
            }
            observer?.disconnect();
            observer = undefined;
        };

        const complete = (): void => {
            if (!active) return;
            release();
            run();
        };

        const hasNonZeroContentRect = (): boolean => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        };

        const observe = (entries: ResizeObserverEntry[]): void => {
            if (!active) return;
            const hasNonZeroEntry = entries.some(({ contentRect }) =>
                contentRect.width > 0 && contentRect.height > 0);
            if (quietMs === undefined) {
                if (hasNonZeroEntry) complete();
                return;
            }

            if (timer !== undefined) clearTimeout(timer);
            timer = undefined;
            if (!hasNonZeroEntry) return;
            timer = setTimeout(() => {
                timer = undefined;
                if (!active || !hasNonZeroContentRect()) return;
                complete();
            }, quietMs);
        };

        release = this.disposables.add(cleanup);
        try {
            observer = new ResizeObserver(observe);
            observer.observe(element);
            if (quietMs === undefined && hasNonZeroContentRect()) complete();
        } catch (error) {
            release();
            throw error;
        }
        return release;
    }

    /** Creates an existing Delayer whose disposal is owned by this scheduler's store. */
    public delayer<T>(delay: number): Delayer<T> {
        this.assertActive?.();
        const delayer = new Delayer<T>(delay);
        try {
            this.disposables.add(delayer);
        } catch (error) {
            delayer.dispose();
            throw error;
        }
        return delayer;
    }
}

/** Schedules focus after the next paint; selection is additive and never replaces focusing. */
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
        element.focus();
        if (select && typeof selectableElement.select === "function") selectableElement.select();
    });
}
