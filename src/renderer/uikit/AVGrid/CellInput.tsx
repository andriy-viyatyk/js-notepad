import { useEffect, useRef } from "react";
import type { Ref } from "react";
import styled from "@emotion/styled";
import { Input, InputProps } from "../Input";

/**
 * Cell-edit wrapper over `uikit/Input`. Used inside AVGrid's
 * `DefaultEditFormater` for text / number cell editing.
 *
 * Responsibilities:
 *   • Autofocus on mount (and select-all unless `dontSelect`).
 *   • Stop character-key propagation so the grid's content keydown handler
 *     does not also receive them while editing.
 *   • Fit the wrapped Input flush inside the cell (absolute positioning,
 *     borderless, transparent background — descendant selectors apply via
 *     `[data-type="input"]` per uikit/CLAUDE.md option 1 pattern).
 *
 * Enter / Tab / Escape / click-outside all bubble up to the grid's
 * `EditingModel.onContentKeyDown` / `onContentBlur` so the existing
 * commit / cancel lifecycle stays at one source of truth.
 */
export interface CellInputProps extends Pick<InputProps, "value" | "onChange" | "name" | "placeholder"> {
    ref?: Ref<HTMLInputElement>;
    /** When true, autofocus does not select-all. Set by AVGrid when edit is initiated
     *  via a character keystroke (the typed char becomes the value, cursor at end). */
    dontSelect?: boolean;
}

const Root = styled.div({
    position: "absolute",
    inset: 1,
    display: "flex",
    // Override UIKit Input's `data-size` chrome to fit the cell exactly:
    // the Wrapper's fixed height (controlMd = 26px) is replaced with 100%
    // so the input matches `cell.height - 2px`, and the Field's 8px
    // horizontal padding is replaced with 3px to align with the cell's
    // `padding: 0 4px` text position (1px Root inset + 3px field = 4px).
    '& [data-type="input"]': {
        border: "none",
        borderRadius: 0,
        backgroundColor: "transparent",
        flex: 1,
        minWidth: 0,
        height: "100%",
    },
    '& [data-type="input"] input': {
        paddingLeft: 3,
        paddingRight: 3,
        fontSize: "inherit",
    },
});

export function CellInput({ value, onChange, name, placeholder, dontSelect, ref }: CellInputProps) {
    const innerRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        innerRef.current?.focus();
        if (!dontSelect) innerRef.current?.select();
    }, [dontSelect]);

    return (
        <Root>
            <Input
                ref={(el) => {
                    innerRef.current = el;
                    if (typeof ref === "function") ref(el);
                    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
                }}
                name={name}
                value={value ?? ""}
                onChange={onChange}
                placeholder={placeholder}
                onKeyDown={(e) => {
                    if (e.key.length === 1) e.stopPropagation();
                }}
            />
        </Root>
    );
}
