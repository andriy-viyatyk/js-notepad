import { IState, TComponentState } from "./state";
import { DisposableStore } from "../utils/DisposableStore";

/**
 * Slot-by-slot dependency comparison, shared with `uikit/shared/deps-gate.ts` so a vanilla view's
 * change detection uses the same identity semantics everywhere.
 * A length mismatch counts as changed.
 */
export function depsChanged(
    prev: readonly unknown[] | undefined,
    next: readonly unknown[]
): boolean {
    if (!prev || prev.length !== next.length) return true;
    return prev.some((v, i) => !Object.is(v, next[i]));
}

/**
 * Cached model computation retained for Epic A; Epic B removes it with the props pump.
 */
export interface IMemo<V> {
    readonly value: V;
}

export interface IModel<T> {
    state: IState<T>;
}

export class TModel<T> implements IModel<T> {
    state: IState<T>;
    postCreate?: () => void;
    private readonly disposables = new DisposableStore();

    protected own(dispose: () => void): void {
        this.disposables.add(dispose);
    }

    dispose(): void {
        this.disposables.dispose();
    }

    constructor(
        modelState: IState<T> | (new (defaultState: T) => IState<T>),
        defaultState?: T
    ) {
        if (typeof modelState === "function") {
            if (defaultState === undefined) {
                throw new Error(
                    "defaultState should be provided when modelState is State class."
                );
            }
            // eslint-disable-next-line new-cap
            this.state = new modelState(defaultState);
        } else {
            this.state = modelState;
        }
    }
}

export interface IDialogModel<T = unknown, R = unknown> extends IModel<T> {
    close: (result: R | undefined) => void;
    result: Promise<R | undefined>;
    onClose?: (result: R | undefined) => void;
}

export class TDialogModel<T = unknown, R = unknown>
    extends TModel<T>
    implements IDialogModel<T, R>
{
    close = async (result: R | undefined) => {
        if (this.canClose) {
            let can = this.canClose(result);
            if (can instanceof Promise) {
                can = await can;
                if (can) {
                    this.onClose?.(result);
                    return true;
                }
                return false;
            } else if (!can) {
                return false;
            }
        }
        this.onClose?.(result);
        return true;
    };
    result: Promise<R | undefined> = Promise.resolve(undefined);
    canClose?: (r?: R) => boolean | Promise<boolean> = undefined;
    onClose?: (result: R | undefined) => void = undefined;
}

export class TComponentModel<T, P> extends TModel<T> {
    props!: P;
    isLive = true;
    setProps?: (props: P) => void | Promise<void>;
    init?(): void;
    dispose(): void {
        super.dispose();
    }

    private _initCalled = false;

    /**
     * Create a cached computation with dependency tracking.
     * Recomputes only when dependencies change.
     *
     * @param computeFn - Computation function.
     * @param depsFactory - Returns dependency array. Recomputes when deps change.
     * @returns Object with .value getter that returns the cached result.
     */
    memo<V>(computeFn: () => V, depsFactory: () => unknown[]): IMemo<V> {
        let prevDeps: unknown[] | undefined;
        let cachedValue: V;
        return {
            get value() {
                const newDeps = depsFactory();
                if (depsChanged(prevDeps, newDeps)) {
                    cachedValue = computeFn();
                    prevDeps = [...newDeps];
                }
                return cachedValue;
            },
        };
    }

    setPropsInternal = (props: P) => {
        this.props = props;
        return this.setProps?.(this.props);
    };

    /** Called once when the explicit model driver mounts. */
    _initInternal = () => {
        if (this._initCalled) return;
        this._initCalled = true;
        this.init?.();
    };

    onUnmountInternal = () => {
        this.isLive = false;
        try {
            this.dispose();
        } finally {
            super.dispose();
        }
    };
}

type ComponentModelConstructor<T, P, M extends TComponentModel<T, P>> = new (
    modelState: IState<T> | (new (defaultState: T) => IState<T>),
    defaultState?: T
) => M;

type ModelConstructor<T, M extends TModel<T>> = new (
    modelState: IState<T> | (new (defaultState: T) => IState<T>),
    defaultState?: T
) => M;

function createModel<T, M extends TModel<T>>(
    model:
        | M
        | ModelConstructor<T, M>,
    modelState: IState<T> | (new (defaultState: T) => IState<T>),
    defaultState?: T
): M {
    if (typeof model === "function") {
        // eslint-disable-next-line new-cap
        return new model(modelState, defaultState);
    }
    return model;
}

export interface ComponentModelDriver<T, P, M extends TComponentModel<T, P>> {
    readonly model: M;
    update(props: P): void | Promise<void>;
    mount(): void;
    dispose(): void;
}

export function createComponentModelDriver<
    T,
    P,
    M extends TComponentModel<T, P>,
>(
    props: P,
    model: M | ComponentModelConstructor<T, P, M>,
    defaultState?: T,
): ComponentModelDriver<T, P, M> {
    // The initial prop pump happens at construction. The explicit driver owns the model from
    // this point onward.
    const controlModel = createModel(model, TComponentState, defaultState);
    controlModel.setPropsInternal(props);

    let mounted = false;
    let disposed = false;

    return {
        model: controlModel,
        update(nextProps) {
            if (disposed) return;
            return controlModel.setPropsInternal(nextProps);
        },
        mount() {
            if (disposed || mounted) return;
            mounted = true;
            controlModel._initInternal();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            // An explicit owner must clean up even when mount() was never called. The model's
            // init() may therefore not have run yet.
            controlModel.onUnmountInternal();
        },
    };
}
