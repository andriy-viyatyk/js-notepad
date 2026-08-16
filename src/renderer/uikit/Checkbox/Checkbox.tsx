import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { gap, height } from "../tokens";
import { renderIcon } from "../shared/slots";

// --- Types ---

export interface CheckboxProps
    extends Omit<React.HTMLAttributes<HTMLLabelElement>, "onChange"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Checked state (controlled). */
    checked: boolean;
    /** Change handler — receives the new boolean value. */
    onChange: (checked: boolean) => void;
    /** Disables interaction. */
    disabled?: boolean;
}

// --- Styled ---

const Root = styled.label(
    {
        display: "inline-flex",
        alignItems: "center",
        gap: gap.sm,
        cursor: "pointer",
        userSelect: "none",
        color: color.text.default,

        "& [data-part='icon']": {
            flexShrink: 0,
            width: height.iconMd,
            height: height.iconMd,
            color: color.text.light,
            "& svg": {
                width: height.iconMd,
                height: height.iconMd,
            },
        },
        "&:hover [data-part='icon']": {
            color: color.text.default,
        },
        "&[data-disabled]": {
            cursor: "default",
            opacity: 0.5,
        },
        "&[data-disabled]:hover [data-part='icon']": {
            color: color.text.light,
        },
    },
    { label: "Checkbox" },
);

// --- Component ---

export function Checkbox({ name, checked, onChange, disabled, children, ...rest }: CheckboxProps) {
    const handleClick = (e: React.MouseEvent<HTMLLabelElement>) => {
        if (disabled) return;
        e.preventDefault();
        onChange(!checked);
    };

    return (
        <Root
            data-type="checkbox"
            data-name={name}
            data-checked={String(checked)}
            data-disabled={disabled || undefined}
            onClick={handleClick}
            {...rest}
        >
            <span data-part="icon">
                {renderIcon(checked ? "checked" : "unchecked")}
            </span>
            {children}
        </Root>
    );
}
