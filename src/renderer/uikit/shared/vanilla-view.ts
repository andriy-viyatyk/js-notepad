import type { IState } from "../../core/state/state";
import { DisposableStore } from "../../core/utils/DisposableStore";

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

export type VanillaViewCtor<P> = new (props: P) => VanillaView<P>;

type Cleanup = () => void;

// Ownership is deliberately not inferred from DOM containment. A view can be
// owned before its root is mounted, and an owned root may be moved by an adapter.
const ownedViews = new WeakSet<object>();

/** Claim a view for exactly one parent owner for the rest of its lifetime. */
export function claimViewOwnership(view: IOwnedView): void {
    if (ownedViews.has(view)) {
        throw new Error("A VanillaView can have only one owner.");
    }

    ownedViews.add(view);
}

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
    readonly root: HTMLElement;

    protected props: P;

    private mounted = false;
    private disposed = false;
    private readonly disposers = new DisposableStore();
    private readonly children: IOwnedView[] = [];

    protected constructor(props: P, root: HTMLElement = document.createElement("div")) {
        this.props = props;
        this.root = root;
    }

    /** Build the view once and return its stable root. */
    mount(): HTMLElement {
        if (this.disposed || this.mounted) {
            return this.root;
        }

        // Mark mounted before calling user code so a binding installed by the
        // hook can use the immediate-apply contract safely.
        this.mounted = true;
        try {
            this.onMount();
            return this.root;
        } catch (mountError) {
            // A failed mount is terminal: child ownership is lifetime-wide, so
            // retrying this instance could never safely reclaim a child.
            // Clear mounted first so disposal skips onDispose() for half-built
            // views, and preserve the mount error if cleanup also fails.
            this.mounted = false;
            try {
                this.dispose();
            } catch {
                // Preserve the original mount failure after attempting cleanup.
            }
            throw mountError;
        }
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
     *
     * The view releases behavior but deliberately does not detach root. Its
     * adapter or structural helper owns that DOM ordering operation.
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;

        const children = this.children.slice();
        this.children.length = 0;
        const disposers = this.disposers.closeAndTake();

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
        this.disposers.add(dispose);
    }

    /**
     * Alias for ownReleasable: this is a deliberate greppable alias; its name
     * is the ownership marker used by A-1 statement 3's renderer-wide subscription census.
     */
    protected ownSubscription(disposer: () => void): () => void {
        return this.ownReleasable(disposer);
    }

    /**
     * Register a cleanup that can also be released early, and return the
     * release handle. Calling it runs the cleanup once and removes it from
     * `disposers`, so a view that re-registers on every model change does not
     * accumulate dead entries for its lifetime. The handle is idempotent, and
     * `dispose()` snapshots and clears `disposers` before running them, so a
     * release triggered during disposal safely finds nothing to remove.
     *
     * This is the owned-resource counterpart of `releaseChild()`. Its absence
     * is what made US-1152: five secondary views re-bound to a replacement
     * model with no way to drop the previous subscription.
     */
    private ownReleasable(dispose: Cleanup): Cleanup {
        this.assertActive();
        return this.disposers.add(dispose);
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
        claimViewOwnership(view);
        this.children.push(view);
        return view;
    }

    /**
     * Retire a registered child by disposing it, detaching its root, and
     * unregistering it from this parent's ownership list. `dispose()`
     * deliberately does not detach a root, so retirement is the parent's job;
     * leaving a disposed child registered would retain it until the parent
     * itself is disposed. The method is idempotent and ignores unregistered
     * children. The root and ownership entry are released even when disposal
     * throws.
     */
    protected releaseChild(child: IOwnedView): void {
        if (this.children.indexOf(child) === -1) {
            return;
        }

        try {
            child.dispose();
        } finally {
            child.root.remove();
            const index = this.children.indexOf(child);
            if (index !== -1) this.children.splice(index, 1);
        }
    }

    /**
     * Bind a selected state value to a DOM update.
     *
     * React view: state.use(s => ({ title: s.title }))
     * Vanilla view:
     * this.bind(model.state, s => s.title, value => {
     *     this.titleElement.textContent = value;
     * });
     *
     * Returns a release handle. A view bound to a fixed model can ignore it —
     * the binding is disposed with the view either way. A view whose model can
     * be *replaced* must retain it and call it before binding the replacement,
     * or the old model keeps invoking callbacks against the reused view.
     *
     * The selector must read only reactive state. A plain field reached through
     * the model (a lazy getter, a directly-assigned property) is never observed:
     * the selector re-runs on state dispatch, so nothing re-evaluates it when
     * that field changes.
     */
    protected bind<T, R>(
        state: IState<T>,
        selector: (state: T) => R,
        apply: (value: R) => void,
    ): () => void {
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
        return this.ownReleasable(unsubscribe);
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
