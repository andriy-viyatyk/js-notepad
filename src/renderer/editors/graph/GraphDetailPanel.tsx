import { SetStateAction, useCallback, useEffect, useMemo, useRef } from "react";
import { AVGrid, Button, Input, Panel, detectColumnWidth, type CellFocus, type Column } from "../../uikit";
import { GraphNode, NodeShape, nodeLabel, isReservedPropertyKey } from "./types";
import color from "../../theme/color";
import { ChevronDownIcon, ChevronUpIcon } from "../../theme/icons";
import { ShapeIcon, LevelIcon } from "./GraphIcons";
import "./GraphDetailPanel.css";
import { TComponentModel, useComponentModel } from "../../core/state/model";

// =============================================================================
// Constants
// =============================================================================

const SHAPES: NodeShape[] = ["circle", "square", "diamond", "triangle", "star", "hexagon"];
const LEVELS = [1, 2, 3, 4, 5];
const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 300;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;
const MAX_PERCENT = 0.9;

// =============================================================================
// Inline styles
// =============================================================================

const headerStyleBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    backgroundColor: color.background.default,
    border: `1px solid ${color.border.default}`,
    borderRadius: 4,
    boxShadow: `0 2px 8px ${color.shadow.default}`,
    cursor: "pointer",
    minWidth: 120,
};

const headerNoSelectionStyle: React.CSSProperties = {
    ...headerStyleBase,
    opacity: 0.5,
    pointerEvents: "none",
    cursor: "default",
};

const headerLockedStyle: React.CSSProperties = {
    ...headerStyleBase,
    cursor: "default",
};

const panelTitleStyle: React.CSSProperties = {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: 600,
    color: color.text.default,
};

const panelChevronStyle: React.CSSProperties = {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    color: color.text.light,
};

const panelBodyStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    marginTop: 2,
    backgroundColor: color.background.default,
    border: `1px solid ${color.border.default}`,
    borderRadius: 4,
    boxShadow: `0 2px 8px ${color.shadow.default}`,
    overflow: "hidden",
    position: "relative",
};

const tabsRowStyle: React.CSSProperties = {
    display: "flex",
    borderBottom: `1px solid ${color.border.default}`,
};

const tabStyleBase: React.CSSProperties = {
    flex: 1,
    padding: "4px 8px",
    fontSize: 11,
    border: "none",
    background: "none",
    cursor: "pointer",
    color: color.text.light,
    borderBottom: "2px solid transparent",
};

const tabActiveStyle: React.CSSProperties = {
    ...tabStyleBase,
    color: color.text.default,
    borderBottomColor: color.border.active,
};

const tabDisabledStyle: React.CSSProperties = {
    ...tabStyleBase,
    opacity: 0.4,
    cursor: "default",
};

const contentStyle: React.CSSProperties = {
    flex: 1,
    overflow: "auto",
    padding: 8,
};

const contentNoPadStyle: React.CSSProperties = {
    flex: 1,
    padding: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
};

const infoFieldStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    marginBottom: 8,
};

const infoLabelStyle: React.CSSProperties = {
    fontSize: 11,
    color: color.text.light,
};

const infoErrorStyle: React.CSSProperties = {
    fontSize: 10,
    color: color.error.text,
    marginTop: 1,
};

const infoIconsRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 2,
};

const infoIconBtnBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    border: "1px solid transparent",
    borderRadius: 3,
    background: "none",
    cursor: "pointer",
    color: color.text.light,
    padding: 0,
};

const infoIconBtnSelected: React.CSSProperties = {
    ...infoIconBtnBase,
    borderColor: color.border.active,
    color: color.text.default,
    backgroundColor: color.background.dark,
};

const infoIconBtnMixed: React.CSSProperties = {
    ...infoIconBtnBase,
    color: color.warning.text,
};

const multiInfoStyle: React.CSSProperties = {
    fontSize: 11,
    color: color.warning.text,
    fontStyle: "italic",
    marginBottom: 8,
};

const tabActionRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: 4,
    padding: "4px 6px",
    borderTop: `1px solid ${color.border.default}`,
    flexShrink: 0,
};

const propertiesStatusStyle: React.CSSProperties = {
    fontSize: 10,
    color: color.warning.text,
    padding: "2px 6px",
    borderTop: `1px solid ${color.border.default}`,
    flexShrink: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    userSelect: "text",
    cursor: "text",
};

const resizerStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 12,
    height: 12,
    cursor: "sw-resize",
    opacity: 0.4,
};

// =============================================================================
// Props
// =============================================================================

interface GraphDetailPanelProps {
    nodes: GraphNode[];
    linkedNodes: GraphNode[];
    onUpdateProps: (nodeId: string, props: Partial<GraphNode>) => void;
    onBatchUpdateProps: (nodeIds: string[], props: Partial<GraphNode>) => void;
    onRenameNode: (oldId: string, newId: string) => boolean;
    onApplyLinks: (selectedNodeId: string, rows: Record<string, unknown>[], originalIds: Set<string>) => void;
    onApplyProperties: (nodeId: string, propsToSet: Record<string, string>, keysToRemove: string[]) => void;
    onBatchApplyProperties: (nodeIds: string[], propsToSet: Record<string, string>, keysToRemove: string[]) => void;
    onPanelDirtyChange?: (dirty: boolean) => void;
    onPanelExpandedChange?: (expanded: boolean) => void;
    onHighlightSet?: (ids: Set<string> | null) => void;
    onExternalHover?: (id: string) => void;
    onExpandNode?: (nodeId: string) => void;
    containerRef?: React.RefObject<HTMLElement | null>;
    expandRequest?: number;
    collapseRequest?: number;
}

interface GraphDetailState {
    expanded: boolean;
    activeTab: string;
    linksDirty: boolean;
    propertiesDirty: boolean;
    size: { width: number; height: number };
    editId: string;
    editTitle: string;
    idError: string;
}

const defaultGraphDetailState: GraphDetailState = {
    expanded: false,
    activeTab: "info",
    linksDirty: false,
    propertiesDirty: false,
    size: { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
    editId: "",
    editTitle: "",
    idError: "",
};

class GraphDetailModel extends TComponentModel<GraphDetailState, GraphDetailPanelProps> {
    setExpanded = (expanded: boolean) => this.state.update((s) => { s.expanded = expanded; });
    setActiveTab = (activeTab: string) => this.state.update((s) => { s.activeTab = activeTab; });
    setLinksDirty = (linksDirty: boolean) => this.state.update((s) => { s.linksDirty = linksDirty; });
    setPropertiesDirty = (propertiesDirty: boolean) => this.state.update((s) => { s.propertiesDirty = propertiesDirty; });
    setSize = (size: { width: number; height: number }) => this.state.update((s) => { s.size = size; });
    setEditId = (editId: string) => this.state.update((s) => { s.editId = editId; });
    setEditTitle = (editTitle: string) => this.state.update((s) => { s.editTitle = editTitle; });
    setIdError = (idError: string) => this.state.update((s) => { s.idError = idError; });
}

// =============================================================================
// Component
// =============================================================================

function GraphDetailPanel({
    nodes, linkedNodes, onUpdateProps, onBatchUpdateProps, onRenameNode, onApplyLinks,
    onApplyProperties, onBatchApplyProperties,
    onPanelDirtyChange, onPanelExpandedChange, onHighlightSet, onExternalHover, onExpandNode,
    containerRef, expandRequest, collapseRequest,
}: GraphDetailPanelProps) {
    const hasSelection = nodes.length > 0;
    const isMulti = nodes.length > 1;
    const singleNode = nodes.length === 1 ? nodes[0] : null;

    const detailProps: GraphDetailPanelProps = {
        nodes, linkedNodes, onUpdateProps, onBatchUpdateProps, onRenameNode, onApplyLinks,
        onApplyProperties, onBatchApplyProperties, onPanelDirtyChange, onPanelExpandedChange,
        onHighlightSet, onExternalHover, onExpandNode, containerRef, expandRequest, collapseRequest,
    };
    const viewModel = useComponentModel(detailProps, GraphDetailModel, defaultGraphDetailState);
    const expanded = viewModel.state.use((s) => s.expanded);
    const activeTab = viewModel.state.use((s) => s.activeTab);
    const linksDirty = viewModel.state.use((s) => s.linksDirty);
    const propertiesDirty = viewModel.state.use((s) => s.propertiesDirty);
    const size = viewModel.state.use((s) => s.size);
    const editId = viewModel.state.use((s) => s.editId);
    const editTitle = viewModel.state.use((s) => s.editTitle);
    const idError = viewModel.state.use((s) => s.idError);
    const setExpanded = viewModel.setExpanded;
    const setActiveTab = viewModel.setActiveTab;
    const setLinksDirty = viewModel.setLinksDirty;
    const setPropertiesDirty = viewModel.setPropertiesDirty;
    const setSize = viewModel.setSize;
    const setEditId = viewModel.setEditId;
    const setEditTitle = viewModel.setEditTitle;
    const setIdError = viewModel.setIdError;
    const wasExpandedRef = useRef(true);
    const hadSelectionRef = useRef(false);
    const anyDirty = linksDirty || propertiesDirty;

    const resizingRef = useRef(false);
    const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });


    const handleLinksDirtyChange = useCallback((dirty: boolean) => {
        setLinksDirty(dirty);
        onPanelDirtyChange?.(dirty || propertiesDirty);
    }, [onPanelDirtyChange, propertiesDirty, setLinksDirty]);

    const handlePropertiesDirtyChange = useCallback((dirty: boolean) => {
        setPropertiesDirty(dirty);
        onPanelDirtyChange?.(dirty || linksDirty);
    }, [onPanelDirtyChange, linksDirty, setPropertiesDirty]);

    const selectionKey = useMemo(() => nodes.map((n) => n.id).sort().join(","), [nodes]);

    useEffect(() => {
        if (singleNode) {
            setEditId(singleNode.id);
            setEditTitle(singleNode.title || "");
            setIdError("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally narrow: only re-init edit fields when the id/title slice changes, not on every singleNode object identity change
    }, [singleNode?.id, singleNode?.title, setEditId, setEditTitle, setIdError]);

    useEffect(() => {
        if (isMulti && activeTab === "links") {
            setActiveTab("info");
        }
    }, [isMulti, activeTab, setActiveTab]);

    useEffect(() => {
        if (hasSelection) {
            if (!hadSelectionRef.current) {
                setExpanded(wasExpandedRef.current);
            }
            hadSelectionRef.current = true;
        } else {
            wasExpandedRef.current = false;
            setExpanded(false);
            hadSelectionRef.current = false;
        }
    }, [selectionKey, hasSelection, setExpanded]);

    useEffect(() => {
        if (expandRequest && hasSelection) {
            setExpanded(true);
            wasExpandedRef.current = true;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- expandRequest is a one-shot bump signal from parent; hasSelection is a runtime gate checked at fire time, not a re-fire trigger
    }, [expandRequest, setExpanded]);

    useEffect(() => {
        if (collapseRequest && expanded && !anyDirty) {
            setExpanded(false);
            wasExpandedRef.current = false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- collapseRequest is a one-shot bump signal from parent; expanded / anyDirty are runtime gates checked at fire time, not re-fire triggers
    }, [collapseRequest]);

    useEffect(() => {
        onPanelExpandedChange?.(expanded);
    }, [expanded, onPanelExpandedChange]);

    const toggleExpanded = useCallback(() => {
        if (!hasSelection || anyDirty) return;
        const next = !viewModel.state.get().expanded;
        wasExpandedRef.current = next;
        setExpanded(next);
    }, [hasSelection, anyDirty, viewModel, setExpanded]);

    const linksTabActive = expanded && activeTab === "links" && !!singleNode;
    useEffect(() => {
        if (linksTabActive) {
            onExpandNode?.(singleNode.id);
            const ids = new Set([singleNode.id, ...linkedNodes.map((n) => n.id)]);
            onHighlightSet?.(ids);
        } else {
            onHighlightSet?.(null);
            onExternalHover?.("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally narrowed: only re-emit when singleNode id / linkedNodes / linksTabActive change. Parent callbacks are not wrapped in useCallback and would cause redundant re-fires on every parent render.
    }, [linksTabActive, singleNode?.id, linkedNodes]);

    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only cleanup: clear external hover/highlight when this panel unmounts (parent callbacks captured at mount)
    useEffect(() => () => { onHighlightSet?.(null); onExternalHover?.(""); }, []);

    const commitId = useCallback(() => {
        if (!singleNode) return;
        const trimmed = editId.trim();
        if (trimmed === singleNode.id) {
            setIdError("");
            return;
        }
        if (!trimmed) {
            setEditId(singleNode.id);
            setIdError("");
            return;
        }
        const ok = onRenameNode(singleNode.id, trimmed);
        if (!ok) {
            setIdError("ID already exists");
        } else {
            setIdError("");
        }
    }, [singleNode, editId, onRenameNode, setEditId, setIdError]);

    const commitTitle = useCallback(() => {
        if (!singleNode) return;
        const value = editTitle.trim();
        if (value === (singleNode.title || "")) return;
        onUpdateProps(singleNode.id, { title: value || undefined });
    }, [singleNode, editTitle, onUpdateProps]);

    const handleKeyDown = useCallback((_commit: () => void) => (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLElement).blur();
        } else if (e.key === "Escape") {
            e.preventDefault();
            if (singleNode) {
                setEditId(singleNode.id);
                setEditTitle(singleNode.title || "");
                setIdError("");
            }
            (e.target as HTMLElement).blur();
        }
    }, [singleNode, setEditId, setEditTitle, setIdError]);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizingRef.current = true;
        resizeStartRef.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height };

        const handleMouseMove = (e: MouseEvent) => {
            if (!resizingRef.current) return;
            const dx = resizeStartRef.current.x - e.clientX;
            const dy = e.clientY - resizeStartRef.current.y;

            let newWidth = resizeStartRef.current.width + dx;
            let newHeight = resizeStartRef.current.height + dy;

            newWidth = Math.max(MIN_WIDTH, newWidth);
            newHeight = Math.max(MIN_HEIGHT, newHeight);

            const container = containerRef?.current;
            if (container) {
                const rect = container.getBoundingClientRect();
                newWidth = Math.min(newWidth, rect.width * MAX_PERCENT);
                newHeight = Math.min(newHeight, rect.height * MAX_PERCENT);
            }

            setSize({ width: newWidth, height: newHeight });
        };

        const handleMouseUp = () => {
            resizingRef.current = false;
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [size, containerRef, setSize]);

    const headerText = isMulti
        ? `${nodes.length} nodes selected`
        : singleNode
            ? nodeLabel(singleNode)
            : "select node for edit";
    const headerStyle = hasSelection
        ? (anyDirty ? headerLockedStyle : headerStyleBase)
        : headerNoSelectionStyle;

    const linksAvailable = !isMulti;

    const tabButtonStyle = (tab: string): React.CSSProperties => {
        if (activeTab === tab) return tabActiveStyle;
        if (anyDirty && activeTab !== tab) return tabDisabledStyle;
        return tabStyleBase;
    };

    return (
        <div className="graph-detail-panel">
            <div style={headerStyle} onClick={toggleExpanded}>
                <span style={panelTitleStyle} title={headerText}>{headerText}</span>
                {hasSelection && (
                    <span style={panelChevronStyle}>
                        {expanded ? <ChevronUpIcon width={14} height={14} /> : <ChevronDownIcon width={14} height={14} />}
                    </span>
                )}
            </div>

            {expanded && hasSelection && (
                <div style={{ ...panelBodyStyle, width: size.width, height: size.height }}>
                    <div style={tabsRowStyle}>
                        <button
                            style={tabButtonStyle("info")}
                            onClick={() => { if (!anyDirty) setActiveTab("info"); }}
                        >
                            Info
                        </button>
                        <button
                            style={tabButtonStyle("properties")}
                            onClick={() => { if (!anyDirty) setActiveTab("properties"); }}
                        >
                            Properties
                        </button>
                        {linksAvailable && (
                            <button
                                style={tabButtonStyle("links")}
                                onClick={() => { if (!anyDirty) setActiveTab("links"); }}
                            >
                                Links
                            </button>
                        )}
                    </div>

                    <div style={activeTab !== "info" ? contentNoPadStyle : contentStyle}>
                        {activeTab === "info" && (
                            isMulti ? (
                                <MultiInfoTab
                                    nodes={nodes}
                                    onBatchUpdateProps={onBatchUpdateProps}
                                />
                            ) : singleNode ? (
                                <InfoTab
                                    node={singleNode}
                                    editId={editId}
                                    setEditId={setEditId}
                                    editTitle={editTitle}
                                    setEditTitle={setEditTitle}
                                    idError={idError}
                                    commitId={commitId}
                                    commitTitle={commitTitle}
                                    handleKeyDown={handleKeyDown}
                                    onUpdateProps={onUpdateProps}
                                />
                            ) : null
                        )}
                        {activeTab === "properties" && (
                            <PropertiesTab
                                nodes={nodes}
                                onApply={onApplyProperties}
                                onBatchApply={onBatchApplyProperties}
                                onDirtyChange={handlePropertiesDirtyChange}
                            />
                        )}
                        {activeTab === "links" && singleNode && (
                            <LinksTab
                                linkedNodes={linkedNodes}
                                selectedNodeId={singleNode.id}
                                onApply={onApplyLinks}
                                onDirtyChange={handleLinksDirtyChange}
                                onExternalHover={onExternalHover}
                            />
                        )}
                    </div>

                    <div style={resizerStyle} onMouseDown={handleResizeStart}>
                        <svg width="12" height="12" viewBox="0 0 12 12">
                            <line x1="2" y1="10" x2="0" y2="12" stroke={color.text.light} strokeWidth="1" />
                            <line x1="6" y1="10" x2="0" y2="4" stroke={color.text.light} strokeWidth="1" />
                            <line x1="10" y1="10" x2="0" y2="0" stroke={color.text.light} strokeWidth="1" />
                        </svg>
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Links Tab
// =============================================================================

type LinkRow = Record<string, unknown> & { id: string; _rowKey: string };

interface LinksTabProps {
    linkedNodes: GraphNode[];
    selectedNodeId: string;
    onApply: (selectedNodeId: string, rows: Record<string, unknown>[], originalIds: Set<string>) => void;
    onDirtyChange: (dirty: boolean) => void;
    onExternalHover?: (id: string) => void;
}

interface LinksTabState {
    rows: LinkRow[];
    columns: Column<LinkRow>[];
    dirty: boolean;
    focus: CellFocus<LinkRow> | undefined;
}

const defaultLinksTabState: LinksTabState = { rows: [], columns: [], dirty: false, focus: undefined };

class LinksTabModel extends TComponentModel<LinksTabState, LinksTabProps> {
    setRows = (value: SetStateAction<LinkRow[]>) => this.state.set((state) => ({ ...state, rows: typeof value === "function" ? value(state.rows) : value }));
    setColumns = (value: SetStateAction<Column<LinkRow>[]>) => this.state.set((state) => ({ ...state, columns: typeof value === "function" ? value(state.columns) : value }));
    setDirty = (dirty: boolean) => this.state.update((s) => { s.dirty = dirty; });
    setFocus = (value: SetStateAction<CellFocus<LinkRow> | undefined>) => this.state.set((state) => ({ ...state, focus: typeof value === "function" ? value(state.focus) : value }));
}

const KNOWN_KEYS = new Set(["id", "title", "level", "shape"]);
const LINKS_CHAR_WIDTH = 7;
const LINKS_COL_OPTS = { charWidth: LINKS_CHAR_WIDTH, padding: 16, minWidth: 50, maxWidth: 200 };

function makeColumns(rows: LinkRow[]): Column<LinkRow>[] {
    const cols: Column<LinkRow>[] = [
        { key: "id", name: "ID", width: detectColumnWidth(rows, "id", "ID", LINKS_COL_OPTS), resizible: true, isStatusColumn: true },
        { key: "title", name: "Title", width: detectColumnWidth(rows, "title", "Title", LINKS_COL_OPTS), resizible: true },
        { key: "level", name: "Level", width: 60, resizible: true,
          options: [1, 2, 3, 4, 5] },
        { key: "shape", name: "Shape", width: 70, resizible: true,
          options: ["circle", "square", "diamond", "triangle", "star", "hexagon"] },
    ];

    const customKeys = new Set<string>();
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            if (key !== "_rowKey" && !KNOWN_KEYS.has(key) && !key.startsWith("_$")) {
                customKeys.add(key);
            }
        }
    }
    for (const key of [...customKeys].sort()) {
        cols.push({
            key,
            name: key,
            width: detectColumnWidth(rows, key, key, LINKS_COL_OPTS),
            resizible: true,
        });
    }

    return cols;
}

function LinksTab({ linkedNodes, selectedNodeId, onApply, onDirtyChange, onExternalHover }: LinksTabProps) {
    const tabProps: LinksTabProps = { linkedNodes, selectedNodeId, onApply, onDirtyChange, onExternalHover };
    const model = useComponentModel(tabProps, LinksTabModel, defaultLinksTabState);
    const rows = model.state.use((s) => s.rows);
    const columns = model.state.use((s) => s.columns);
    const dirty = model.state.use((s) => s.dirty);
    const focus = model.state.use((s) => s.focus);
    const setRows = model.setRows;
    const setColumns = model.setColumns;
    const setDirty = model.setDirty;
    const setFocus = model.setFocus;
    const originalIdsRef = useRef<Set<string>>(new Set());
    const rowCounterRef = useRef(0);

    useEffect(() => {
        const mapped = linkedNodes.map((n) => ({
            ...n,
            _rowKey: `link-${++rowCounterRef.current}`,
        }));
        setRows(mapped);
        setColumns(makeColumns(mapped));
        setDirty(false);
        onDirtyChange(false);
        originalIdsRef.current = new Set(linkedNodes.map((n) => n.id));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-init only when source data (linkedNodes) changes; callback identity changes from parent should not reset row state
    }, [linkedNodes]);

    useEffect(() => {
        if (focus?.rowKey) {
            const row = rows.find((r) => r._rowKey === focus.rowKey);
            onExternalHover?.(row?.id || "");
        } else {
            onExternalHover?.("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- hover is keyed on focus changes only; rows mutations are expected to come paired with focus resets by the parent. TODO: consider extracting focusedRowId = rows.find(...)?.id outside the effect for a more defensive structure.
    }, [focus?.rowKey]);

    const markDirty = useCallback(() => {
        setDirty(true);
        onDirtyChange(true);
    }, [onDirtyChange, setDirty]);

    const editRow = useCallback((columnKey: string, rowKey: string, value: unknown) => {
        if (columnKey === "level") {
            const num = Number(value);
            value = (num >= 1 && num <= 5) ? num : 5;
        }
        if (columnKey === "shape") {
            const shapes = ["circle", "square", "diamond", "triangle", "star", "hexagon"];
            if (!shapes.includes(value as string)) value = "circle";
        }

        setRows((prev) => prev.map((r) =>
            r._rowKey === rowKey ? { ...r, [columnKey]: value } : r
        ));
        markDirty();
    }, [markDirty, setRows]);

    const onAddRows = useCallback((count: number, insertIndex?: number) => {
        const newRows: LinkRow[] = Array.from({ length: count }, () => ({
            id: "",
            _rowKey: `link-${++rowCounterRef.current}`,
        }));
        setRows((prev) => {
            if (insertIndex !== undefined) {
                const copy = [...prev];
                copy.splice(insertIndex, 0, ...newRows);
                return copy;
            }
            return [...prev, ...newRows];
        });
        markDirty();
        return newRows;
    }, [markDirty, setRows]);

    const onDeleteRows = useCallback((rowKeys: string[]) => {
        const keySet = new Set(rowKeys);
        setRows((prev) => prev.filter((r) => !keySet.has(r._rowKey)));
        markDirty();
    }, [markDirty, setRows]);

    const getRowKey = useCallback((r: LinkRow) => r._rowKey, []);

    const handleApply = useCallback(() => {
        const cleanRows = rows.map((r) => {
            const { _rowKey, ...rest } = r;
            return rest;
        });
        onApply(selectedNodeId, cleanRows, originalIdsRef.current);
    }, [rows, selectedNodeId, onApply]);

    const handleCancel = useCallback(() => {
        const mapped = linkedNodes.map((n) => ({
            ...n,
            _rowKey: `link-${++rowCounterRef.current}`,
        }));
        setRows(mapped);
        setDirty(false);
        onDirtyChange(false);
        setColumns(makeColumns(mapped));
    }, [linkedNodes, onDirtyChange, setColumns, setDirty, setRows]);

    return (
        <Panel direction="column" flex={1} overflow="hidden">
            <Panel direction="column" flex={1} overflow="hidden">
                <AVGrid
                    columns={columns}
                    rows={rows}
                    getRowKey={getRowKey}
                    setColumns={setColumns}
                    focus={focus}
                    setFocus={setFocus as (value: SetStateAction<CellFocus<LinkRow> | undefined>) => void}
                    editRow={editRow}
                    onAddRows={onAddRows}
                    onDeleteRows={onDeleteRows}
                    entity="link"
                    disableFiltering
                    disableSorting
                    rowHeight={24}
                />
            </Panel>
            {dirty && (
                <div style={tabActionRowStyle}>
                    <Button size="sm" variant="ghost" onClick={handleCancel}>
                        Cancel
                    </Button>
                    <Button size="sm" variant="primary" onClick={handleApply}>
                        Apply
                    </Button>
                </div>
            )}
        </Panel>
    );
}

// =============================================================================
// Properties Tab
// =============================================================================

type PropertyRow = { _rowKey: string; key: string; value: string; _isChanged?: boolean };

interface PropertiesTabProps {
    nodes: GraphNode[];
    onApply: (nodeId: string, propsToSet: Record<string, string>, keysToRemove: string[]) => void;
    onBatchApply: (nodeIds: string[], propsToSet: Record<string, string>, keysToRemove: string[]) => void;
    onDirtyChange: (dirty: boolean) => void;
}

interface PropertiesTabState {
    rows: PropertyRow[];
    columns: Column<PropertyRow>[];
    dirty: boolean;
    focus: CellFocus<PropertyRow> | undefined;
    statusMessage: string;
}

function extractCustomProperties(node: GraphNode): { key: string; value: string }[] {
    const rows: { key: string; value: string }[] = [];
    for (const [key, value] of Object.entries(node)) {
        if (isReservedPropertyKey(key)) continue;
        rows.push({ key, value: value == null ? "" : String(value) });
    }
    return rows;
}

function extractMultiProperties(nodes: GraphNode[]): { key: string; value: string; allSame: boolean; uniqueValues: string[] }[] {
    const keySet = new Set<string>();
    for (const node of nodes) {
        for (const key of Object.keys(node)) {
            if (!isReservedPropertyKey(key)) keySet.add(key);
        }
    }

    const result: { key: string; value: string; allSame: boolean; uniqueValues: string[] }[] = [];
    for (const key of [...keySet].sort()) {
        const values: string[] = [];
        for (const node of nodes) {
            const v = (node as unknown as Record<string, unknown>)[key];
            if (v !== undefined && v !== null) {
                values.push(String(v));
            }
        }
        const uniqueValues = [...new Set(values)];
        const allSame = uniqueValues.length === 1 && values.length === nodes.length;
        result.push({
            key,
            value: allSame ? uniqueValues[0] : "",
            allSame,
            uniqueValues,
        });
    }
    return result;
}

const PROPERTY_COLUMNS: Column<PropertyRow>[] = [
    { key: "key", name: "Name", width: 120, resizible: true },
    { key: "value", name: "Value", width: 200, resizible: true },
];

const defaultPropertiesTabState: PropertiesTabState = {
    rows: [], columns: PROPERTY_COLUMNS, dirty: false, focus: undefined, statusMessage: "",
};

class PropertiesTabModel extends TComponentModel<PropertiesTabState, PropertiesTabProps> {
    setRows = (value: SetStateAction<PropertyRow[]>) => this.state.set((state) => ({ ...state, rows: typeof value === "function" ? value(state.rows) : value }));
    setColumns = (value: SetStateAction<Column<PropertyRow>[]>) => this.state.set((state) => ({ ...state, columns: typeof value === "function" ? value(state.columns) : value }));
    setDirty = (dirty: boolean) => this.state.update((s) => { s.dirty = dirty; });
    setFocus = (value: SetStateAction<CellFocus<PropertyRow> | undefined>) => this.state.set((state) => ({ ...state, focus: typeof value === "function" ? value(state.focus) : value }));
    setStatusMessage = (statusMessage: string) => this.state.update((s) => { s.statusMessage = statusMessage; });
}

function PropertiesTab({ nodes, onApply, onBatchApply, onDirtyChange }: PropertiesTabProps) {
    const isMulti = nodes.length > 1;
    const singleNode = nodes.length === 1 ? nodes[0] : null;
    const selectionKey = useMemo(() => nodes.map((n) => n.id).sort().join(","), [nodes]);

    const tabProps: PropertiesTabProps = { nodes, onApply, onBatchApply, onDirtyChange };
    const model = useComponentModel(tabProps, PropertiesTabModel, defaultPropertiesTabState);
    const rows = model.state.use((s) => s.rows);
    const columns = model.state.use((s) => s.columns);
    const dirty = model.state.use((s) => s.dirty);
    const focus = model.state.use((s) => s.focus);
    const statusMessage = model.state.use((s) => s.statusMessage);
    const setRows = model.setRows;
    const setColumns = model.setColumns;
    const setDirty = model.setDirty;
    const setFocus = model.setFocus;
    const setStatusMessage = model.setStatusMessage;
    const originalKeysRef = useRef<Set<string>>(new Set());
    const rowCounterRef = useRef(0);
    const multiInfoRef = useRef<Map<string, { allSame: boolean; uniqueValues: string[] }>>(new Map());

    useEffect(() => {
        rowCounterRef.current = 0;
        if (isMulti) {
            const merged = extractMultiProperties(nodes);
            multiInfoRef.current = new Map(merged.map((r) => [r.key, { allSame: r.allSame, uniqueValues: r.uniqueValues }]));
            const mapped: PropertyRow[] = merged.map((r) => ({
                _rowKey: `prop-${++rowCounterRef.current}`,
                key: r.key,
                value: r.value,
                _isChanged: false,
            }));
            setRows(mapped);
            originalKeysRef.current = new Set(merged.map((r) => r.key));
        } else if (singleNode) {
            const extracted = extractCustomProperties(singleNode);
            multiInfoRef.current = new Map();
            const mapped: PropertyRow[] = extracted.map((r) => ({
                _rowKey: `prop-${++rowCounterRef.current}`,
                key: r.key,
                value: r.value,
                _isChanged: false,
            }));
            setRows(mapped);
            originalKeysRef.current = new Set(extracted.map((r) => r.key));
        }
        setDirty(false);
        onDirtyChange(false);
        setStatusMessage("");
        // eslint-disable-next-line react-hooks/exhaustive-deps -- isMulti / singleNode are derived from `nodes` (in deps); onDirtyChange identity changes from parent should not reset row state
    }, [selectionKey, nodes]);

    useEffect(() => {
        if (!isMulti || !focus?.rowKey) {
            setStatusMessage("");
            return;
        }
        const row = rows.find((r) => r._rowKey === focus.rowKey);
        if (!row || !row.key) {
            setStatusMessage("");
            return;
        }
        const info = multiInfoRef.current.get(row.key);
        if (!info) {
            setStatusMessage("");
        } else if (info.allSame) {
            setStatusMessage("All nodes have the same value");
        } else if (info.uniqueValues.length === 0) {
            setStatusMessage("No nodes have this property");
        } else {
            const shown = info.uniqueValues.slice(0, 2).map((v) => `"${v}"`).join(", ");
            const suffix = info.uniqueValues.length > 2 ? ", ..." : "";
            setStatusMessage(`Values: ${shown}${suffix}`);
        }
    }, [focus?.rowKey, isMulti, rows, setStatusMessage]);

    const hasInvalidKeys = useMemo(() =>
        rows.some((r) => r.key && isReservedPropertyKey(r.key)),
    [rows]);

    const markDirty = useCallback(() => {
        setDirty(true);
        onDirtyChange(true);
    }, [onDirtyChange, setDirty]);

    const editRow = useCallback((columnKey: string, rowKey: string, value: unknown) => {
        setRows((prev) => prev.map((r) =>
            r._rowKey === rowKey ? { ...r, [columnKey]: String(value ?? ""), _isChanged: true } : r
        ));
        markDirty();
    }, [markDirty, setRows]);

    const onAddRows = useCallback((count: number, insertIndex?: number) => {
        const newRows: PropertyRow[] = Array.from({ length: count }, () => ({
            _rowKey: `prop-${++rowCounterRef.current}`,
            key: "",
            value: "",
            _isChanged: true,
        }));
        setRows((prev) => {
            if (insertIndex !== undefined) {
                const copy = [...prev];
                copy.splice(insertIndex, 0, ...newRows);
                return copy;
            }
            return [...prev, ...newRows];
        });
        markDirty();
        return newRows;
    }, [markDirty, setRows]);

    const onDeleteRows = useCallback((rowKeys: string[]) => {
        const keySet = new Set(rowKeys);
        setRows((prev) => prev.filter((r) => !keySet.has(r._rowKey)));
        markDirty();
    }, [markDirty, setRows]);

    const getRowKey = useCallback((r: PropertyRow) => r._rowKey, []);

    const handleApply = useCallback(() => {
        if (isMulti) {
            const propsToSet: Record<string, string> = {};
            for (const row of rows) {
                if (!row._isChanged) continue;
                const k = row.key.trim();
                if (!k || isReservedPropertyKey(k)) continue;
                propsToSet[k] = row.value;
            }
            const currentKeys = new Set(rows.map((r) => r.key.trim()).filter(Boolean));
            const keysToRemove = [...originalKeysRef.current].filter((k) => !currentKeys.has(k));

            const nodeIds = nodes.map((n) => n.id);
            onBatchApply(nodeIds, propsToSet, keysToRemove);
        } else if (singleNode) {
            const propsToSet: Record<string, string> = {};
            for (const row of rows) {
                if (!row._isChanged) continue;
                const k = row.key.trim();
                if (!k || isReservedPropertyKey(k)) continue;
                propsToSet[k] = row.value;
            }
            const currentKeys = new Set(rows.map((r) => r.key.trim()).filter(Boolean));
            const keysToRemove = [...originalKeysRef.current].filter((k) => !currentKeys.has(k));

            onApply(singleNode.id, propsToSet, keysToRemove);
        }
    }, [rows, nodes, singleNode, isMulti, onApply, onBatchApply]);

    const handleCancel = useCallback(() => {
        rowCounterRef.current = 0;
        if (isMulti) {
            const merged = extractMultiProperties(nodes);
            multiInfoRef.current = new Map(merged.map((r) => [r.key, { allSame: r.allSame, uniqueValues: r.uniqueValues }]));
            const mapped: PropertyRow[] = merged.map((r) => ({
                _rowKey: `prop-${++rowCounterRef.current}`,
                key: r.key,
                value: r.value,
                _isChanged: false,
            }));
            setRows(mapped);
        } else if (singleNode) {
            const extracted = extractCustomProperties(singleNode);
            const mapped: PropertyRow[] = extracted.map((r) => ({
                _rowKey: `prop-${++rowCounterRef.current}`,
                key: r.key,
                value: r.value,
                _isChanged: false,
            }));
            setRows(mapped);
        }
        setDirty(false);
        onDirtyChange(false);
        setStatusMessage("");
    }, [nodes, singleNode, isMulti, onDirtyChange, setDirty, setRows, setStatusMessage]);

    const cellClass = useCallback((row: PropertyRow, col: Column<PropertyRow>) => {
        if (col.key === "key" && row.key && isReservedPropertyKey(row.key)) {
            return "cell-error";
        }
        if (col.key === "key" && isMulti && row.key) {
            const info = multiInfoRef.current.get(row.key);
            if (info && !info.allSame && !row._isChanged) {
                return "cell-mixed";
            }
        }
        return "";
    }, [isMulti]);

    return (
        <Panel direction="column" flex={1} overflow="hidden">
            <Panel direction="column" flex={1} overflow="hidden">
                <AVGrid
                    columns={columns}
                    rows={rows}
                    getRowKey={getRowKey}
                    setColumns={setColumns}
                    focus={focus}
                    setFocus={setFocus as (value: SetStateAction<CellFocus<PropertyRow> | undefined>) => void}
                    editRow={editRow}
                    onAddRows={onAddRows}
                    onDeleteRows={onDeleteRows}
                    onCellClass={cellClass}
                    entity="property"
                    disableFiltering
                    disableSorting
                    rowHeight={24}
                />
            </Panel>
            {statusMessage && (
                <div style={propertiesStatusStyle}>{statusMessage}</div>
            )}
            {dirty && (
                <div style={tabActionRowStyle}>
                    <Button size="sm" variant="ghost" onClick={handleCancel}>
                        Cancel
                    </Button>
                    <Button size="sm" variant="primary" disabled={hasInvalidKeys} onClick={handleApply}>
                        Apply
                    </Button>
                </div>
            )}
        </Panel>
    );
}

// =============================================================================
// Multi-Selection Info Tab
// =============================================================================

interface MultiInfoTabProps {
    nodes: GraphNode[];
    onBatchUpdateProps: (nodeIds: string[], props: Partial<GraphNode>) => void;
}

function MultiInfoTab({ nodes, onBatchUpdateProps }: MultiInfoTabProps) {
    const nodeIds = useMemo(() => nodes.map((n) => n.id), [nodes]);

    const commonLevel = useMemo(() => {
        const levels = new Set(nodes.map((n) => n.level ?? 5));
        return levels.size === 1 ? [...levels][0] : null;
    }, [nodes]);

    const presentLevels = useMemo(() =>
        new Set(nodes.map((n) => n.level ?? 5)),
    [nodes]);

    const commonShape = useMemo(() => {
        const shapes = new Set(nodes.map((n) => n.shape ?? "circle"));
        return shapes.size === 1 ? [...shapes][0] : null;
    }, [nodes]);

    const presentShapes = useMemo(() =>
        new Set(nodes.map((n) => n.shape ?? "circle")),
    [nodes]);

    return (
        <>
            <div style={multiInfoStyle}>
                Batch edit level and shape for {nodes.length} selected nodes
            </div>

            <div style={infoFieldStyle}>
                <label style={infoLabelStyle}>Level</label>
                <div style={infoIconsRowStyle}>
                    {LEVELS.map((lvl) => {
                        const isSelected = commonLevel === lvl;
                        const isMixed = !isSelected && presentLevels.has(lvl);
                        return (
                            <button
                                key={lvl}
                                style={isSelected ? infoIconBtnSelected : isMixed ? infoIconBtnMixed : infoIconBtnBase}
                                onClick={() => onBatchUpdateProps(nodeIds, { level: lvl })}
                                title={`Level ${lvl}`}
                            >
                                <LevelIcon level={lvl} />
                            </button>
                        );
                    })}
                </div>
            </div>

            <div style={infoFieldStyle}>
                <label style={infoLabelStyle}>Shape</label>
                <div style={infoIconsRowStyle}>
                    {SHAPES.map((shape) => {
                        const isSelected = commonShape === shape;
                        const isMixed = !isSelected && presentShapes.has(shape);
                        return (
                            <button
                                key={shape}
                                style={isSelected ? infoIconBtnSelected : isMixed ? infoIconBtnMixed : infoIconBtnBase}
                                onClick={() => onBatchUpdateProps(nodeIds, { shape: shape === "circle" ? undefined : shape })}
                                title={shape}
                            >
                                <ShapeIcon shape={shape} />
                            </button>
                        );
                    })}
                </div>
            </div>
        </>
    );
}

// =============================================================================
// Info Tab (single selection)
// =============================================================================

interface InfoTabProps {
    node: GraphNode;
    editId: string;
    setEditId: (v: string) => void;
    editTitle: string;
    setEditTitle: (v: string) => void;
    idError: string;
    commitId: () => void;
    commitTitle: () => void;
    handleKeyDown: (commit: () => void) => (e: React.KeyboardEvent) => void;
    onUpdateProps: (nodeId: string, props: Partial<GraphNode>) => void;
}

function InfoTab({
    node, editId, setEditId, editTitle, setEditTitle,
    idError, commitId, commitTitle, handleKeyDown, onUpdateProps,
}: InfoTabProps) {
    return (
        <>
            <div style={infoFieldStyle}>
                <label style={infoLabelStyle}>ID</label>
                <Input
                    size="sm"
                    value={editId}
                    onChange={setEditId}
                    onBlur={commitId}
                    onKeyDown={handleKeyDown(commitId)}
                />
                {idError && <span style={infoErrorStyle}>{idError}</span>}
            </div>

            <div style={infoFieldStyle}>
                <label style={infoLabelStyle}>Title</label>
                <Input
                    size="sm"
                    value={editTitle}
                    onChange={setEditTitle}
                    onBlur={commitTitle}
                    onKeyDown={handleKeyDown(commitTitle)}
                    placeholder={node.id}
                />
            </div>

            <div style={infoFieldStyle}>
                <label style={infoLabelStyle}>Level</label>
                <div style={infoIconsRowStyle}>
                    {LEVELS.map((lvl) => (
                        <button
                            key={lvl}
                            style={(node.level ?? 5) === lvl ? infoIconBtnSelected : infoIconBtnBase}
                            onClick={() => onUpdateProps(node.id, { level: lvl })}
                            title={`Level ${lvl}`}
                        >
                            <LevelIcon level={lvl} />
                        </button>
                    ))}
                </div>
            </div>

            <div style={infoFieldStyle}>
                <label style={infoLabelStyle}>Shape</label>
                <div style={infoIconsRowStyle}>
                    {SHAPES.map((shape) => (
                        <button
                            key={shape}
                            style={(node.shape ?? "circle") === shape ? infoIconBtnSelected : infoIconBtnBase}
                            onClick={() => onUpdateProps(node.id, { shape: shape === "circle" ? undefined : shape })}
                            title={shape}
                        >
                            <ShapeIcon shape={shape} />
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}

export { GraphDetailPanel };
