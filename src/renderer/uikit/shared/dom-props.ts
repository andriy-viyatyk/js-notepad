import type { NativeSlotContent } from "./fill-slot";

type NativeAttributeValue = string | number | boolean | null | undefined;
type AriaAttribute = { [K in `aria-${string}`]?: NativeAttributeValue };
type DataAttribute = { [K in `data-${string}`]?: NativeAttributeValue };

type NativeEventProps = {
    onBlur?: (event: FocusEvent) => void;
    onClick?: (event: MouseEvent) => void;
    onContextMenu?: (event: MouseEvent) => void;
    onFocus?: (event: FocusEvent) => void;
    onFocusCapture?: (event: FocusEvent) => void;
    onKeyDown?: (event: KeyboardEvent) => void;
    onMouseDown?: (event: MouseEvent) => void;
    onMouseEnter?: (event: MouseEvent) => void;
    onMouseLeave?: (event: MouseEvent) => void;
    onMouseMove?: (event: MouseEvent) => void;
    onMouseUp?: (event: MouseEvent) => void;
    onPaste?: (event: ClipboardEvent) => void;
    onPointerDown?: (event: PointerEvent) => void;
    onPointerLeave?: (event: PointerEvent) => void;
    onPointerMove?: (event: PointerEvent) => void;
    onPointerUp?: (event: PointerEvent) => void;
    onDragEnd?: (event: DragEvent) => void;
    onDragEnter?: (event: DragEvent) => void;
    onDragLeave?: (event: DragEvent) => void;
    onDragOver?: (event: DragEvent) => void;
    onDragStart?: (event: DragEvent) => void;
    onDrop?: (event: DragEvent) => void;
};

export interface NativeHTMLAttributes<_T extends HTMLElement = HTMLElement>
    extends NativeEventProps, AriaAttribute, DataAttribute {
    id?: string;
    title?: string;
    role?: string;
    tabIndex?: number;
    hidden?: boolean;
    type?: string;
    placeholder?: string;
    autoComplete?: string;
    /** Enumerated, not boolean: `""` means `auto`. See `isEnumeratedAttribute`. */
    draggable?: boolean | "true" | "false" | "auto";
    spellCheck?: boolean | "true" | "false";
    contentEditable?: boolean | "true" | "false" | "plaintext-only";
    children?: NativeSlotContent;
}

export interface NativeInputHTMLAttributes<T extends HTMLInputElement = HTMLInputElement>
    extends NativeHTMLAttributes<T> {
    autoFocus?: boolean;
    checked?: boolean;
    defaultValue?: string | number | readonly string[];
    disabled?: boolean;
    max?: number | string;
    maxLength?: number;
    min?: number | string;
    minLength?: number;
    name?: string;
    readOnly?: boolean;
    required?: boolean;
    step?: number | string;
    value?: string | number | readonly string[];
}

export interface NativeButtonHTMLAttributes<T extends HTMLButtonElement = HTMLButtonElement>
    extends NativeHTMLAttributes<T> {
    autoFocus?: boolean;
    disabled?: boolean;
    name?: string;
    type?: "button" | "submit" | "reset";
    value?: string | number | readonly string[];
}

export type NativeLabelHTMLAttributes<T extends HTMLLabelElement = HTMLLabelElement> =
    NativeHTMLAttributes<T> & { htmlFor?: string };

type NativeStyleValue = string | number | undefined;

export interface NativeCSSProperties {
    [key: `--${string}`]: NativeStyleValue;
    alignItems?: NativeStyleValue;
    alignSelf?: NativeStyleValue;
    borderRadius?: NativeStyleValue;
    bottom?: NativeStyleValue;
    flex?: NativeStyleValue;
    flexShrink?: NativeStyleValue;
    flexWrap?: NativeStyleValue;
    gap?: NativeStyleValue;
    height?: NativeStyleValue;
    inset?: NativeStyleValue;
    justifyContent?: NativeStyleValue;
    left?: NativeStyleValue;
    maxHeight?: NativeStyleValue;
    maxWidth?: NativeStyleValue;
    minHeight?: NativeStyleValue;
    minWidth?: NativeStyleValue;
    overflow?: NativeStyleValue;
    overflowX?: NativeStyleValue;
    overflowY?: NativeStyleValue;
    paddingBottom?: NativeStyleValue;
    paddingLeft?: NativeStyleValue;
    paddingRight?: NativeStyleValue;
    paddingTop?: NativeStyleValue;
    position?: NativeStyleValue;
    right?: NativeStyleValue;
    top?: NativeStyleValue;
    whiteSpace?: NativeStyleValue;
    width?: NativeStyleValue;
    wordBreak?: NativeStyleValue;
    zIndex?: NativeStyleValue;
}

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

/**
 * Attributes that look boolean in JSX but are *enumerated* in HTML: their keywords are the strings
 * "true" and "false", and any other value — including the empty string a boolean attribute would
 * use — is invalid and falls back to the attribute's own default.
 *
 * `draggable=""` therefore means `auto`, i.e. a `div` that is not draggable. The helper retains
 * this case for its generic public contract; current link-editor callers pass a `drag` object to
 * `ListItem` rather than forwarding `draggable` through residual props. The browser writes
 * `"true"`.
 */
const ENUMERATED_ATTRIBUTES = new Set(["draggable", "spellcheck", "contenteditable"]);

/**
 * `aria-*` attributes use the "true"/"false" keywords rather than boolean-attribute semantics.
 *
 * The comparison is case-insensitive because the two halves of this contract spell these keys
 * differently: the public props type uses the camelCase DOM-property spellings (`spellCheck`,
 * `contentEditable`) while the set below holds the lowercase attribute names. Matching
 * case-sensitively would send `spellCheck={true}` down the boolean-attribute path and write `""`,
 * which for an enumerated attribute means `auto` — i.e. silently the opposite of what was asked.
 */
function isEnumeratedAttribute(key: string): boolean {
    return ENUMERATED_ATTRIBUTES.has(key.toLowerCase()) || key.startsWith("aria-");
}

function attributeName(key: string): string {
    return key === "className" ? "class" : key === "htmlFor" ? "for" : key;
}

function applyRestEntry(
    root: HTMLElement,
    key: string,
    value: unknown,
    state: RestPropsState,
): void {
    if (key.startsWith("on")) {
        state.attributes.delete(key);
        const prior = state.listeners.get(key);
        if (prior) root.removeEventListener(prior.type, prior.listener);
        state.listeners.delete(key);
        if (typeof value === "function") {
            const eventName = key.slice(2).toLowerCase();
            const type = eventName === "doubleclick" ? "dblclick" : eventName;
            const listener: EventListener = (event) => {
                (value as (event: Event) => void)(event);
            };
            root.addEventListener(type, listener);
            state.listeners.set(key, { type, listener });
        }
        return;
    }

    if (value == null || (value === false && !isEnumeratedAttribute(key))) {
        root.removeAttribute(attributeName(key));
        state.attributes.delete(key);
        return;
    }
    if (isEnumeratedAttribute(key)) {
        root.setAttribute(attributeName(key), value === true ? "true" : String(value));
        state.attributes.add(key);
        return;
    }
    root.setAttribute(attributeName(key), value === true ? "" : String(value));
    state.attributes.add(key);
}

/** Apply or remove one residual attribute/listener while preserving its bookkeeping. */
export function setRestProp(
    root: HTMLElement,
    key: string,
    value: unknown,
    state: RestPropsState,
): void {
    applyRestEntry(root, key, value, state);
}

/** Apply residual attributes/listeners and remove stale values. */
export function applyRestProps(
    root: HTMLElement,
    rest: Record<string, unknown>,
    previous: RestPropsState,
): RestPropsState {
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
        applyRestEntry(root, key, value, previous);
    }

    return previous;
}

export function clearRestListeners(root: HTMLElement, state: RestPropsState): void {
    for (const entry of state.listeners.values()) {
        root.removeEventListener(entry.type, entry.listener);
    }
    state.listeners.clear();
}
