import React, { SetStateAction, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useStoreWithEqualityFn } from "zustand/traditional";
import { produce } from 'immer';


import { resolveState } from '../utils/utils';

interface IUse<T> {
    (): T;
    <R>(selector: (state: T) => R): R;
}

export type IState<T> = {
    get: () => T;
    set: React.Dispatch<SetStateAction<T>>;
    use: IUse<T>;
    update: (updateDraft: (state: T) => void) => void;
    clear: () => void;
    subscribe: {
        (listener: () => void): () => void;
        <R>(listener: (value: R) => void, selector: (state: T) => R): () => void;
    };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!isObject(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
}

function compareSelection(a: unknown, b: unknown): boolean {
    if (!isPlainObject(a) || isArray(a) || (a instanceof Date)
        || (a instanceof RegExp) || (a instanceof Map) || (a instanceof Set)
    ) {
        return a === b;
    }

    if (isPlainObject(a) && isPlainObject(b)) {
        if (Object.keys(a).length !== Object.keys(b).length) {
            return false;
        }

        return Object.getOwnPropertyNames(a).every(key =>
            Object.prototype.hasOwnProperty.call(b, key) && compareSelection(a[key], b[key])
        );
    }

    return a === b;
}

export class TOneState<T> implements IState<T> {
    private readonly store;
    private listeners: (() => void)[] = [];
    defaultState;

    constructor(defaultState: T) {
        this.defaultState = defaultState;
        this.store = create<T>(() => defaultState);
    }

    private readonly stateChanged = () => {
        this.listeners.forEach((listener) => listener());
    }

    get = () => this.store.getState();
    set = (setter: SetStateAction<T>) => {
        const newState = resolveState(setter, () => this.store.getState());
        this.store.setState(newState, true);
        this.stateChanged();
    };

    use: IUse<T> = (<R>(selector?: (state: T) => R) => {
        return selector
            ? useStoreWithEqualityFn(this.store, state => selector(state), compareSelection as (a: R, b: R) => boolean)
            : this.store(state => state)
    }) as IUse<T>;

    update = (updateDraft: (state: T) => void) => {
        this.set(
            produce(this.store.getState(), (draft) => {
                updateDraft(draft as T);
            }),
        );
    };

    clear = () => {
        this.set(this.defaultState);
    };

    subscribe = ((...args: unknown[]) => {
        if (args.length >= 2) {
            const listener = args[0] as (value: unknown) => void;
            const selector = args[1] as (state: T) => unknown;
            let last = selector(this.store.getState());
            const wrapped = () => {
                const next = selector(this.store.getState());
                if (!compareSelection(last, next)) {
                    last = next;
                    listener(next);
                }
            };
            this.listeners.push(wrapped);
            return () => {
                this.listeners = this.listeners.filter((l) => l !== wrapped);
            };
        }
        const listener = args[0] as () => void;
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }) as IState<T>["subscribe"];
}

export class TGlobalState<T> extends TOneState<T> {}

export class TComponentState<T> extends TOneState<T> {}

/**
 * Unconditional hook for subscribing to an optional state.
 * Always calls useState + useEffect (stable hook count), returns defaultValue when state is null.
 * Use this instead of `state?.use()` which is a conditional hook and violates React rules.
 */
export function useOptionalState<T, R>(
    state: IState<T> | null | undefined,
    selector: (s: T) => R,
    defaultValue: R,
): R {
    const selectorRef = useRef(selector);
    selectorRef.current = selector;
    const [value, setValue] = useState<R>(() =>
        state ? selector(state.get()) : defaultValue
    );

    useEffect(() => {
        if (!state) {
            setValue(defaultValue);
            return;
        }
        setValue(selectorRef.current(state.get()));
        return state.subscribe(() => {
            setValue(selectorRef.current(state.get()));
        });
    }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

    return state ? value : defaultValue;
}

export function useComponentState<T>(defaultState: T): IState<T> {
    const stateRef = useRef<IState<T>>(undefined);
    if (!stateRef.current) {
        stateRef.current = new TComponentState(defaultState);
    }
    return stateRef.current as IState<T>;
}
