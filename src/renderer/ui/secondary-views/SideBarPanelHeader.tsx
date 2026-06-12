import { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Panel, Text } from "../../uikit";

// =============================================================================
// SideBarPanelHeader
// =============================================================================

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
    icon?: ReactNode;
    /** Optional leading badge (e.g. a repo-name `<Tag truncate>`), rendered before
     *  the title inside the shrinkable title group. */
    badge?: ReactNode;
    /** Panel title. A string is wrapped in a truncating `<Text>`; a node is rendered
     *  as-is inside the truncating, flex-growing title region. */
    title: ReactNode;
    /** Trailing action buttons. Rendered in a region that never shrinks, so the
     *  buttons stay fully visible while the title group truncates. */
    actions?: ReactNode;
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
}: SideBarPanelHeaderProps) {
    if (!headerRef) return null;
    return createPortal(
        <>
            {icon}
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
        </>,
        headerRef,
    );
}
