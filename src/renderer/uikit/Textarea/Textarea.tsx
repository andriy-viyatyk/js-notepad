import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { fontSize, radius, spacing } from "../tokens";

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
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
    /**
     * Caller-supplied paste hook. Runs BEFORE the internal handler. If the caller calls
     * `e.preventDefault()`, the internal paste-insertion is skipped (the caller has fully
     * handled the paste — typically by replacing the value through some other route).
     * Use this for paste-detection flows (e.g. cURL/fetch parsing in a URL bar).
     */
    onPaste?: React.ClipboardEventHandler<HTMLDivElement>;
}

// --- Helpers ---

function innerTextToString(text: string): string {
    if (text === "\n") return "";
    if (text.endsWith("\n")) return text.slice(0, -1);
    return text;
}

// --- Styled ---

const Root = styled.div(
    {
        padding: `${spacing.sm}px ${spacing.md}px`,
        backgroundColor: color.background.dark,
        color: color.text.dark,
        border: `1px solid ${color.border.light}`,
        borderRadius: radius.md,
        outline: "none",
        boxSizing: "border-box",
        whiteSpace: "pre-wrap",
        // Wrap long unbreakable strings (URLs, cookies, tokens) at any character so the
        // control grows vertically instead of overflowing its width-constrained box.
        overflowWrap: "anywhere",
        overflowY: "auto",

        '&[data-size="sm"]': { fontSize: fontSize.sm },
        '&[data-size="md"]': { fontSize: fontSize.base },

        "&:focus, &:active": {
            borderColor: color.border.active,
        },
        "&[data-readonly]:focus, &[data-readonly]:active": {
            borderColor: color.border.light,
        },

        "&:empty::before": {
            content: "attr(data-placeholder)",
            color: color.text.light,
            pointerEvents: "none",
        },

        "&[data-disabled]": {
            opacity: 0.5,
            pointerEvents: "none",
        },

        // Ghost variant — transparent at rest, hover/focus borders only.
        '&[data-variant="ghost"]': {
            backgroundColor: "transparent",
            borderColor: "transparent",
        },
        '&[data-variant="ghost"]:hover':                       { borderColor: color.border.default },
        '&[data-variant="ghost"]:focus, &[data-variant="ghost"]:active': { borderColor: color.border.active },
        '&[data-variant="ghost"][data-readonly]:focus, &[data-variant="ghost"][data-readonly]:active': {
            borderColor: "transparent",
        },
    },
    { label: "Textarea" },
);

// --- Component ---

export const Textarea = function Textarea(props: TextareaProps) {
        const {
            name,
            value,
            onChange,
            placeholder,
            disabled,
            readOnly,
            singleLine,
            minHeight,
            maxHeight,
            width,
            minWidth,
            maxWidth,
            flex,
            size = "md",
            variant = "default",
            autoFocus,
            onKeyDown,
            onPaste,
            ...rest
        } = props;
        const divRef = React.useRef<HTMLDivElement>(null);
        const editable = !disabled && !readOnly;

        React.useEffect(() => {
            const el = divRef.current;
            if (el && innerTextToString(el.innerText) !== value) {
                el.innerText = value ?? "";
            }
        }, [value]);

        React.useEffect(() => {
            if (autoFocus) {
                const id = setTimeout(() => divRef.current?.focus(), 0);
                return () => clearTimeout(id);
            }
        }, [autoFocus]);

        const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
            let text = e.currentTarget.innerText;
            if (singleLine && text.includes("\n")) {
                text = text.replace(/\n/g, "");
                e.currentTarget.innerText = text;
            } else {
                text = innerTextToString(text);
            }
            onChange?.(text);
        };

        const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
            onPaste?.(e);
            if (e.defaultPrevented) return;
            e.preventDefault();
            let text = e.clipboardData.getData("text/plain");
            if (singleLine) text = text.replace(/\n/g, "");

            const sel = window.getSelection();
            if (!sel?.rangeCount) return;
            sel.deleteFromDocument();
            const node = document.createTextNode(text);
            sel.getRangeAt(0).insertNode(node);
            const range = document.createRange();
            range.setStartAfter(node);
            range.setEndAfter(node);
            sel.removeAllRanges();
            sel.addRange(range);

            onChange?.(innerTextToString(divRef.current?.innerText ?? ""));
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
            onKeyDown?.(e);
            if (e.defaultPrevented) return;
            if (singleLine && e.key === "Enter") e.preventDefault();
        };

        const style: React.CSSProperties = {};
        if (minHeight !== undefined) style.minHeight = minHeight;
        if (maxHeight !== undefined) style.maxHeight = maxHeight;
        if (width      !== undefined) style.width    = width;
        if (minWidth   !== undefined) style.minWidth = minWidth;
        if (maxWidth   !== undefined) style.maxWidth = maxWidth;
        if (flex !== undefined && flex !== false) {
            style.flex = flex === true
                ? "1 1 auto"
                : typeof flex === "number"
                ? `${flex} 1 auto`
                : flex;
        }

        return (
            <Root
                ref={divRef}
                {...rest}
                role="textbox"
                aria-multiline={!singleLine}
                contentEditable={editable ? "plaintext-only" : false}
                spellCheck={false}
                data-type="textarea"
                data-name={name}
                data-size={size}
                data-variant={variant}
                data-disabled={disabled || undefined}
                data-readonly={readOnly || undefined}
                data-single-line={singleLine || undefined}
                data-placeholder={placeholder}
                onInput={editable ? handleInput : undefined}
                onPaste={editable ? handlePaste : undefined}
                onKeyDown={editable ? handleKeyDown : undefined}
                tabIndex={editable ? 0 : -1}
                style={style}
            />
        );
    };
