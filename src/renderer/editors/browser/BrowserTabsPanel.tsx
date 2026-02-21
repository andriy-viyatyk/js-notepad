import styled from "@emotion/styled";
import { useCallback } from "react";
import color from "../../theme/color";
import { CloseIcon, GlobeIcon, PlusIcon } from "../../theme/icons";
import { BrowserPageModel, BrowserTabData } from "./BrowserPageModel";
import { Button } from "../../components/basic/Button";
import { MenuItem } from "../../components/overlay/PopupMenu";

/** Below this width, hide tab titles and show icon-only compact mode. */
const COMPACT_THRESHOLD = 70;

/** Below this width, hide the close button even in normal mode. */
const CLOSE_BUTTON_THRESHOLD = 100;

const BrowserTabsPanelRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: color.background.default,
    height: "100%",

    "& .tabs-list": {
        flex: "1 1 auto",
        overflowY: "auto",
        overflowX: "hidden",
    },

    "& .tab-item": {
        display: "flex",
        alignItems: "center",
        height: 28,
        boxSizing: "border-box",
        padding: "0 4px 0 8px",
        gap: 6,
        cursor: "pointer",
        borderLeft: "2px solid transparent",
        "&:hover": {
            backgroundColor: color.background.light,
        },
        "&.active": {
            backgroundColor: color.background.selection,
            borderLeftColor: color.border.active,
        },
        "&:hover .tab-close, &.active .tab-close": {
            opacity: 1,
        },
    },

    "& .tab-item.compact": {
        justifyContent: "center",
        padding: "0 4px",
        borderLeft: "none",
        borderBottom: "2px solid transparent",
        "&.active": {
            borderLeftColor: "transparent",
            borderBottomColor: color.border.active,
        },
    },

    "& .tab-favicon": {
        width: 14,
        height: 14,
        flexShrink: 0,
        "& svg": {
            width: 14,
            height: 14,
            color: color.icon.default,
        },
        "& img": {
            width: 14,
            height: 14,
        },
    },

    "& .tab-title": {
        flex: "1 1 auto",
        fontSize: 12,
        color: color.text.default,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },

    "& .tab-close": {
        flexShrink: 0,
        opacity: 0,
    },

    "& .add-tab-button": {
        height: 28,
        padding: "0 4px 0 8px",
        display: "flex",
        alignItems: "center",
    },

    "& .add-tab-button.compact": {
        justifyContent: "center",
        padding: "0 4px",
    },
});

interface BrowserTabsPanelProps {
    model: BrowserPageModel;
    tabs: BrowserTabData[];
    activeTabId: string;
    width: number;
}

export function BrowserTabsPanel({
    model,
    tabs,
    activeTabId,
    width,
}: BrowserTabsPanelProps) {
    const compact = width < COMPACT_THRESHOLD;
    const showClose = !compact && width >= CLOSE_BUTTON_THRESHOLD;

    const handleNewTab = useCallback(() => {
        model.addTab();
    }, [model]);

    const handleSwitchTab = useCallback(
        (tabId: string) => {
            model.switchTab(tabId);
        },
        [model],
    );

    const handleCloseTab = useCallback(
        (e: React.MouseEvent, tabId: string) => {
            e.stopPropagation();
            model.closeTab(tabId);
        },
        [model],
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent, tabId: string) => {
            const nativeEvent = e.nativeEvent;
            if (!nativeEvent.menuItems) {
                nativeEvent.menuItems = [];
            }

            const tabIndex = tabs.findIndex((t) => t.id === tabId);
            const hasTabsBelow = tabIndex < tabs.length - 1;

            const menuItems: MenuItem[] = [
                {
                    label: "Close Tab",
                    onClick: () => model.closeTab(tabId),
                    disabled: tabs.length <= 1,
                },
                {
                    label: "Close Other Tabs",
                    onClick: () => model.closeOtherTabs(tabId),
                    disabled: tabs.length <= 1,
                },
                {
                    label: "Close Tabs Below",
                    onClick: () => model.closeTabsBelow(tabId),
                    disabled: !hasTabsBelow,
                },
            ];

            nativeEvent.menuItems.push(...menuItems);
        },
        [model, tabs],
    );

    return (
        <BrowserTabsPanelRoot>
            <div className="tabs-list">
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={`tab-item${tab.id === activeTabId ? " active" : ""}${compact ? " compact" : ""}`}
                        onClick={() => handleSwitchTab(tab.id)}
                        onContextMenu={(e) => handleContextMenu(e, tab.id)}
                        title={compact ? (tab.pageTitle || tab.url || "New Tab") : undefined}
                    >
                        <div className="tab-favicon">
                            {tab.favicon ? (
                                <img src={tab.favicon} alt="" />
                            ) : (
                                <GlobeIcon />
                            )}
                        </div>
                        {!compact && (
                            <div className="tab-title">
                                {tab.pageTitle || tab.url || "New Tab"}
                            </div>
                        )}
                        {showClose && (
                            <div className="tab-close">
                                <Button
                                    type="icon"
                                    size="small"
                                    title="Close Tab"
                                    onClick={(e) =>
                                        handleCloseTab(e, tab.id)
                                    }
                                >
                                    <CloseIcon />
                                </Button>
                            </div>
                        )}
                    </div>
                ))}
                <div className={`add-tab-button${compact ? " compact" : ""}`}>
                    <Button
                        type="icon"
                        size="small"
                        title="New Tab"
                        onClick={handleNewTab}
                    >
                        <PlusIcon />
                    </Button>
                </div>
            </div>
        </BrowserTabsPanelRoot>
    );
}
