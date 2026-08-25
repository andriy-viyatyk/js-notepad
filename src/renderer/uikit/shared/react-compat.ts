import React from "react";

type PublicEventHandler = (event: React.SyntheticEvent<HTMLElement>) => void;

export interface RestPropsState {
    attributes: Set<string>;
    listeners: Map<string, {
        type: string;
        listener: EventListener;
    }>;
}

export function createRestPropsState(): RestPropsState {
    return {
        attributes: new Set<string>(),
        listeners: new Map(),
    };
}

/** Preserve the React-facing event shape while using a native listener. */
function toPublicEvent(event: Event): React.SyntheticEvent<HTMLElement> {
    let propagationStopped = false;
    // Keep the facade's own React-compatible methods on the target, but resolve
    // every other property through the native event as its receiver. WebIDL
    // accessors such as KeyboardEvent.key and ClipboardEvent.clipboardData
    // brand-check their receiver and throw when read from Object.create(event).
    const publicEventTarget = Object.create(null) as React.SyntheticEvent<HTMLElement>;
    Object.defineProperties(publicEventTarget, {
        nativeEvent: { value: event },
        target: { get: () => event.target },
        currentTarget: { get: () => event.currentTarget },
        preventDefault: {
            value: () => event.preventDefault(),
        },
        isDefaultPrevented: {
            value: () => event.defaultPrevented,
        },
        stopPropagation: {
            value: () => {
                propagationStopped = true;
                event.stopPropagation();
            },
        },
        isPropagationStopped: {
            value: () => propagationStopped,
        },
        persist: { value: (): void => undefined },
        isPersistent: { value: (): boolean => true },
    });
    return new Proxy(publicEventTarget, {
        get(target, property, receiver) {
            if (Reflect.has(target, property)) {
                return Reflect.get(target, property, receiver);
            }
            const value = Reflect.get(event, property, event);
            return typeof value === "function" ? value.bind(event) : value;
        },
    });
}

/**
 * Attributes that look boolean in JSX but are *enumerated* in HTML: their keywords are the strings
 * "true" and "false", and any other value — including the empty string a boolean attribute would
 * use — is invalid and falls back to the attribute's own default.
 *
 * `draggable=""` therefore means `auto`, i.e. a `div` that is not draggable, which is why this list
 * exists: `ListItem`'s two link-editor call sites pass `draggable={true}` through rest props, and
 * writing `""` would lose drag silently. React writes `"true"`.
 */
const ENUMERATED_ATTRIBUTES = new Set(["draggable", "spellcheck", "contenteditable"]);

/**
 * `aria-*` attributes take the same "true"/"false" keywords, and React renders a boolean on them as
 * that string rather than dropping it — `aria-expanded={false}` is `aria-expanded="false"`, which is
 * semantically different from no attribute at all (a collapsed combobox versus one that does not
 * expand). Both of the generic arms below would get it wrong: `false` would be removed, and `true`
 * would be written as the empty string a boolean attribute uses.
 *
 * `PathInputView` and `Select` both pass `aria-expanded={boolean}` through here.
 */
function isEnumeratedAttribute(key: string): boolean {
    return ENUMERATED_ATTRIBUTES.has(key) || key.startsWith("aria-");
}

/** Apply React-style residual attributes/listeners and remove stale values. */
export function applyRestProps(
    root: HTMLElement,
    rest: Record<string, unknown>,
    previous: RestPropsState,
): RestPropsState {
    const attributeName = (key: string): string =>
        key === "className" ? "class" : key === "htmlFor" ? "for" : key;

    for (const key of Array.from(previous.attributes)) {
        if (!(key in rest)) {
            root.removeAttribute(attributeName(key));
            previous.attributes.delete(key);
        }
    }
    for (const [key, entry] of previous.listeners) {
        if (!(key in rest)) {
            root.removeEventListener(entry.type, entry.listener);
            previous.listeners.delete(key);
        }
    }

    for (const [key, value] of Object.entries(rest)) {
        if (key.startsWith("on")) {
            previous.attributes.delete(key);
            const prior = previous.listeners.get(key);
            if (prior) root.removeEventListener(prior.type, prior.listener);
            previous.listeners.delete(key);
            if (typeof value === "function") {
                const eventName = key.slice(2).toLowerCase();
                const type = eventName === "doubleclick" ? "dblclick" : eventName;
                const listener: EventListener = (event) => {
                    (value as PublicEventHandler)(toPublicEvent(event));
                };
                root.addEventListener(type, listener);
                previous.listeners.set(key, { type, listener });
            }
            continue;
        }

        if (value == null || (value === false && !isEnumeratedAttribute(key))) {
            root.removeAttribute(attributeName(key));
            previous.attributes.delete(key);
            continue;
        }
        if (isEnumeratedAttribute(key)) {
            root.setAttribute(attributeName(key), value === true ? "true" : String(value));
            previous.attributes.add(key);
            continue;
        }
        root.setAttribute(attributeName(key), value === true ? "" : String(value));
        previous.attributes.add(key);
    }

    return previous;
}

export function clearRestListeners(root: HTMLElement, state: RestPropsState): void {
    for (const entry of state.listeners.values()) {
        root.removeEventListener(entry.type, entry.listener);
    }
    state.listeners.clear();
}

/** Bind both callback and object refs and return the matching cleanup. */
export function bindRef<T>(element: T | null, ref: React.Ref<T> | undefined): () => void {
    if (!element || !ref) return () => undefined;

    if (typeof ref === "function") {
        const cleanup = ref(element);
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            if (typeof cleanup === "function") cleanup();
            else ref(null);
        };
    }

    ref.current = element;
    return () => {
        if (ref.current === element) ref.current = null;
    };
}
