import { ReactNode } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { Panel, renderIcon, Text, Tooltip } from "../../uikit";
import { ChevronRightIcon } from "../../theme/icons";
import color from "../../theme/color";
import type { IconRef, SlotText } from "../../uikit";

// =============================================================================
// SideBarPanelHeader
// =============================================================================

/**
 * The "Show in main view" zone — a button pinned to the right edge of the panel
 * header, separated by a vertical divider. It matches the header bar's own
 * background (`dark`) and hover (`light`); the header's hover-lightening is
 * guarded (in CollapsiblePanelStack) with `:not(:has(this:hover))` so the zone
 * and the rest of the header light up independently — only the hovered region
 * changes. When this editor is already the page's main view, `data-active`
 * tints the chevron blue (the same active-blue the open panel header uses) as a
 * status cue; clicking is a no-op in that state (the consumer guards it).
 */
const ShowMainZone = styled.button(
    {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        alignSelf: "stretch", // fill the full header height
        margin: "-2px -4px -2px 0", // bleed over the header's 2px/4px padding to the edges
        padding: "0 8px",
        border: "none",
        borderLeft: `1px solid ${color.border.light}`, // the vertical divider
        background: color.background.dark,
        color: color.icon.light,
        cursor: "pointer",
        "& > svg": { width: 14, height: 14 },
        "&:hover": {
            background: color.background.light,
            color: color.icon.default,
        },
        "&[data-active], &[data-active]:hover": {
            color: color.misc.blue,
        },
    },
    { label: "ShowMainZone" },
);

export interface SideBarPanelHeaderProps {
    /** Debug label → data-name on the title-group wrapper. */
    name?: string;
    /** Portal target supplied to the panel via `SecondaryViewProps`. Null until the
     *  panel stack has mounted the header element. */
    headerRef: HTMLDivElement | null;
    /** Leading icon — forwarded from `SecondaryViewProps.icon` (resolved by
     *  `SecondaryViews.tsx` as registry-override ?? `EditorIcon`). Rendered as a
     *  DIRECT child of the header div so the stack's
     *  `[data-part="header"] > svg { width:14; height:14 }` sizing rule applies. */
    icon?: IconRef;
    /** Optional leading badge (e.g. a repo-name `<Tag truncate>`), rendered before
     *  the title inside the shrinkable title group. */
    badge?: ReactNode;
    /** Panel title. A string is wrapped in a truncating `<Text>`; a node is rendered
     *  as-is inside the truncating, flex-growing title region. */
    title: SlotText;
    /** Trailing action buttons. Rendered in a region that never shrinks, so the
     *  buttons stay fully visible while the title group truncates. */
    actions?: ReactNode;
    /** When set, render the standardized "Show in main view" zone-button at the
     *  far right of the header (after `actions`). Always visible — clicking
     *  brings this editor's view onto the page as the main editor. */
    onShowMain?: () => void;
    /** Tooltip for the show-main zone. Defaults to "Show in main view". */
    showMainTitle?: string;
    /** `true` when this editor is already the page's main view. Tints the zone's
     *  chevron blue (selected/status cue); the consumer's `onShowMain` no-ops. */
    showMainActive?: boolean;
}

/**
 * Shared header for sidebar secondary-view panels. Each panel renders one of these
 * and passes its own icon/badge/title/actions; the component portals the content
 * into the panel-stack header element and lays it out so the buttons stay pinned
 * while the title group (badge + title) truncates as the sidebar narrows.
 *
 * Layout (left → right):
 *   [icon]  [ title group — flex:1, min-width:0, overflow:hidden ]  [ actions — flex-shrink:0 ]
 *
 * The icon is rendered first and unwrapped so it remains a direct child of the
 * header div and keeps the stack's `& > svg` sizing. The title group grows to fill
 * (pushing actions to the right edge) and clips/ellipsizes its content; the actions
 * region never shrinks, so the buttons are always visible.
 */
export function SideBarPanelHeader({
    name,
    headerRef,
    icon,
    badge,
    title,
    actions,
    onShowMain,
    showMainTitle,
    showMainActive,
}: SideBarPanelHeaderProps) {
    if (!headerRef) return null;
    return createPortal(
        <>
            {renderIcon(icon)}
            <Panel
                name={name ?? "sidebar-panel-title"}
                direction="row"
                align="center"
                gap="sm"
                flex={1}
                width={0}
                overflow="hidden"
            >
                {badge}
                {typeof title === "string" ? (
                    <Text color="inherit" truncate size="md">
                        {title}
                    </Text>
                ) : (
                    title
                )}
            </Panel>
            {actions && (
                <Panel
                    name="sidebar-panel-actions"
                    direction="row"
                    align="center"
                    gap="xs"
                    shrink={false}
                >
                    {actions}
                </Panel>
            )}
            {onShowMain && (
                <Tooltip content={showMainTitle ?? "Show in main view"}>
                    <ShowMainZone
                        data-type="sidebar-show-main"
                        data-active={showMainActive || undefined}
                        onClick={(e) => {
                            e.stopPropagation();
                            onShowMain();
                        }}
                    >
                        <ChevronRightIcon />
                    </ShowMainZone>
                </Tooltip>
            )}
        </>,
        headerRef,
    );
}
