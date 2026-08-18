import { useCallback, useMemo, useRef, useState } from "react";
import { useFloating, offset as floatingOffset, autoUpdate } from "@floating-ui/react";
import { TraitTypeId, setTraitDragData, getTraitDragData, hasTraitDragData } from "../../core/traits";
import { CloseIcon, GlobeIcon, PlusIcon, VolumeIcon, VolumeMutedIcon } from "../../theme/icons";
import { BrowserEditorModel, BrowserTabData } from "./BrowserEditorModel";
import { Panel, IconButton } from "../../uikit";
import type { MenuItem } from "../../uikit";
import { ContextMenuEvent } from "../../api/events/events";
import "./BrowserTabsPanel.css";

/** Below this width, hide tab titles and show icon-only compact mode. */
const COMPACT_THRESHOLD = 70;

/** Below this width, hide the close button even in normal mode. */
const CLOSE_BUTTON_THRESHOLD = 100;

// =============================================================================
// Tab Item
// =============================================================================

interface TabItemProps {
    tab: BrowserTabData;
    model: BrowserEditorModel;
    isActive: boolean;
    compact: boolean;
    showClose: boolean;
    isHovered: boolean;
    groupColorIndex: number;
    onSwitch: (tabId: string) => void;
    onClose: (e: React.MouseEvent, tabId: string) => void;
    onToggleMute: (e: React.MouseEvent, tabId: string) => void;
    onContextMenu: (e: React.MouseEvent, tabId: string) => void;
    onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>, tabId: string) => void;
    onMouseLeave?: () => void;
}

function TabItem({
    tab, model, isActive, compact, showClose, isHovered, groupColorIndex,
    onSwitch, onClose, onToggleMute, onContextMenu, onMouseEnter, onMouseLeave,
}: TabItemProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isOver, setIsOver] = useState(false);
    const dragEnterCount = useRef(0);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        e.stopPropagation();
        setTraitDragData(e.dataTransfer, TraitTypeId.BrowserTab, { tabId: tab.id });
        setIsDragging(true);
    }, [tab.id]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        dragEnterCount.current++;
        if (hasTraitDragData(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setIsOver(true);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (hasTraitDragData(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        }
    }, []);

    const handleDragLeave = useCallback(() => {
        dragEnterCount.current--;
        if (dragEnterCount.current <= 0) {
            dragEnterCount.current = 0;
            setIsOver(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragEnterCount.current = 0;
        setIsOver(false);
        const payload = getTraitDragData(e.dataTransfer);
        if (!payload || payload.typeId !== TraitTypeId.BrowserTab) return;
        const data = payload.data as { tabId: string };
        model.moveTab(data.tabId, tab.id);
    }, [model, tab.id]);

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            data-tab-item
            data-active={isActive || undefined}
            data-compact={compact || undefined}
            data-dragging={isDragging || undefined}
            data-drop-target={isOver || undefined}
            data-hover-extended={isHovered || undefined}
            data-group-color={groupColorIndex % 2}
            onClick={() => onSwitch(tab.id)}
            onContextMenu={(e) => onContextMenu(e, tab.id)}
            onMouseEnter={onMouseEnter ? (e) => onMouseEnter(e, tab.id) : undefined}
            onMouseLeave={onMouseLeave}
        >
            <div data-tab-favicon>
                {tab.favicon ? (
                    <img
                        src={tab.favicon}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                            (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("data-hidden");
                        }}
                    />
                ) : null}
                <GlobeIcon data-hidden={tab.favicon ? "" : undefined} />
            </div>
            {!compact && (
                <div data-tab-title>
                    {tab.pageTitle || tab.url || "New Tab"}
                </div>
            )}
            {!compact && (tab.audible || tab.muted) && (
                <IconButton
                    name="tab-mute"
                    size="sm"
                    icon={tab.muted ? <VolumeMutedIcon /> : <VolumeIcon />}
                    title={tab.muted ? "Unmute Tab" : "Mute Tab"}
                    onClick={(e) => onToggleMute(e, tab.id)}
                />
            )}
            {showClose && (
                <IconButton
                    data-tab-close
                    name="tab-close"
                    size="sm"
                    icon={<CloseIcon />}
                    title="Close Tab"
                    onClick={(e) => onClose(e, tab.id)}
                />
            )}
        </div>
    );
}

// =============================================================================
// Panel
// =============================================================================

interface BrowserTabsPanelProps {
    model: BrowserEditorModel;
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

    const groupColorMap = useMemo(() => {
        const map = new Map<string, number>();
        let idx = 0;
        for (const tab of tabs) {
            if (!map.has(tab.groupId)) {
                map.set(tab.groupId, idx++);
            }
        }
        return map;
    }, [tabs]);

    const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
    const hoveredTabRef = useRef<HTMLDivElement | null>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { refs, floatingStyles } = useFloating({
        placement: "right-start",
        middleware: [floatingOffset({ mainAxis: -1 })],
        strategy: "fixed",
        whileElementsMounted: autoUpdate,
    });

    const hoveredTab = hoveredTabId
        ? tabs.find((t) => t.id === hoveredTabId) ?? null
        : null;

    const handleTabHover = useCallback(
        (e: React.MouseEvent<HTMLDivElement>, tabId: string) => {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
            }
            hoveredTabRef.current = e.currentTarget;
            refs.setReference(e.currentTarget);
            setHoveredTabId(tabId);
        },
        [refs],
    );

    const scheduleClose = useCallback(() => {
        closeTimeoutRef.current = setTimeout(() => {
            setHoveredTabId(null);
            closeTimeoutRef.current = null;
        }, 100);
    }, []);

    const cancelClose = useCallback(() => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    }, []);

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

    const handleToggleMute = useCallback(
        (e: React.MouseEvent, tabId: string) => {
            e.stopPropagation();
            model.toggleMute(tabId);
        },
        [model],
    );

    const handleExtensionClose = useCallback(
        (e: React.MouseEvent, tabId: string) => {
            e.stopPropagation();
            model.closeTab(tabId);
            setHoveredTabId(null);
        },
        [model],
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent, tabId: string) => {
            const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "browser-tab");

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

            ctxEvent.items.push(...menuItems);
        },
        [model, tabs],
    );

    return (
        <div className="browser-tabs-root">
            <Panel
            name="browser-tabs-root"
            direction="column" overflow="hidden" background="default"
            width="100%" height="100%"
        >
            <Panel
                name="browser-tabs-list"
                direction="column" flex={1} overflowY="auto" overflowX="hidden"
            >
                {tabs.map((tab) => (
                    <TabItem
                        key={tab.id}
                        tab={tab}
                        model={model}
                        isActive={tab.id === activeTabId}
                        compact={compact}
                        showClose={showClose}
                        isHovered={tab.id === hoveredTabId}
                        groupColorIndex={groupColorMap.get(tab.groupId) ?? 0}
                        onSwitch={handleSwitchTab}
                        onClose={handleCloseTab}
                        onToggleMute={handleToggleMute}
                        onContextMenu={handleContextMenu}
                        onMouseEnter={compact ? handleTabHover : undefined}
                        onMouseLeave={compact ? scheduleClose : undefined}
                    />
                ))}
                <Panel
                    name="add-tab-row"
                    direction="row" align="center"
                    paddingX="xs" height={28}
                    justify={compact ? "center" : "start"}
                >
                    <IconButton
                        name="add-tab-button"
                        size="sm"
                        icon={<PlusIcon />}
                        title="New Tab"
                        onClick={handleNewTab}
                    />
                </Panel>
            </Panel>
            {compact && hoveredTab && (
                <div
                    ref={refs.setFloating}
                    data-tab-extension
                    data-active={hoveredTabId === activeTabId || undefined}
                    style={{ ...floatingStyles, zIndex: 1000 }}
                    onMouseEnter={cancelClose}
                    onMouseLeave={scheduleClose}
                    onClick={() => handleSwitchTab(hoveredTabId)}
                >
                    <span data-part="title">
                        {hoveredTab.pageTitle || hoveredTab.url || "New Tab"}
                    </span>
                    {(hoveredTab.audible || hoveredTab.muted) && (
                        <IconButton
                            name="tab-extension-mute"
                            size="sm"
                            icon={hoveredTab.muted ? <VolumeMutedIcon /> : <VolumeIcon />}
                            title={hoveredTab.muted ? "Unmute Tab" : "Mute Tab"}
                            onClick={(e) => handleToggleMute(e, hoveredTabId)}
                        />
                    )}
                    <IconButton
                        name="tab-extension-close"
                        size="sm"
                        icon={<CloseIcon />}
                        title="Close Tab"
                        onClick={(e) => handleExtensionClose(e, hoveredTabId)}
                    />
                </div>
            )}
            </Panel>
        </div>
    );
}
