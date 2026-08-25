import React from "react";
import { mountVanilla } from "../shared/mount";
import { TextareaView } from "./TextareaView";
import "./Textarea.css";

// --- Types ---

export interface TextareaProps
    extends Omit<
        React.HTMLAttributes<HTMLDivElement>,
        // Rule 7 — forbid style/className on UIKit components.
        | "style" | "className"
        // Reimplemented with a string-value API instead of an event API.
        | "onChange" | "onInput"
        // Composed with internal handlers — see `onKeyDown` / `onPaste` prop docs below.
        | "onPaste" | "onKeyDown"
        | "contentEditable"
        // The component's content comes from `value`, not `children`.
        | "children"
        // Never makes sense on a contentEditable surface.
        | "dangerouslySetInnerHTML"
    > {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Current text value. */
    value: string;
    /** Change handler — receives the string value directly, not the event. */
    onChange?: (value: string) => void;
    /** Empty-state placeholder text. */
    placeholder?: string;
    /** Disabled — non-editable, dimmed, no caret on click. */
    disabled?: boolean;
    /** Read-only — shows content, suppresses editing, NOT dimmed. */
    readOnly?: boolean;
    /** Single-line mode — Enter is suppressed; newlines in pasted text are stripped. Default: false. */
    singleLine?: boolean;
    /** Minimum height in px (the control reserves at least this much vertical space). */
    minHeight?: number;
    /** Maximum height in px before vertical scrolling kicks in. */
    maxHeight?: number;
    /** Fixed width — number → px, string passes through (e.g. "30%"). */
    width?: number | string;
    /** Min width — number → px, string passes through. */
    minWidth?: number | string;
    /** Max width — number → px, string passes through. */
    maxWidth?: number | string;
    /** Flex shorthand on self. `true` → "1 1 auto"; number → "<n> 1 auto"; string passes through. Mirrors `Panel.flex`. */
    flex?: boolean | number | string;
    /** Size variant — controls font size. Default: "md". */
    size?: "sm" | "md";
    /**
     * Visual variant. `"default"` renders the standard chrome (dark background, gray border).
     * `"ghost"` renders transparent background and border at rest, with a gray border on hover
     * and a blue border on focus — for inline-edit fields embedded in list/grid rows. Default:
     * `"default"`.
     */
    variant?: "default" | "ghost";
    /** Auto-focus on mount. Default: false. */
    autoFocus?: boolean;
    /**
     * Caller-supplied keydown hook. Runs BEFORE the internal handler. If the caller calls
     * `e.preventDefault()`, the internal `singleLine` Enter-suppression is skipped (the caller
     * has taken ownership of the event). Use this for URL-bar style flows where Enter must
     * trigger a submit instead of inserting a newline.
     */
    onKeyDown?: (event: KeyboardEvent) => void;
    /**
     * Caller-supplied paste hook. Runs BEFORE the internal handler. If the caller calls
     * `e.preventDefault()`, the internal paste-insertion is skipped (the caller has fully
     * handled the paste — typically by replacing the value through some other route).
     * Use this for paste-detection flows (e.g. cURL/fetch parsing in a URL bar).
     */
    onPaste?: (event: ClipboardEvent) => void;
}

// --- Component ---

export function Textarea(props: TextareaProps): React.ReactElement {
    return mountVanilla(TextareaView, props);
}
