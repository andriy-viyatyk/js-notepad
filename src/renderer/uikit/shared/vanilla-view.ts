import type { IState } from "../../core/state/state";

/**
 * The minimal surface a parent needs in order to own a child view.
 *
 * Keeping this interface independent from VanillaView also lets a later adapter
 * register a view implemented by another runtime without exposing its internals.
 */
export interface IOwnedView {
    readonly root: HTMLElement;
    dispose(): void;
}

type Cleanup = () => void;

// Ownership is deliberately not inferred from DOM containment. A view can be
// owned before its root is mounted, and an owned root may be moved by an adapter.
const ownedViews = new WeakSet<object>();

/**
 * Framework-free lifecycle base for views that own a stable DOM root.
 *
 * The constructor creates only the root. mount() is the point where subclasses
 * build child DOM and install bindings. update() before mount stores props but
 * does not call the update hook, because there is no child DOM to update yet.
 *
 * Unlike a React effect, mount() and update() are explicit lifecycle calls. The
 * base intentionally does not batch, schedule, render, or create a React root.
 */
export abstract class VanillaView<P> implements IOwnedView {
    readonly root: HTMLElement = document.createElement("div");

    protected props: P;

    private mounted = false;
    private disposed = false;
    private readonly disposers: Cleanup[] = [];
    private readonly children: IOwnedView[] = [];

    protected constructor(props: P) {
        this.props = props;
    }

    /** Build the view once and return its stable root. */
    mount(): HTMLElement {
        if (this.disposed || this.mounted) {
            return this.root;
        }

        // Mark mounted before calling user code so a binding installed by the
        // hook can use the immediate-apply contract safely.
        this.mounted = true;
        this.onMount();
        return this.root;
    }

    /**
     * Store new props. Before mount, the subclass update hook is intentionally
     * skipped; mount() reads the latest stored props through onMount().
     */
    update(props: P): void {
        if (this.disposed) {
            return;
        }

        this.props = props;
        if (this.mounted) {
            this.onUpdate(props);
        }
    }

    /**
     * Dispose children first, then this view's resources, and finally its hook.
     * Every cleanup is attempted. If more than one cleanup throws, the first
     * error is rethrown after the complete snapshot has run.
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;

        const children = this.children.slice();
        const disposers = this.disposers.slice();
        this.children.length = 0;
        this.disposers.length = 0;

        let firstError: unknown;
        let hasError = false;
        const runCleanup = (cleanup: Cleanup): void => {
            try {
                cleanup();
            } catch (error) {
                if (!hasError) {
                    hasError = true;
                    firstError = error;
                }
            }
        };

        // Depth-first ownership order is important for adapters that mount a
        // nested root: the child must unmount before the host is removed.
        children.forEach((child) => runCleanup(() => child.dispose()));
        disposers.forEach(runCleanup);
        if (this.mounted) {
            runCleanup(() => this.onDispose());
        }

        if (hasError) {
            throw firstError;
        }
    }

    /** Register a resource cleanup owned by this view. */
    protected own(dispose: Cleanup): void {
        this.assertActive();
        this.disposers.push(dispose);
    }

    /**
     * Add a typed DOM listener and register its matching removal operation.
     * The wrapper remains safe even if the browser has already captured the
     * handler in an event dispatch when dispose() removes it.
     */
    protected listen<K extends keyof HTMLElementEventMap>(
        target: EventTarget,
        type: K,
        listener: (event: HTMLElementEventMap[K]) => void,
        options?: AddEventListenerOptions,
    ): void {
        this.assertActive();

        const guardedListener = (event: Event): void => {
            if (this.disposed) {
                return;
            }
            listener(event as HTMLElementEventMap[K]);
        };
        target.addEventListener(type as string, guardedListener, options);
        this.own(() => target.removeEventListener(type as string, guardedListener, options));
    }

    /** Register one explicitly-owned child and return it for fluent setup. */
    protected child<T extends IOwnedView>(view: T): T {
        this.assertActive();
        if (ownedViews.has(view)) {
            throw new Error("A VanillaView child can have only one owner.");
        }

        ownedViews.add(view);
        this.children.push(view);
        return view;
    }

    /**
     * Bind a selected state value to a DOM update.
     *
     * React view: state.use(s => ({ title: s.title }))
     * Vanilla view:
     * this.bind(model.state, s => s.title, value => {
     *     this.titleElement.textContent = value;
     * });
     */
    protected bind<T, R>(
        state: IState<T>,
        selector: (state: T) => R,
        apply: (value: R) => void,
    ): void {
        if (!this.mounted) {
            throw new Error("VanillaView.bind() must be called from mount() or later.");
        }
        this.assertActive();

        const guardedApply = (value: R): void => {
            if (this.disposed) {
                return;
            }
            apply(value);
        };

        guardedApply(selector(state.get()));
        const unsubscribe = state.subscribe(guardedApply, selector);
        this.own(unsubscribe);
    }

    /** Subclasses build child DOM and install bindings here. */
    protected onMount(): void {}

    /** Subclasses update existing DOM here without replacing the root. */
    protected onUpdate(_props: P): void {}

    /** Subclasses may release non-registered state in the final cleanup phase. */
    protected onDispose(): void {}

    private assertActive(): void {
        if (this.disposed) {
            throw new Error("Cannot register a resource on a disposed VanillaView.");
        }
    }
}
