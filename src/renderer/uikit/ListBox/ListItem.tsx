import React, { forwardRef } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { gap, height, spacing } from "../tokens";
import { renderIcon } from "../shared/slots";
import type { IconRef, SlotText } from "../shared/slots";
import { highlight } from "../shared/highlight";
import { rowSelectionBase, rowFocusSelectionOverride } from "../shared/selection-style";
import { Tooltip } from "../Tooltip";

// --- Types ---

export interface ListItemProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Stable id used for `aria-activedescendant` wiring. */
    id?: string;
    /** Leading icon. */
    icon?: IconRef;
    /** Label content. Link editor folder rows retain a styled rich label; string labels are highlighted. */
    label: React.ReactNode;
    /** Highlight matches in string labels. */
    searchText?: string;
    /** True when this item is the current `value` of its ListBox. */
    selected?: boolean;
    /** True when this item is the current `activeIndex` of its ListBox. */
    active?: boolean;
    /** True when this item should not respond to clicks. */
    disabled?: boolean;
    /**
     * Tooltip body shown after the standard hover delay. When `null`, `undefined`, `false`,
     * or empty string, no tooltip is rendered.
     */
    tooltip?: SlotText;
    /**
     * Override the Tooltip's `delayShow` (ms) for this row. Only meaningful when `tooltip`
     * is set. Leave undefined to use the global Tooltip default.
     */
    tooltipDelayShow?: number;
    /** Trailing slot — defaults to a check icon when `selected`. */
    trailing?: React.ReactNode;
    /**
     * Visual style.
     *   • `"select"` (default) — strong selection-style highlight on hover/active.
     *     Matches Select dropdowns and menus where selection feedback should be loud.
     *   • `"browse"` — soft hover background (no text-color change). Matches the
     *     legacy folder tree feel; use for sidebar / browse-style lists where hover
     *     is purely a navigation cue.
     */
    variant?: "select" | "browse";
    /**
     * How the selected state is rendered.
     *   • `"check"` (default) — trailing check icon (when no custom `trailing` is set).
     *   • `"accent"` — filled selection background + trailing chevron-right icon.
     *     Use for sidebar/browse lists where selection is persistent navigation
     *     state and the selected row's details are shown to the right.
     *   • `"focus"` — focus-aware selection (Explorer look): gray when the list is
     *     blurred, blue + outline when the list is focused. Pair with `variant="browse"`.
     *     No default trailing icon.
     */
    selectionStyle?: "check" | "accent" | "focus";
    /**
     * Controls whether the default trailing selection icon (check / chevron-right per
     * `selectionStyle`) renders when `selected` is true. Set to `false` to keep the
     * background fill of `selectionStyle="accent"` while suppressing the chevron — use
     * this when the row is pure selection feedback rather than navigation into a detail
     * pane. Ignored when a custom `trailing` is provided. Default: `true`.
     */
    showSelectionIcon?: boolean;
    /**
     * True while a drag is hovering this row and it is the active drop target. Paints the
     * drop feedback, which deliberately outranks the selection and hover states — a row can
     * be selected *and* be the drop target, and the drop is the transient thing the user
     * needs to see. Mirrors `TreeItem`'s `dropActive`.
     */
    dropActive?: boolean;
}

// --- Styled ---

const Root = styled.div(
    {
        display: "inline-flex",
        width: "100%",
        boxSizing: "border-box",
        alignItems: "center",
        gap: gap.md,
        paddingLeft: spacing.sm,
        paddingRight: spacing.sm,
        cursor: "pointer",
        color: color.text.default,
        overflow: "hidden",

        "&[data-disabled]": { opacity: 0.4, pointerEvents: "none" },
        '&[data-variant="select"][data-active], &[data-variant="select"]:hover': {
            backgroundColor: color.background.selection,
            color: color.text.selection,
        },
        '&[data-variant="browse"][data-active], &[data-variant="browse"]:hover': {
            backgroundColor: color.background.message,
        },
        '&[data-selection-style="accent"][data-selected]': {
            backgroundColor: color.background.selection,
            color: color.text.selection,
        },
        // Focus-aware selection (Explorer look): blurred-state gray base here...
        '&[data-selection-style="focus"]': {
            ...rowSelectionBase,
        },
        // ...and the blue focused override hosted on the row itself, so a standalone
        // ListItem (outside ListBox) lights up whenever it sits inside any focused-within
        // [data-focus-selection] container. The container needs only data-focus-selection +
        // tabIndex=0 (no Emotion). Also covers ListItem inside ListBox.
        // `:not([data-drop-active])` keeps the focused-list selection paint off a row that is
        // showing drop feedback. Without it that override — one attribute more specific than
        // any rule below — would win on a row that is both selected and the drop target.
        ...rowFocusSelectionOverride('[data-selection-style="focus"]:not([data-drop-active])'),

        // Last, so it outranks the hover and accent-selection rules above at equal specificity.
        "&[data-drop-active]:not([data-disabled])": {
            backgroundColor: color.background.selection,
            color: color.text.dark,
            outline: `1px solid ${color.border.active}`,
            outlineOffset: -1,
        },

        "& > svg": {
            width: height.iconMd,
            height: height.iconMd,
            flexShrink: 0,
        },

        "& > .label": {
            flex: "1 1 auto",
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
        },
    },
    { label: "ListItem" },
);

// --- Component ---

export const ListItem = forwardRef<HTMLDivElement, ListItemProps>(function ListItem(
    {
        name,
        id,
        icon,
        label,
        searchText,
        selected,
        active,
        disabled,
        tooltip,
        tooltipDelayShow,
        trailing,
        variant = "select",
        selectionStyle = "check",
        showSelectionIcon = true,
        dropActive,
        ...rest
    },
    ref,
) {
    const labelNode =
        typeof label === "string" && searchText ? highlight(label, searchText) : label;
    const defaultTrailing = selected && showSelectionIcon && selectionStyle !== "focus"
        ? selectionStyle === "accent"
            ? renderIcon("chevron-right")
            : renderIcon("check")
        : null;
    const row = (
        <Root
            ref={ref}
            id={id}
            data-type="list-item"
            data-name={name}
            data-variant={variant}
            data-selection-style={selectionStyle}
            data-selected={selected || undefined}
            data-active={active || undefined}
            data-disabled={disabled || undefined}
            data-drop-active={dropActive || undefined}
            role="option"
            aria-selected={selected ? "true" : "false"}
            aria-disabled={disabled ? "true" : undefined}
            {...rest}
        >
            {renderIcon(icon)}
            <span className="label">{labelNode}</span>
            {trailing ?? defaultTrailing}
        </Root>
    );
    if (tooltip == null || tooltip === false || tooltip === "") return row;
    return <Tooltip content={tooltip} delayShow={tooltipDelayShow}>{row}</Tooltip>;
});
