import { produce } from "immer";
import { resolveState } from "../utils/utils";

type SetStateAction<T> = T | ((previous: T) => T);
type Dispatch<T> = (value: SetStateAction<T>) => void;

export type IState<T> = {
    get: () => T;
    set: Dispatch<T>;
    update: (updateDraft: (state: T) => void) => void;
    clear: () => void;
    subscribe: {
        (listener: () => void): () => void;
        <R>(listener: (value: R) => void, selector: (state: T) => R): () => void;
    };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!isObject(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
};

function compareSelection(a: unknown, b: unknown): boolean {
    if (!isPlainObject(a) || isArray(a) || a instanceof Date || a instanceof RegExp
        || a instanceof Map || a instanceof Set) {
        return a === b;
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        if (Object.keys(a).length !== Object.keys(b).length) return false;
        return Object.getOwnPropertyNames(a).every((key) =>
            Object.prototype.hasOwnProperty.call(b, key) && compareSelection(a[key], b[key])
        );
    }
    return a === b;
}

export class TOneState<T> implements IState<T> {
    private currentState: T;
    private listeners: (() => void)[] = [];
    defaultState;

    constructor(defaultState: T) {
        this.defaultState = defaultState;
        this.currentState = defaultState;
    }

    private readonly stateChanged = () => {
        this.listeners.forEach((listener) => listener());
    };

    get = () => this.currentState;
    set = (setter: SetStateAction<T>) => {
        this.currentState = resolveState(setter, () => this.currentState);
        this.stateChanged();
    };

    update = (updateDraft: (state: T) => void) => {
        this.set(
            produce(this.currentState, (draft) => {
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
            let last = selector(this.currentState);
            const wrapped = () => {
                const next = selector(this.currentState);
                if (!compareSelection(last, next)) {
                    last = next;
                    listener(next);
                }
            };
            this.listeners.push(wrapped);
            return () => {
                this.listeners = this.listeners.filter((item) => item !== wrapped);
            };
        }
        const listener = args[0] as () => void;
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((item) => item !== listener);
        };
    }) as IState<T>["subscribe"];
}

export class TGlobalState<T> extends TOneState<T> {}

export class TComponentState<T> extends TOneState<T> {}
