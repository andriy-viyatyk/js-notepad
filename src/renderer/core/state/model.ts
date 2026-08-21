import { useEffect, useRef } from "react";
import { IState, TComponentState } from "./state";

/**
 * Slot-by-slot dependency comparison, shared with `uikit/shared/deps-gate.ts` so a vanilla view's
 * change detection is behaviour-identical to `effect()`'s by construction rather than by imitation.
 * A length mismatch counts as changed.
 */
export function depsChanged(
    prev: readonly unknown[] | undefined,
    next: readonly unknown[]
): boolean {
    if (!prev || prev.length !== next.length) return true;
    return prev.some((v, i) => !Object.is(v, next[i]));
}

interface EffectRegistration {
    callback: () => (() => void) | void;
    depsFactory: (() => unknown[]) | undefined;
    prevDeps: unknown[] | undefined;
    cleanup: (() => void) | undefined;
    hasRun: boolean;
}

export interface IMemo<V> {
    readonly value: V;
}

export interface IModel<T> {
    state: IState<T>;
}

export class TModel<T> implements IModel<T> {
    state: IState<T>;
    postCreate?: () => void;

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
        setTimeout(() => this.postCreate?.(), 0);
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
    oldProps?: P;
    isFirstUse = true;
    isLive = true;
    setProps?: (props: P) => void | Promise<void>;
    mapProps?: (props: P) => P;
    onUnmount?: () => void;
    init?(): void;
    dispose?(): void;

    private _effects: EffectRegistration[] = [];
    private _initCalled = false;

    /** Whether init() registered effects that require the React adapter. */
    get hasRegisteredEffects(): boolean {
        return this._effects.length > 0;
    }

    /**
     * Register a side effect with dependency tracking.
     * Call in init() to set up effects that react to prop/state changes.
     *
     * @param callback - Effect function. May return a cleanup function.
     * @param depsFactory - Returns dependency array. Effect re-runs when deps change.
     *   If omitted, effect runs once (like useEffect with []).
     */
    effect(
        callback: () => (() => void) | void,
        depsFactory?: () => unknown[]
    ): void {
        this._effects.push({
            callback,
            depsFactory,
            prevDeps: undefined,
            cleanup: undefined,
            hasRun: false,
        });
    }

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

    /** Evaluate all registered effects, running those whose deps changed. */
    _evaluateEffects = () => {
        for (const effect of this._effects) {
            if (!effect.depsFactory) {
                // No deps — run once only
                if (!effect.hasRun) {
                    effect.hasRun = true;
                    const result = effect.callback();
                    if (typeof result === "function") {
                        effect.cleanup = result;
                    }
                }
                continue;
            }

            const newDeps = effect.depsFactory();
            if (depsChanged(effect.prevDeps, newDeps)) {
                // Clean up previous execution
                effect.cleanup?.();
                effect.cleanup = undefined;

                // Run effect
                effect.hasRun = true;
                const result = effect.callback();
                if (typeof result === "function") {
                    effect.cleanup = result;
                }
                effect.prevDeps = [...newDeps];
            }
        }
    };

    setPropsInternal = (props: P) => {
        this.oldProps = this.props;
        this.props = this.mapProps ? this.mapProps(props) : props;
        this._evaluateEffects();
        return this.setProps?.(this.props);
    };

    /** Called by useComponentModel on first useEffect. */
    _initInternal = () => {
        if (this._initCalled) return;
        this._initCalled = true;
        this.init?.();
        this._evaluateEffects();
    };

    onUnmountInternal = () => {
        this.isLive = false;
        // Clean up all effects
        for (const effect of this._effects) {
            effect.cleanup?.();
            effect.cleanup = undefined;
        }
        this._effects = [];
        this.dispose?.();
        this.onUnmount?.();
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

export function useModel<T, M extends TModel<T>>(
    model:
        | M
        | ModelConstructor<T, M>,
    modelState:
        | IState<T>
        | (new (defaultState: T) => IState<T>) = TComponentState,
    defaultState?: T
): M {
    const modelRef = useRef<M>(undefined);
    if (!modelRef.current) {
        modelRef.current = createModel(model, modelState, defaultState);
    }

    return modelRef.current;
}

export function useComponentModel<T, P, M extends TComponentModel<T, P>>(
    props: P,
    model:
        | M
        | ComponentModelConstructor<T, P, M>,
    defaultState?: T
): M {
    const controlModel = useModel(model, TComponentState, defaultState);
    controlModel.setPropsInternal(props);
    controlModel.isFirstUse = false;

    useEffect(() => {
        controlModel._initInternal();
        return () => controlModel.onUnmountInternal();
    }, [controlModel]);

    return controlModel;
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
    // The initial prop pump happens at construction, matching useComponentModel. The explicit
    // driver owns the model from this point onward and does not share it with a React adapter.
    const controlModel = createModel(model, TComponentState, defaultState);
    controlModel.setPropsInternal(props);
    controlModel.isFirstUse = false;

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
            if (controlModel.hasRegisteredEffects) {
                throw new Error(
                    `${controlModel.constructor.name} registered effects and cannot be driven by a vanilla lifecycle.`
                );
            }
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            // Unlike an uncommitted React render, an explicit owner must clean up even when
            // mount() was never called. The model's init() may therefore not have run yet.
            controlModel.onUnmountInternal();
        },
    };
}
