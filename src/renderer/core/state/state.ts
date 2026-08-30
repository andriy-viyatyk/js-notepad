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

/**
 * One registered subscriber. `active` exists so a listener retired *during* a dispatch is not
 * called later in that same pass — see `stateChanged`.
 */
interface StateListener {
    readonly notify: () => void;
    active: boolean;
}

export class TOneState<T> implements IState<T> {
    private currentState: T;
    private listeners: StateListener[] = [];
    defaultState;

    constructor(defaultState: T) {
        this.defaultState = defaultState;
        this.currentState = defaultState;
    }

    /**
     * Notify subscribers. Two properties matter here, and both are the shape `Emitter.fire`
     * (`core/state/events.ts`) already uses — this is that decision applied to the state
     * primitive, not a new opinion.
     *
     * **A listener retired during this dispatch is skipped.** Unsubscribing replaced the array,
     * which kept iteration safe but still called the removed listener in the pass that was already
     * running. A view disposed by an earlier subscriber would therefore be notified after its
     * disposal — and a subscriber that reaches `own()`/`ownSubscription()` throws there, because
     * registering a resource on a disposed view is illegal. Found when switching editors: `attach`
     * bumps `page.state.version`, an earlier subscriber rebuilt the toolbar and disposed the old
     * `NavPanelButtonView`, and that view's own subscription then ran anyway.
     *
     * **One listener's failure does not cancel the rest.** Without the try/catch, a throw abandons
     * the remaining subscribers mid-dispatch, so the work they were going to do — mounting the
     * replacement editor, in the case above — silently never happens and the page renders empty.
     * The error is rethrown asynchronously so it still reaches the host unswallowed.
     */
    private readonly stateChanged = () => {
        for (const listener of [...this.listeners]) {
            if (!listener.active) continue;
            try {
                listener.notify();
            } catch (error) {
                setTimeout(() => { throw error; }, 0);
            }
        }
    };

    /** Register a subscriber and return its idempotent unsubscribe. */
    private register(notify: () => void): () => void {
        const listener: StateListener = { notify, active: true };
        this.listeners.push(listener);
        return () => {
            if (!listener.active) return;
            listener.active = false;
            this.listeners = this.listeners.filter((item) => item !== listener);
        };
    }

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
            return this.register(wrapped);
        }
        const listener = args[0] as () => void;
        return this.register(listener);
    }) as IState<T>["subscribe"];
}

export class TGlobalState<T> extends TOneState<T> {}

export class TComponentState<T> extends TOneState<T> {}
