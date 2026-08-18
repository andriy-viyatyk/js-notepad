import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Button, Input, Panel } from "../../uikit";
import color from "../../theme/color";
import type { GraphEditor } from "./GraphEditor";
import { NodeShape } from "./types";
import { ShapeIcon, LevelIcon } from "./GraphIcons";
import { TComponentModel, useComponentModel } from "../../core/state/model";

// =============================================================================
// Constants
// =============================================================================

const ALL_SHAPES: NodeShape[] = ["circle", "square", "diamond", "triangle", "star", "hexagon"];
const ALL_LEVELS = [1, 2, 3, 4, 5];
type LegendTab = "level" | "shape" | "selection";
type SelectionFilter = "" | "selected" | "not-selected" | "selected-with-children";

/** Host type for this panel. */
type GraphLegendHost = GraphEditor;

// =============================================================================
// Inline styles
// =============================================================================

const rootStyleBase: React.CSSProperties = {
    position: "absolute",
    bottom: 8,
    left: 8,
    width: 260,
    display: "flex",
    flexDirection: "column",
    backgroundColor: color.graph.background,
    border: `1px solid ${color.border.default}`,
    borderRadius: 4,
    zIndex: 1,
    transition: "opacity 0.15s",
};

const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "3px 8px",
    cursor: "pointer",
    userSelect: "none",
};

const titleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: color.graph.labelText,
};

const chevronStyleBase: React.CSSProperties = {
    fontSize: 11,
    color: color.graph.labelText,
    opacity: 0.6,
};

const chevronExpandedStyle: React.CSSProperties = {
    fontSize: 11,
    color: color.graph.nodeHighlight,
    opacity: 1,
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

const contentStyle: React.CSSProperties = {
    maxHeight: 250,
    overflowY: "auto",
    padding: "2px 0",
};

const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    fontSize: 11,
};

const checkboxStyle: React.CSSProperties = {
    margin: 0,
    flexShrink: 0,
    cursor: "pointer",
};

const iconCellStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: 16,
    height: 16,
    color: color.graph.labelText,
};

const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: color.graph.labelText,
    flexShrink: 0,
    minWidth: 50,
};

const searchNoticeStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "10px 8px",
    fontSize: 11,
    color: color.warning.text,
};

// =============================================================================
// Component
// =============================================================================

interface GraphLegendPanelProps {
    editor: GraphLegendHost;
}

interface GraphLegendState {
    expanded: boolean;
    activeTab: LegendTab;
    checkedLevels: string[];
    checkedShapes: string[];
    selectionFilter: SelectionFilter;
    descriptions: Record<string, Record<string, string>>;
}

const defaultGraphLegendState: GraphLegendState = {
    expanded: false,
    activeTab: "selection",
    checkedLevels: [],
    checkedShapes: [],
    selectionFilter: "selected-with-children",
    descriptions: { levels: {}, shapes: {} },
};

class GraphLegendModel extends TComponentModel<GraphLegendState, GraphLegendPanelProps> {
    private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

    checkedLevelsSet = this.memo(
        () => new Set(this.state.get().checkedLevels),
        () => [this.state.get().checkedLevels],
    );
    checkedShapesSet = this.memo(
        () => new Set(this.state.get().checkedShapes),
        () => [this.state.get().checkedShapes],
    );
    setExpanded = (expanded: boolean) => this.state.update((s) => { s.expanded = expanded; });
    setActiveTab = (activeTab: LegendTab) => this.state.update((s) => { s.activeTab = activeTab; });
    setSelectionFilter = (selectionFilter: SelectionFilter) => this.state.update((s) => { s.selectionFilter = selectionFilter; });
    toggleCheck = (tab: LegendTab, key: string) => this.state.update((s) => {
        if (tab !== "level" && tab !== "shape") return;
        const values = tab === "level" ? s.checkedLevels : s.checkedShapes;
        const next = values.includes(key) ? values.filter((value) => value !== key) : [...values, key];
        if (tab === "level") s.checkedLevels = next;
        else s.checkedShapes = next;
    });
    setDescriptions = (descriptions: Record<string, Record<string, string>>) => this.state.update((s) => { s.descriptions = descriptions; });
    updateDescription = (tab: "levels" | "shapes", key: string, value: string) => this.state.update((s) => {
        const other = tab === "levels" ? "shapes" : "levels";
        s.descriptions = {
            ...s.descriptions,
            [tab]: { ...s.descriptions[tab], [key]: value },
            ...(key === "root" ? { [other]: { ...s.descriptions[other], root: value } } : {}),
        };
    });

    scheduleDescription = (tab: "levels" | "shapes", key: string, value: string) => {
        this.updateDescription(tab, key, value);
        const timerKey = `${tab}:${key}`;
        const existing = this.debounceTimers.get(timerKey);
        if (existing) clearTimeout(existing);
        this.debounceTimers.set(timerKey, setTimeout(() => {
            if (this.isLive) this.props.editor.setLegendDescription(tab, key, value);
            this.debounceTimers.delete(timerKey);
        }, 300));
    };

    init() {
        this.effect(() => {
            const editor = this.props.editor;
            const onHighlightSelection = () => {
                this.setExpanded(true);
                this.setActiveTab("selection");
                this.setSelectionFilter("selected");
            };
            editor.onHighlightSelection = onHighlightSelection;
            return () => {
                if (editor.onHighlightSelection === onHighlightSelection) editor.onHighlightSelection = null;
                this.clearTimers();
            };
        }, () => [this.props.editor]);

        this.effect(() => {
            const editor = this.props.editor;
            const legend = editor.getLegendDescriptions();
            queueMicrotask(() => {
                if (!this.isLive || this.props.editor !== editor) return;
                this.setDescriptions({ levels: { ...legend.levels }, shapes: { ...legend.shapes } });
            });
        }, () => [this.props.editor]);

        this.effect(() => {
            const editor = this.props.editor;
            const expanded = this.state.get().expanded;
            const activeTab = this.state.get().activeTab;
            const selectionFilter = this.state.get().selectionFilter;
            const checkedLevels = this.state.get().checkedLevels;
            const checkedShapes = this.state.get().checkedShapes;
            const selectedKey = editor.state.get().selectedNodes.map((node) => node.id).join(",");
            queueMicrotask(() => {
                if (!this.isLive || this.props.editor !== editor) return;
                const currentSelectedKey = editor.state.get().selectedNodes.map((node) => node.id).join(",");
                if (currentSelectedKey !== selectedKey || this.state.get().expanded !== expanded || this.state.get().activeTab !== activeTab || this.state.get().selectionFilter !== selectionFilter || this.state.get().checkedLevels !== checkedLevels || this.state.get().checkedShapes !== checkedShapes) return;
                this.applyLegendHighlight(editor, expanded, activeTab, selectionFilter, checkedLevels, checkedShapes);
            });
        }, () => {
            const editor = this.props.editor;
            return [
                editor,
                this.state.get().expanded,
                this.state.get().activeTab,
                this.state.get().selectionFilter,
                this.state.get().checkedLevels,
                this.state.get().checkedShapes,
                editor.state.get().selectedNodes.map((node) => node.id).join(","),
            ];
        });
    }

    private applyLegendHighlight(
        editor: GraphEditor,
        expanded: boolean,
        activeTab: LegendTab,
        selectionFilter: SelectionFilter,
        checkedLevels: string[],
        checkedShapes: string[],
    ) {
        if (!expanded) {
            editor.setLegendHighlight(null);
            return;
        }

        if (activeTab === "selection") {
            if (!selectionFilter) {
                editor.setLegendHighlight(null);
                return;
            }
            const selectedIds = editor.renderer.selectedIds;
            if (selectedIds.size === 0) {
                editor.setLegendHighlight(null);
                return;
            }
            if (selectionFilter === "selected") {
                editor.setLegendHighlight(new Set(selectedIds));
            } else if (selectionFilter === "selected-with-children") {
                const ids = new Set(selectedIds);
                const cm = editor.connectivityModel;
                for (const nodeId of selectedIds) {
                    for (const id of cm.getProcessedNeighborIds(nodeId)) ids.add(id);
                    for (const id of cm.getRealNeighborIds(nodeId)) ids.add(id);
                }
                editor.setLegendHighlight(ids);
            } else {
                const allIds = new Set(editor.renderer.getNodes().map((node) => node.id));
                for (const id of selectedIds) allIds.delete(id);
                editor.setLegendHighlight(allIds.size > 0 ? allIds : new Set());
            }
            return;
        }

        const checked = activeTab === "level" ? checkedLevels : checkedShapes;
        if (checked.length === 0) {
            editor.setLegendHighlight(null);
            return;
        }

        if (activeTab === "level") {
            const levelNums = new Set<number>();
            let includeRoot = false;
            let includeGroup = false;
            for (const key of checked) {
                if (key === "root") includeRoot = true;
                else if (key === "group") includeGroup = true;
                else levelNums.add(Number(key));
            }
            const ids = editor.getNodeIdsByLegendFilter({ levels: levelNums.size > 0 ? levelNums : undefined, includeRoot, includeGroup });
            editor.setLegendHighlight(ids.size > 0 ? ids : new Set());
        } else {
            const shapeNames = new Set<string>();
            let includeRoot = false;
            let includeGroup = false;
            for (const key of checked) {
                if (key === "root") includeRoot = true;
                else if (key === "group") includeGroup = true;
                else shapeNames.add(key);
            }
            const ids = editor.getNodeIdsByLegendFilter({ shapes: shapeNames.size > 0 ? shapeNames : undefined, includeRoot, includeGroup });
            editor.setLegendHighlight(ids.size > 0 ? ids : new Set());
        }
    }

    private clearTimers() {
        for (const timer of this.debounceTimers.values()) clearTimeout(timer);
        this.debounceTimers.clear();
    }

    dispose() {
        this.clearTimers();
    }
}

export function GraphLegendPanel({ editor }: GraphLegendPanelProps) {
    const [hovered, setHovered] = useState(false);
    const [focusWithin, setFocusWithin] = useState(false);
    const model = useComponentModel({ editor }, GraphLegendModel, defaultGraphLegendState);
    const expanded = model.state.use((s) => s.expanded);
    const activeTab = model.state.use((s) => s.activeTab);
    model.state.use((s) => s.checkedLevels);
    model.state.use((s) => s.checkedShapes);
    const selectionFilter = model.state.use((s) => s.selectionFilter);
    const descriptions = model.state.use((s) => s.descriptions);
    const checkedLevels = model.checkedLevelsSet.value;
    const checkedShapes = model.checkedShapesSet.value;
    const setActiveTab = model.setActiveTab;
    const setSelectionFilter = model.setSelectionFilter;

    const selectedKey = useSyncExternalStore(
        (cb) => editor.state.subscribe(cb),
        () => editor.state.get().selectedNodes.map((n) => n.id).join(","),
    );
    void selectedKey;
    const searchQuery = useSyncExternalStore(
        (cb) => editor.state.subscribe(cb),
        () => editor.state.get().searchQuery,
    );
    const { hasRoot, hasGroup } = useMemo(() => {
        const info = editor.getPresentLevelsAndShapes();
        return { hasRoot: info.hasRoot, hasGroup: info.hasGroup };
    }, [editor]);

    const toggleCheck = useCallback((tab: LegendTab, key: string) => {
        model.toggleCheck(tab, key);
    }, [model]);

    const handleDescriptionChange = useCallback((tab: "levels" | "shapes", key: string, value: string) => {
        model.scheduleDescription(tab, key, value);
    }, [model]);

    const toggleExpanded = useCallback(() => {
        model.setExpanded(!model.state.get().expanded);
    }, [model]);

    const rootStyle: React.CSSProperties = {
        ...rootStyleBase,
        opacity: (expanded || hovered || focusWithin) ? 1 : 0.5,
    };

    return (
        <div
            style={rootStyle}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setFocusWithin(true)}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setFocusWithin(false);
                }
            }}
        >
            <div style={headerStyle} onClick={toggleExpanded}>
                <span style={titleStyle}>Legend</span>
                <span style={expanded ? chevronExpandedStyle : chevronStyleBase}>{expanded ? "▼" : "▲"}</span>
            </div>
            {expanded && (
                <>
                    {searchQuery ? (
                        <div style={searchNoticeStyle}>
                            <span>Search highlighting is active</span>
                            <Button size="sm" variant="ghost" onClick={() => editor.setSearchQuery("")}>Clear search</Button>
                        </div>
                    ) : (
                        <>
                            <div style={tabsRowStyle}>
                                <button
                                    style={activeTab === "selection" ? tabActiveStyle : tabStyleBase}
                                    onClick={() => setActiveTab("selection")}
                                >
                                    Selection
                                </button>
                                <button
                                    style={activeTab === "level" ? tabActiveStyle : tabStyleBase}
                                    onClick={() => setActiveTab("level")}
                                >
                                    Level
                                </button>
                                <button
                                    style={activeTab === "shape" ? tabActiveStyle : tabStyleBase}
                                    onClick={() => setActiveTab("shape")}
                                >
                                    Shape
                                </button>
                            </div>
                            <div style={contentStyle}>
                                {activeTab === "level" && (
                                    <>
                                        {hasRoot && (
                                            <LegendRow
                                                label="Root"
                                                icon={<LevelIcon level="root" size={14} />}
                                                checked={checkedLevels.has("root")}
                                                description={descriptions.levels?.root ?? ""}
                                                onToggle={() => toggleCheck("level", "root")}
                                                onDescriptionChange={(v) => handleDescriptionChange("levels", "root", v)}
                                            />
                                        )}
                                        {hasGroup && (
                                            <LegendRow
                                                label="Group"
                                                icon={<ShapeIcon shape="group" size={14} />}
                                                checked={checkedLevels.has("group")}
                                                description={descriptions.levels?.group ?? ""}
                                                onToggle={() => toggleCheck("level", "group")}
                                                onDescriptionChange={(v) => handleDescriptionChange("levels", "group", v)}
                                            />
                                        )}
                                        {ALL_LEVELS.map((level) => (
                                            <LegendRow
                                                key={level}
                                                label={`Level ${level}`}
                                                icon={<LevelIcon level={level} size={14} />}
                                                checked={checkedLevels.has(String(level))}
                                                description={descriptions.levels?.[String(level)] ?? ""}
                                                onToggle={() => toggleCheck("level", String(level))}
                                                onDescriptionChange={(v) => handleDescriptionChange("levels", String(level), v)}
                                            />
                                        ))}
                                    </>
                                )}
                                {activeTab === "shape" && (
                                    <>
                                        {hasRoot && (
                                            <LegendRow
                                                label="Root"
                                                icon={<ShapeIcon shape="root" size={14} />}
                                                checked={checkedShapes.has("root")}
                                                description={descriptions.shapes?.root ?? ""}
                                                onToggle={() => toggleCheck("shape", "root")}
                                                onDescriptionChange={(v) => handleDescriptionChange("shapes", "root", v)}
                                            />
                                        )}
                                        {hasGroup && (
                                            <LegendRow
                                                label="Group"
                                                icon={<ShapeIcon shape="group" size={14} />}
                                                checked={checkedShapes.has("group")}
                                                description={descriptions.shapes?.group ?? ""}
                                                onToggle={() => toggleCheck("shape", "group")}
                                                onDescriptionChange={(v) => handleDescriptionChange("shapes", "group", v)}
                                            />
                                        )}
                                        {ALL_SHAPES.map((shape) => (
                                            <LegendRow
                                                key={shape}
                                                label={shape.charAt(0).toUpperCase() + shape.slice(1)}
                                                icon={<ShapeIcon shape={shape} size={14} />}
                                                checked={checkedShapes.has(shape)}
                                                description={descriptions.shapes?.[shape] ?? ""}
                                                onToggle={() => toggleCheck("shape", shape)}
                                                onDescriptionChange={(v) => handleDescriptionChange("shapes", shape, v)}
                                            />
                                        ))}
                                    </>
                                )}
                                {activeTab === "selection" && (
                                    <>
                                        <SelectionRadioRow
                                            label="Selected"
                                            checked={selectionFilter === "selected"}
                                            onToggle={() => setSelectionFilter(selectionFilter === "selected" ? "" : "selected")}
                                        />
                                        <SelectionRadioRow
                                            label="Selected with children"
                                            checked={selectionFilter === "selected-with-children"}
                                            onToggle={() => setSelectionFilter(selectionFilter === "selected-with-children" ? "" : "selected-with-children")}
                                        />
                                        <SelectionRadioRow
                                            label="Not selected"
                                            checked={selectionFilter === "not-selected"}
                                            onToggle={() => setSelectionFilter(selectionFilter === "not-selected" ? "" : "not-selected")}
                                        />
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// =============================================================================
// LegendRow
// =============================================================================

interface LegendRowProps {
    label: string;
    icon: React.ReactNode;
    checked: boolean;
    description: string;
    onToggle: () => void;
    onDescriptionChange: (value: string) => void;
}

function LegendRow({ label, icon, checked, description, onToggle, onDescriptionChange }: LegendRowProps) {
    return (
        <div style={rowStyle}>
            <input
                type="checkbox"
                style={checkboxStyle}
                checked={checked}
                onChange={onToggle}
            />
            <span style={iconCellStyle}>{icon}</span>
            <span style={labelStyle}>{label}</span>
            <Panel direction="row" flex={1} minWidth={0}>
                <Input
                    size="sm"
                    variant="ghost"
                    placeholder="Description..."
                    value={description}
                    onChange={onDescriptionChange}
                />
            </Panel>
        </div>
    );
}

// =============================================================================
// SelectionRadioRow
// =============================================================================

interface SelectionRadioRowProps {
    label: string;
    checked: boolean;
    onToggle: () => void;
}

function SelectionRadioRow({ label, checked, onToggle }: SelectionRadioRowProps) {
    return (
        <div style={rowStyle}>
            <input
                type="radio"
                style={checkboxStyle}
                checked={checked}
                onChange={onToggle}
            />
            <span style={labelStyle}>{label}</span>
        </div>
    );
}
