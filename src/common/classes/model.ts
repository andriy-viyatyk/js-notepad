import { useEffect, useRef } from "react";
import { IState, TComponentState } from "./state";

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

export interface IDialogModel<T = any, R = any> extends IModel<T> {
    close: (result: R | undefined) => void;
    result: Promise<R | undefined>;
    onClose?: (result: R | undefined) => void;
}

export class TDialogModel<T = any, R = any>
    extends TModel<T>
    implements IDialogModel<T, R>
{
    close = async (result: R | undefined) => {
        if (this.canClose) {
            let can = this.canClose();
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
    canClose?: () => boolean | Promise<boolean> = undefined;
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

    setPropsInternal = (props: P) => {
        this.oldProps = this.props;
        this.props = this.mapProps ? this.mapProps(props) : props;
        return this.setProps?.(this.props);
    };

    onUnmountInternal = () => {
        this.isLive = false;
        this.onUnmount?.();
    };
}

function createModel<T, M extends TModel<T>>(
    model:
        | M
        | (new (
              modelState: IState<T> | (new (defaultState: T) => IState<T>),
              defaultState?: T
          ) => M),
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
        | (new (
              modelState: IState<T> | (new (defaultState: T) => IState<T>),
              defaultState?: T
          ) => M),
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
        | (new (
              modelState: IState<T> | (new (defaultState: T) => IState<T>),
              defaultState?: T
          ) => M),
    defaultState?: T
): M {
    const controlModel = useModel(model, TComponentState, defaultState);
    controlModel.setPropsInternal(props);
    controlModel.isFirstUse = false;

    useEffect(
        () => () => {
            controlModel.onUnmountInternal();
        },
        []
    );

    return controlModel;
}
