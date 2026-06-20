import React from "react";
import styled from "@emotion/styled";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import { WithMenu } from "../Menu/WithMenu";
import { ChevronDownIcon } from "../../theme/icons";
import type { MenuItem } from "../Menu/types";
import color from "../../theme/color";
import { radius } from "../tokens";

// --- Types ---

export interface SplitButtonProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onClick" | "title"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances in DOM inspector output. Never used for styling. */
    name?: string;
    /** Primary-region icon. */
    icon: React.ReactNode;
    /** Primary-region tooltip (the default action). */
    title?: React.ReactNode;
    /** Primary-region click — the default action, mirrored by the matching dropdown item. */
    onClick: () => void;
    /** Dropdown items revealed by the caret region. */
    items: MenuItem[];
    /** Disables the primary region (the caret stays usable unless `menuDisabled`). */
    disabled?: boolean;
    /** Disables the caret / dropdown. */
    menuDisabled?: boolean;
    /** Control size — matches IconButton. Default "md". */
    size?: "sm" | "md";
    /** Caret tooltip. Default "More actions". */
    menuTitle?: React.ReactNode;
    /** Optional primary-region label. When provided, the primary renders as a text
     *  `Button` (icon + label); when omitted, it's an icon-only `IconButton`. */
    children?: React.ReactNode;
}

// --- Styled ---

const Root = styled.div(
    {
        display: "inline-flex",
        alignItems: "center",
        borderRadius: radius.sm,
        flexShrink: 0,
        // The separator is a hover affordance — hidden at rest, shown only while the whole
        // control is hovered, so an idle toolbar stays quiet. Painted in the icon color
        // (not the much fainter border color) so the thin 1px line is actually visible.
        '&:hover [data-part="separator"]': {
            background: color.icon.light,
        },
    },
    { label: "SplitButton" },
);

// Short divider — icon-height, vertically centered by Root's `alignItems: center` — so the
// two regions read as one split control rather than two separate buttons. Owned here (a
// standalone span, not a border on the caret) so its height is independent of the button
// height and it survives the Tooltip wrapper IconButton adds when a title is set.
// Transparent at rest; Root's `:hover` rule paints it in.
const Separator = styled.span(
    {
        width: 1,
        height: 14,
        flexShrink: 0,
        background: "transparent",
    },
    { label: "SplitButtonSeparator" },
);

// Caret region — a smaller, dimmed chevron in a tight hit area so it reads as a secondary
// affordance attached to the primary action (mirrors the page-tabs add-page dropdown).
const CaretSlot = styled.div(
    {
        display: "inline-flex",
        alignItems: "center",
        // Narrow the caret to ~half the primary's width so it reads as an attached
        // secondary affordance, not a co-equal button. IconButton fixes its width via
        // `&[data-size] { width }` (specificity 0,2,0); out-specify it with the extra
        // `[data-name]` step (0,3,0 / 0,4,0 with data-size).
        '& [data-type="icon-button"][data-name="split-caret"]': {
            minWidth: 0,
            padding: 0,
        },
        '& [data-type="icon-button"][data-name="split-caret"][data-size="sm"]': { width: 14 },
        '& [data-type="icon-button"][data-name="split-caret"][data-size="md"]': { width: 16 },
        // IconButton sizes its glyph via `&[data-size] svg` (specificity 0,2,1). To shrink
        // the caret chevron below that we must out-specify it — hence the extra
        // `[data-part="icon"]` step (0,3,1). A plain `& svg` (0,1,1) would lose and the
        // chevron would stay full size.
        '& [data-type="icon-button"] [data-part="icon"] svg': {
            width: 13,
            height: 13,
        },
        "& svg": {
            opacity: 0.6,
        },
        "&:hover svg": {
            opacity: 1,
        },
    },
    { label: "SplitButtonCaret" },
);

// --- Component ---

export function SplitButton({
    name,
    icon,
    title,
    onClick,
    items,
    disabled,
    menuDisabled,
    size = "md",
    menuTitle = "More actions",
    children,
    ...rest
}: SplitButtonProps) {
    return (
        <Root data-type="split-button" data-name={name} {...rest}>
            {children != null ? (
                <Button
                    name="split-primary"
                    size={size}
                    title={title}
                    icon={icon}
                    disabled={disabled}
                    onClick={onClick}
                >
                    {children}
                </Button>
            ) : (
                <IconButton
                    name="split-primary"
                    size={size}
                    title={title}
                    icon={icon}
                    disabled={disabled}
                    onClick={onClick}
                />
            )}
            <Separator data-part="separator" />
            <CaretSlot>
                <WithMenu name={name ? `${name}-menu` : undefined} items={items} placement="bottom-end">
                    {(setOpen) => (
                        <IconButton
                            name="split-caret"
                            size={size}
                            title={menuTitle}
                            icon={<ChevronDownIcon />}
                            disabled={menuDisabled}
                            onClick={(e) => setOpen(e.currentTarget)}
                        />
                    )}
                </WithMenu>
            </CaretSlot>
        </Root>
    );
}
