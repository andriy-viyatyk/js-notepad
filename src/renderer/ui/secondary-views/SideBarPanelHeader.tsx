import { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Panel, renderIcon, Text, Tooltip } from "../../uikit";
import { ChevronRightIcon } from "../../theme/icons";
import type { IconRef, SlotText } from "../../uikit";
import "./SideBarPanelHeader.css";

// =============================================================================
// SideBarPanelHeader
// =============================================================================

export interface SideBarPanelHeaderProps {
    /** Debug label → data-name on the title-group wrapper. */
    name?: string;
    /** Portal target supplied to the panel via `SecondaryViewProps`. Null until the
     *  panel stack has mounted the header element. */
    headerRef: HTMLDivElement | null;
    /** Leading icon forwarded from `SecondaryViewProps.icon`, rendered directly in the header. */
    icon?: IconRef;
    /** Optional leading badge, rendered before the title inside the shrinkable title group. */
    badge?: ReactNode;
    /** Panel title. A string is wrapped in a truncating `<Text>`; a node is rendered as-is. */
    title: SlotText;
    /** Trailing action buttons in a non-shrinking region. */
    actions?: ReactNode;
    /** Render the standardized "Show in main view" zone-button. */
    onShowMain?: () => void;
    /** Tooltip for the show-main zone. Defaults to "Show in main view". */
    showMainTitle?: string;
    /** Tints the show-main zone chevron when already active. */
    showMainActive?: boolean;
}

/** Shared header for sidebar secondary-view panels. */
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
                    <button
                        type="button"
                        data-type="sidebar-show-main"
                        data-active={showMainActive || undefined}
                        onClick={(event) => {
                            event.stopPropagation();
                            onShowMain();
                        }}
                    >
                        <ChevronRightIcon />
                    </button>
                </Tooltip>
            )}
        </>,
        headerRef,
    );
}
