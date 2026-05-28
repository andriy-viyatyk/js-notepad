import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton, Input, Spinner, Text } from "../../uikit";
import { highlight } from "../../uikit/shared/highlight";
import { EditorError } from "../base/EditorError";
import type { GraphEditor } from "./GraphEditor";
import type { SearchResult } from "./GraphSearchModel";
import { GraphTooltip } from "./GraphTooltip";
import { buildSelectionMenu, SelectionMenuActions, SelectionMenuInfo } from "./GraphContextMenu";
import { showAppPopupMenu } from "../../ui/dialogs/poppers/showPopupMenu";
import { GraphDetailPanel } from "./GraphDetailPanel";
import { GraphTuningSliders } from "./GraphTuningSliders";
import { GraphExpansionSettings } from "./GraphExpansionSettings";
import { GraphLegendPanel } from "./GraphLegendPanel";
import { CloseIcon, SettingsIcon, RefreshIcon, ExpandAllIcon, GraphGroupIcon } from "../../theme/icons";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import color from "../../theme/color";

// ============================================================================
// Constants
// ============================================================================

type ToolbarPanel = "closed" | "settings" | "expansion" | "results";
const MAX_DISPLAYED_RESULTS = 100;

// ============================================================================
// Inline styles
// ============================================================================

const rootStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    overflow: "hidden",
    position: "relative",
};

const loadingStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "1 1 auto",
    backgroundColor: color.graph.background,
};

const canvasStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    flex: "1 1 auto",
    backgroundColor: color.graph.background,
};

const emptyHintStyle: React.CSSProperties = {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
    color: color.graph.labelText,
    opacity: 0.5,
    fontSize: 12,
};

const toolbarRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: 2,
};

const searchInfoStyle: React.CSSProperties = {
    fontSize: 11,
    color: color.graph.labelText,
    whiteSpace: "nowrap",
    flexShrink: 0,
};

const selectionInfoStyle: React.CSSProperties = {
    fontSize: 11,
    color: color.graph.nodeHighlight,
    whiteSpace: "nowrap",
    flexShrink: 0,
    cursor: "pointer",
};

const tabsRowStyle: React.CSSProperties = {
    display: "flex",
    borderBottom: `1px solid ${color.border.default}`,
    backgroundColor: color.background.dark,
};

const tabStyleBase: React.CSSProperties = {
    padding: "3px 8px",
    fontSize: 11,
    cursor: "pointer",
    color: color.graph.labelText,
    backgroundColor: "transparent",
    border: "none",
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
};

const tabActiveStyle: React.CSSProperties = {
    ...tabStyleBase,
    borderBottomColor: color.graph.nodeHighlight,
};

const searchResultsListStyle: React.CSSProperties = {
    maxHeight: 300,
    overflowY: "auto",
};

const searchResultRowBase: React.CSSProperties = {
    padding: "3px 8px",
    cursor: "pointer",
    fontSize: 11,
    lineHeight: 1.4,
    borderBottom: `1px solid ${color.border.default}`,
};

const searchResultTitleStyle: React.CSSProperties = {
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};

const searchResultPropStyle: React.CSSProperties = {
    fontStyle: "italic",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};

const searchResultPropKeyStyle: React.CSSProperties = {
    opacity: 0.6,
};

const searchStatusBarStyle: React.CSSProperties = {
    padding: "3px 8px",
    fontSize: 11,
    color: color.graph.labelText,
    borderTop: `1px solid ${color.border.default}`,
    display: "flex",
    justifyContent: "space-between",
};

const searchNoResultsStyle: React.CSSProperties = {
    padding: 8,
    fontSize: 11,
    opacity: 0.5,
    textAlign: "center",
};

// ============================================================================
// GraphSearchResults Component
// ============================================================================

interface GraphSearchResultsProps {
    results: SearchResult[];
    searchQuery: string;
    selectedIndex: number;
    onSelect: (nodeId: string) => void;
}

function GraphSearchResults({ results, searchQuery, selectedIndex, onSelect }: GraphSearchResultsProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const truncated = results.length > MAX_DISPLAYED_RESULTS;
    const displayed = truncated ? results.slice(0, MAX_DISPLAYED_RESULTS) : results;

    useEffect(() => {
        if (selectedIndex < 0 || !listRef.current) return;
        const row = listRef.current.children[selectedIndex] as HTMLElement | undefined;
        row?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    return (
        <div style={searchResultsListStyle} ref={listRef}>
            {displayed.map((result, i) => {
                const rowStyle: React.CSSProperties = {
                    ...searchResultRowBase,
                    opacity: result.visible ? 1 : 0.5,
                    backgroundColor: i === selectedIndex ? color.background.selection : undefined,
                };
                return (
                    <div
                        key={result.nodeId}
                        style={rowStyle}
                        onClick={() => onSelect(result.nodeId)}
                    >
                        <div style={searchResultTitleStyle}>
                            {highlight(result.label, searchQuery)}
                        </div>
                        {result.matchedProps.map((prop) => (
                            <div key={prop.key} style={searchResultPropStyle}>
                                <span style={searchResultPropKeyStyle}>
                                    {highlight(prop.key, searchQuery)}
                                </span>
                                {": "}
                                {highlight(prop.value, searchQuery)}
                            </div>
                        ))}
                    </div>
                );
            })}
            {truncated && (
                <div style={searchNoResultsStyle}>
                    and {results.length - MAX_DISPLAYED_RESULTS} more...
                </div>
            )}
        </div>
    );
}

// ============================================================================
// GraphBody Component
// ============================================================================

interface GraphBodyProps {
    model: GraphEditor;
    /** Callback receiving the canvas element. The view shell holds the ref
     *  and shares it with `<GraphToolbarBits>` (open-draw + copy-image buttons). */
    canvasRefSetter?: (canvas: HTMLCanvasElement | null) => void;
}

export function GraphBody({ model: editor, canvasRefSetter }: GraphBodyProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [toolbarPanel, setToolbarPanel] = useState<ToolbarPanel>("closed");
    const [toolbarHovered, setToolbarHovered] = useState(false);
    const [toolbarFocusWithin, setToolbarFocusWithin] = useState(false);
    const [expandRequest, setExpandRequest] = useState(0);
    const [collapseRequest, setCollapseRequest] = useState(0);
    const [selectedResultIndex, setSelectedResultIndex] = useState(-1);
    const panelDirtyRef = useRef(false);
    const panelExpandedRef = useRef(false);
    const popupClosedAtRef = useRef(0);

    // PV8 — focus queue drain. <TextChrome>'s root-focus puts focus on the
    // outer panel; the canvas grabs focus naturally on click.
    editor.typedQueue.use(() => {
        // no-op
    });

    const toggleSettings = useCallback(() => {
        setToolbarPanel((prev) => prev === "settings" ? "closed" : "settings");
    }, []);

    // GR3 — wire onDoubleClickNode for GraphDetailPanel expand integration.
    useEffect(() => {
        editor.onDoubleClickNode = () => setExpandRequest((n) => n + 1);
        return () => { editor.onDoubleClickNode = null; };
    }, [editor]);

    // Reactive read of all view-derived state.
    const pageState = editor.state.use((s) => s);

    useEffect(() => {
        editor.refreshColors();
    });

    const { searchQuery, searchInfo, searchResults, tooltip, selectedNodes, linkedNodes, groupingEnabled } = pageState;

    useEffect(() => {
        if (searchResults && searchResults.length > 0) {
            setToolbarPanel("results");
            setSelectedResultIndex(-1);
        } else if (!searchQuery) {
            setToolbarPanel((prev) => prev === "results" ? "closed" : prev);
        }
    }, [searchResults, searchQuery]);

    const onSearchChange = useCallback((value: string) => {
        editor.setSearchQuery(value);
    }, [editor]);

    const onSelectResult = useCallback((nodeId: string) => {
        editor.revealAndSelectNode(nodeId);
    }, [editor]);

    const onSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        const results = editor.state.get().searchResults;
        const count = results?.length ?? 0;

        if (e.key === "ArrowDown" && count > 0) {
            e.preventDefault();
            setSelectedResultIndex((prev) => (prev + 1) % Math.min(count, MAX_DISPLAYED_RESULTS));
        } else if (e.key === "ArrowUp" && count > 0) {
            e.preventDefault();
            const max = Math.min(count, MAX_DISPLAYED_RESULTS);
            setSelectedResultIndex((prev) => (prev - 1 + max) % max);
        } else if (e.key === "Enter" && results && count > 0) {
            e.preventDefault();
            const idx = selectedResultIndex >= 0 ? selectedResultIndex : 0;
            if (idx < count) {
                onSelectResult(results[idx].nodeId);
            }
        } else if (e.key === "Escape") {
            if (toolbarPanel !== "closed") {
                setToolbarPanel("closed");
            } else {
                editor.setSearchQuery("");
                if (inputRef.current) inputRef.current.value = "";
                inputRef.current?.blur();
            }
        }
    }, [editor, selectedResultIndex, toolbarPanel, onSelectResult]);

    const onSearchClear = useCallback(() => {
        editor.setSearchQuery("");
        if (inputRef.current) inputRef.current.value = "";
        inputRef.current?.focus();
    }, [editor]);

    const onSearchFocus = useCallback(() => {
        const results = editor.state.get().searchResults;
        if (results && results.length > 0) {
            setToolbarPanel("results");
        }
    }, [editor]);

    const onRevealHidden = useCallback(() => {
        editor.revealHiddenMatches();
    }, [editor]);

    const handleExpandAll = useCallback(async () => {
        if (editor.totalNodeCount > 1000) {
            const result = await showConfirmationDialog({
                title: "Expand All Nodes",
                message: `This graph has ${editor.totalNodeCount} nodes. Expanding all may cause performance issues. Continue?`,
            });
            if (result !== "Yes") return;
        }
        editor.expandAll();
    }, [editor]);

    const canvasElRef = useRef<HTMLCanvasElement | null>(null);
    const canvasRef = useCallback((el: HTMLCanvasElement | null) => {
        canvasElRef.current = el;
        editor.renderer.setCanvas(el);
        canvasRefSetter?.(el);
    }, [editor, canvasRefSetter]);

    const onPanelDirtyChange = useCallback((dirty: boolean) => {
        panelDirtyRef.current = dirty;
    }, []);

    const onPanelExpandedChange = useCallback((exp: boolean) => {
        panelExpandedRef.current = exp;
    }, []);

    const onMouseDownCapture = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) return;
        if (editor.isPopupOpen) {
            popupClosedAtRef.current = Date.now();
        }
        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    }, [editor]);

    useEffect(() => {
        const activeRef = { current: false };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Shift" || activeRef.current) return;
            const selectedIds = editor.renderer.selectedIds;
            if (selectedIds.size === 0) return;
            activeRef.current = true;
            const ids = new Set(selectedIds);
            const cm = editor.connectivityModel;
            for (const nodeId of selectedIds) {
                for (const id of cm.getProcessedNeighborIds(nodeId)) ids.add(id);
                for (const id of cm.getRealNeighborIds(nodeId)) ids.add(id);
            }
            editor.renderer.setAltKeyHighlight(ids);
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key !== "Shift" || !activeRef.current) return;
            activeRef.current = false;
            editor.renderer.setAltKeyHighlight(null);
        };
        const onBlur = () => {
            if (!activeRef.current) return;
            activeRef.current = false;
            editor.renderer.setAltKeyHighlight(null);
        };
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, [editor]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === "f") {
                e.preventDefault();
                inputRef.current?.focus();
                inputRef.current?.select();
            }
            if (e.ctrlKey && e.key === "a") {
                e.preventDefault();
                const allIds = editor.renderer.getNodes().map(n => n.id);
                editor.renderer.selectNode("");
                editor.renderer.addToSelection(allIds);
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [editor]);

    const onSelectionClick = useCallback(async (e: React.MouseEvent) => {
        const count = selectedNodes.length;
        if (count === 0) return;
        const hasGroups = selectedNodes.some(n => n.isGroup);
        const hasNonGroups = selectedNodes.some(n => !n.isGroup);
        const info: SelectionMenuInfo = { count, hasGroups, hasNonGroups };
        const actions: SelectionMenuActions = {
            selectChildren: () => editor.selectChildren(),
            selectMembers: () => editor.selectMembers(),
            selectMembersDeep: () => editor.selectMembersDeep(),
            highlight: () => editor.highlightSelection(),
            copyMarkdown: () => editor.copySelectedMarkdown(),
            openMarkdown: () => editor.openSelectedMarkdown(),
            openGrid: () => editor.openSelectedGrid(),
            extract: () => editor.extractSelected(false),
            extractWithChildren: () => editor.extractSelected(true),
            deleteNodes: () => editor.deleteSelectedNodes(),
            groupSelected: () => editor.groupSelectedNodes(),
        };
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        editor.isPopupOpen = true;
        await showAppPopupMenu(rect.left, rect.bottom + 2, buildSelectionMenu(info, actions, groupingEnabled));
        editor.isPopupOpen = false;
    }, [editor, selectedNodes, groupingEnabled]);

    const { error, loading } = pageState;
    const isExpanded = toolbarPanel !== "closed";
    const hasSearch = !!searchQuery;
    const resultCount = searchResults?.length ?? 0;

    const toolbarStyle: React.CSSProperties = {
        position: "absolute",
        top: 8,
        left: 8,
        display: "flex",
        flexDirection: "column",
        width: "fit-content",
        maxWidth: "80%",
        backgroundColor: color.graph.background,
        border: `1px solid ${isExpanded ? color.graph.nodeHighlight : color.border.default}`,
        borderRadius: 4,
        zIndex: 1,
        opacity: (toolbarHovered || toolbarFocusWithin || isExpanded || hasSearch) ? 1 : 0.5,
        transition: "opacity 0.15s",
    };

    return (
        <div ref={containerRef} style={rootStyle} onMouseDownCapture={onMouseDownCapture}>
            {error && <EditorError>{error}</EditorError>}
            {loading ? (
                <div style={loadingStyle}>
                    <Spinner />
                </div>
            ) : (
                <>
                    <canvas
                        style={canvasStyle}
                        ref={canvasRef}
                        onClick={(e) => {
                            if (panelDirtyRef.current) return;
                            if (Date.now() - popupClosedAtRef.current < 300) return;
                            if (isExpanded || panelExpandedRef.current) {
                                if (!isExpanded && panelExpandedRef.current && editor.renderer.hasNodeAt(e)) {
                                    editor.renderer.onClick(e);
                                    return;
                                }
                                setToolbarPanel("closed");
                                setCollapseRequest((n) => n + 1);
                                return;
                            }
                            editor.renderer.onClick(e);
                        }}
                        onDoubleClick={(e) => { if (panelDirtyRef.current) return; editor.renderer.onDblClick(e); }}
                        onContextMenu={(e) => { if (panelDirtyRef.current) return; setToolbarPanel("closed"); editor.renderer.onContextMenu(e); }}
                        onMouseMove={editor.renderer.onMouseMove}
                    />
                    {editor.isEmpty && (
                        <div style={emptyHintStyle}>
                            Right-click → Add Node to start building the graph
                        </div>
                    )}
                    <div
                        style={toolbarStyle}
                        onMouseEnter={() => setToolbarHovered(true)}
                        onMouseLeave={() => setToolbarHovered(false)}
                        onFocus={() => setToolbarFocusWithin(true)}
                        onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                                setToolbarFocusWithin(false);
                            }
                        }}
                    >
                        <div style={toolbarRowStyle}>
                            <IconButton
                                name="graph-settings"
                                size="sm"
                                icon={<SettingsIcon />}
                                active={toolbarPanel === "settings"}
                                onClick={toggleSettings}
                                title="Force tuning"
                            />
                            <IconButton
                                name="graph-toggle-grouping"
                                size="sm"
                                icon={<GraphGroupIcon />}
                                strikethrough={groupingEnabled}
                                disabled={!editor.hasGroups}
                                onClick={() => editor.toggleGrouping()}
                                title={groupingEnabled ? "Disable grouping" : "Enable grouping"}
                            />
                            <IconButton
                                name="graph-reset-view"
                                size="sm"
                                icon={<RefreshIcon />}
                                onClick={() => editor.resetView()}
                                title="Reset view"
                            />
                            {editor.hasVisibilityFilter && (
                                <IconButton
                                    name="graph-expand-all"
                                    size="sm"
                                    icon={<ExpandAllIcon />}
                                    onClick={handleExpandAll}
                                    title="Expand all nodes"
                                />
                            )}
                            <Input
                                name="graph-search"
                                ref={inputRef}
                                size="sm"
                                width={130}
                                placeholder="Search nodes..."
                                value={searchQuery}
                                onChange={onSearchChange}
                                onKeyDown={onSearchKeyDown}
                                onFocus={onSearchFocus}
                                endSlot={
                                    searchQuery ? (
                                        <IconButton
                                            name="graph-search-clear"
                                            size="sm"
                                            icon={<CloseIcon />}
                                            title="Clear search"
                                            onClick={onSearchClear}
                                        />
                                    ) : undefined
                                }
                            />
                            {searchInfo && !isExpanded && (
                                <span style={searchInfoStyle}>
                                    {searchInfo.visible} matched
                                </span>
                            )}
                            {selectedNodes.length > 0 && (
                                <span style={selectionInfoStyle} onClick={onSelectionClick}>
                                    {selectedNodes.length} selected ▾
                                </span>
                            )}
                        </div>
                        {isExpanded && (
                            <>
                                <div style={tabsRowStyle}>
                                    <button
                                        style={toolbarPanel === "settings" ? tabActiveStyle : tabStyleBase}
                                        onClick={() => setToolbarPanel("settings")}
                                    >
                                        Physics
                                    </button>
                                    <button
                                        style={toolbarPanel === "expansion" ? tabActiveStyle : tabStyleBase}
                                        onClick={() => setToolbarPanel("expansion")}
                                    >
                                        Expansion
                                    </button>
                                    <button
                                        style={toolbarPanel === "results" ? tabActiveStyle : tabStyleBase}
                                        onClick={() => setToolbarPanel("results")}
                                    >
                                        Results{resultCount > 0 ? ` (${resultCount})` : ""}
                                    </button>
                                </div>
                                {toolbarPanel === "settings" && <GraphTuningSliders editor={editor} />}
                                {toolbarPanel === "expansion" && <GraphExpansionSettings editor={editor} />}
                                {toolbarPanel === "results" && (
                                    <>
                                        {searchResults && searchResults.length > 0 ? (
                                            <GraphSearchResults
                                                results={searchResults}
                                                searchQuery={searchQuery}
                                                selectedIndex={selectedResultIndex}
                                                onSelect={onSelectResult}
                                            />
                                        ) : (
                                            <div style={searchNoResultsStyle}>
                                                {searchQuery ? "No results" : "Type to search"}
                                            </div>
                                        )}
                                        {searchInfo && (
                                            <div style={searchStatusBarStyle}>
                                                <span>{searchInfo.visible} visible</span>
                                                {searchInfo.hidden > 0 && (
                                                    <Text variant="link" onClick={onRevealHidden}>
                                                        [+{searchInfo.hidden} hidden]
                                                    </Text>
                                                )}
                                                <Text variant="link" onClick={() => editor.selectSearchResults()}>
                                                    [{selectedNodes.length > 0 ? "add to selection" : "select all"}]
                                                </Text>
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                    {tooltip && (
                        <GraphTooltip
                            node={tooltip.node} x={tooltip.x} y={tooltip.y} isRoot={tooltip.isRoot}
                            onMouseEnter={() => editor.setTooltipHovered(true)}
                            onMouseLeave={() => editor.setTooltipHovered(false)}
                        />
                    )}
                    <GraphDetailPanel
                        nodes={selectedNodes.filter((n) => !n.isGroup)}
                        linkedNodes={linkedNodes}
                        onUpdateProps={(nodeId, props) => editor.updateNodeProps(nodeId, props)}
                        onBatchUpdateProps={(nodeIds, props) => editor.batchUpdateNodeProps(nodeIds, props)}
                        onRenameNode={(oldId, newId) => editor.renameNode(oldId, newId)}
                        onApplyLinks={(nodeId, rows, origIds) => editor.applyLinkedNodesUpdate(nodeId, rows, origIds)}
                        onApplyProperties={(nodeId, propsToSet, keysToRemove) => editor.applyPropertiesUpdate(nodeId, propsToSet, keysToRemove)}
                        onBatchApplyProperties={(nodeIds, propsToSet, keysToRemove) => editor.batchApplyPropertiesUpdate(nodeIds, propsToSet, keysToRemove)}
                        onPanelDirtyChange={onPanelDirtyChange}
                        onPanelExpandedChange={onPanelExpandedChange}
                        onHighlightSet={(ids) => editor.setHighlightSet(ids)}
                        onExternalHover={(id) => editor.setExternalHover(id)}
                        onExpandNode={(id) => editor.expandNode(id)}
                        containerRef={containerRef}
                        expandRequest={expandRequest}
                        collapseRequest={collapseRequest}
                    />
                    <GraphLegendPanel editor={editor} />
                </>
            )}
        </div>
    );
}
