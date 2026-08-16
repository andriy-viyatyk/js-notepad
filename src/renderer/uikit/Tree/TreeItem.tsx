import React, { forwardRef } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { gap, height, spacing } from "../tokens";
import { renderIcon } from "../shared/slots";
import type { IconRef, SlotText } from "../shared/slots";
import { highlight } from "../shared/highlight";
import { rowSelectionBase } from "../shared/selection-style";
import { Tooltip } from "../Tooltip";
import { Spinner } from "../Spinner";

// --- Types ---

export interface TreeItemProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Stable id used for `aria-activedescendant` wiring. */
    id?: string;
    /** Depth — 0 for root rows, +1 per level. */
    level: number;
    /** True when the row is currently expanded. */
    expanded: boolean;
    /** True when the row has children — drives chevron visibility. */
    hasChildren: boolean;
    /** Leading icon (rendered after the chevron). */
    icon?: IconRef;
    /** Label content. Rich tree rows remain supported; string labels are highlighted. */
    label: React.ReactNode;
    /** Highlight matches in string labels. */
    searchText?: string;
    /** True when this item is the current selection of its Tree. */
    selected?: boolean;
    /** True when this item is the current `activeIndex` of its Tree. */
    active?: boolean;
    /** True when this row is the source of an active drag. */
    dragging?: boolean;
    /** True when this row is the drop target under the drag cursor. */
    dropActive?: boolean;
    /** True when `loadChildren` is currently in flight for this row. */
    loading?: boolean;
    /** True when this item should not respond to clicks. */
    disabled?: boolean;
    /**
     * Tooltip body shown after the standard hover delay. When `null`, `undefined`, `false`,
     * or empty string, no tooltip is rendered.
     */
    tooltip?: SlotText;
    /** Indentation step in pixels per level. Default: 16. */
    indentSize?: number;
    /**
     * When true, no chevron and no chevron-stub placeholder are rendered for this row.
     * The icon sits flush after the row's indents. Use for non-collapsible rows
     * (e.g. a single permanent root in a tree-provider view) to avoid a leading column
     * of empty space.
     */
    hideChevron?: boolean;
    /**
     * Called when the user clicks the chevron. Tree's model owns expansion state — pass
     * `(e) => model.onChevronClick(e, idx)` from the View.
     */
    onChevronClick?: (e: React.MouseEvent) => void;
    /**
     * Optional right-aligned trailing content (e.g. a per-row action IconButton).
     * Rendered after the label, which is `flex:1 1 auto` and pushes this to the row's
     * right edge. The trailing content owns its own click handling — to avoid also
     * triggering the row's onClick, its handlers should `stopPropagation()`.
     */
    trailing?: React.ReactNode;
    /**
     * When the trailing content is shown. `"always"` (default) keeps it visible at all times —
     * the original behavior, so existing consumers are unchanged. `"hover"` hides it at rest and
     * reveals it on row hover or keyboard focus-within (e.g. a per-row action that should not
     * clutter the row until pointed at). Per-row sticky state (e.g. a pinned row that should keep
     * its action visible) is expressed by passing `"always"` for that row.
     */
    trailingVisibility?: "always" | "hover";
}

// --- Styled ---

const Root = styled.div(
    {
        display: "inline-flex",
        width: "100%",
        boxSizing: "border-box",
        alignItems: "center",
        gap: gap.xs,
        paddingRight: spacing.sm,
        cursor: "pointer",
        color: color.text.default,
        userSelect: "none",
        whiteSpace: "nowrap",
        overflow: "hidden",

        "&[data-disabled]": { opacity: 0.4, pointerEvents: "none" },
        // Blurred-state selected/active backgrounds — single-sourced with ListBox + the
        // Tree container's focused override via uikit/shared/selection-style.
        ...rowSelectionBase,
        // The focused-list selected row is painted with the dark treeSelection background
        // by the Tree container's override, and its label follows via the row's `color`.
        // The chevron and the level guides set colors of their own, so they don't inherit
        // it — left alone, a dark chevron and light-gray guides sit on top of the highlight.
        // The chevron takes the selected icon color; the guides simply disappear into the
        // highlight rather than needing a token that reads correctly against it.
        "[data-focus-selection]:focus-within &[data-selected]": {
            "& > .tree-chevron, & > .tree-chevron:hover": {
                color: color.icon.selection,
            },
            "& > .tree-indent": {
                borderLeftColor: "transparent",
            },
        },
        "&[data-dragging]": {
            opacity: 0.5,
        },
        "&[data-drop-active]": {
            backgroundColor: color.background.selection,
            color: color.text.dark,
        },
        "&[data-loading]": {
            // Hook for future "dim while loading" styling — current visual change is the
            // chevron→spinner swap inside the row, kept attribute-only for now.
        },

        "& > .tree-icon": {
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            "& svg": {
                width: height.iconMd,
                height: height.iconMd,
            },
        },

        "& > .label": {
            flex: "1 1 auto",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
        },

        "& > .tree-trailing": {
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            transition: "opacity 80ms ease",
        },

        // Hover-reveal: hide the trailing at rest, show it on row hover or keyboard
        // focus-within. Rows that opt out (e.g. a pinned row) pass trailingVisibility="always".
        '&[data-trailing-visibility="hover"] > .tree-trailing': { opacity: 0 },
        '&[data-trailing-visibility="hover"]:hover > .tree-trailing': { opacity: 1 },
        '&[data-trailing-visibility="hover"]:focus-within > .tree-trailing': { opacity: 1 },
    },
    { label: "TreeItem" },
);

const Indent = styled.div<{ size: number; first: boolean }>(
    ({ size, first }) => ({
        width: size,
        height: "100%",
        flexShrink: 0,
        borderLeft: first ? "none" : `1px solid ${color.border.light}`,
    }),
    { label: "TreeItemIndent" },
);

const Chevron = styled.button<{ size: number }>(
    ({ size }) => ({
        width: size,
        height: size,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        margin: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: color.icon.default,

        "&:hover": {
            color: color.icon.active,
        },

        "& svg": {
            width: 12,
            height: 12,
        },
    }),
    { label: "TreeItemChevron" },
);

const ChevronStub = styled.div<{ size: number }>(
    ({ size }) => ({
        width: size,
        height: size,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    }),
    { label: "TreeItemChevronStub" },
);

// --- Component ---

const defaultIndentSize = 16;
// Chevron column is intentionally narrower than indents — keeps the level guides at 16px
// steps for clean hierarchy while making the row's leading whitespace tight.
const chevronColumnSize = 14;

export const TreeItem = forwardRef<HTMLDivElement, TreeItemProps>(function TreeItem(
    {
        name,
        id,
        level,
        expanded,
        hasChildren,
        icon,
        label,
        searchText,
        selected,
        active,
        dragging,
        dropActive,
        loading,
        disabled,
        tooltip,
        indentSize = defaultIndentSize,
        hideChevron,
        onChevronClick,
        trailing,
        trailingVisibility = "always",
        ...rest
    },
    ref,
) {
    const labelNode =
        typeof label === "string" && searchText ? highlight(label, searchText) : label;

    const row = (
        <Root
            ref={ref}
            id={id}
            data-type="tree-item"
            data-name={name}
            data-state={expanded ? "open" : "closed"}
            data-selected={selected || undefined}
            data-active={active || undefined}
            data-dragging={dragging || undefined}
            data-drop-active={dropActive || undefined}
            data-loading={loading || undefined}
            data-disabled={disabled || undefined}
            data-trailing-visibility={trailingVisibility}
            role="treeitem"
            aria-selected={selected ? "true" : "false"}
            aria-expanded={hasChildren ? expanded : undefined}
            aria-level={level + 1}
            aria-disabled={disabled ? "true" : undefined}
            {...rest}
        >
            {Array.from({ length: level }).map((_, i) => (
                <Indent key={i} className="tree-indent" size={indentSize} first={i === 0} />
            ))}
            {hideChevron ? null : loading ? (
                <ChevronStub size={chevronColumnSize} aria-label="Loading">
                    <Spinner size={12} />
                </ChevronStub>
            ) : hasChildren ? (
                <Chevron
                    className="tree-chevron"
                    size={chevronColumnSize}
                    type="button"
                    tabIndex={-1}
                    aria-label={expanded ? "Collapse" : "Expand"}
                    onClick={onChevronClick}
                >
                    {renderIcon(expanded ? "chevron-down" : "chevron-right")}
                </Chevron>
            ) : (
                <ChevronStub size={chevronColumnSize} />
            )}
            {icon && <span className="tree-icon">{renderIcon(icon)}</span>}
            <span className="label">{labelNode}</span>
            {trailing != null && <span className="tree-trailing">{trailing}</span>}
        </Root>
    );

    if (tooltip == null || tooltip === false || tooltip === "") return row;
    return <Tooltip content={tooltip}>{row}</Tooltip>;
});
