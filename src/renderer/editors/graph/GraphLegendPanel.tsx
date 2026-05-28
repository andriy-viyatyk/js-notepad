import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button, Input, Panel } from "../../uikit";
import color from "../../theme/color";
import type { GraphEditor } from "./GraphEditor";
import { NodeShape } from "./types";
import { ShapeIcon, LevelIcon } from "./GraphIcons";

// =============================================================================
// Constants
// =============================================================================

const ALL_SHAPES: NodeShape[] = ["circle", "square", "diamond", "triangle", "star", "hexagon"];
const ALL_LEVELS = [1, 2, 3, 4, 5];
type LegendTab = "level" | "shape" | "selection";
type SelectionFilter = "" | "selected" | "not-selected" | "selected-with-children";

/** Host type for this panel. Post-US-559 the legacy `GraphViewModel` is
 *  retired; the alias resolves to the v4 `GraphEditor` only. */
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

export function GraphLegendPanel({ editor }: GraphLegendPanelProps) {
    const [expanded, setExpanded] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [focusWithin, setFocusWithin] = useState(false);
    const [activeTab, setActiveTab] = useState<LegendTab>("selection");
    const [checkedLevels, setCheckedLevels] = useState<Set<string>>(new Set());
    const [checkedShapes, setCheckedShapes] = useState<Set<string>>(new Set());
    const [selectionFilter, setSelectionFilter] = useState<SelectionFilter>("selected-with-children");
    const [descriptions, setDescriptions] = useState<Record<string, Record<string, string>>>({ levels: {}, shapes: {} });

    const selectedKey = useSyncExternalStore(
        (cb) => editor.state.subscribe(cb),
        () => editor.state.get().selectedNodes.map((n) => n.id).join(","),
    );
    const searchQuery = useSyncExternalStore(
        (cb) => editor.state.subscribe(cb),
        () => editor.state.get().searchQuery,
    );
    const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    useEffect(() => {
        editor.onHighlightSelection = () => {
            setExpanded(true);
            setActiveTab("selection");
            setSelectionFilter("selected");
        };
        return () => { editor.onHighlightSelection = null; };
    }, [editor]);

    useEffect(() => {
        const legend = editor.getLegendDescriptions();
        setDescriptions({
            levels: { ...legend.levels },
            shapes: { ...legend.shapes },
        });
    }, [editor]);

    const { hasRoot, hasGroup } = useMemo(() => {
        const info = editor.getPresentLevelsAndShapes();
        return { hasRoot: info.hasRoot, hasGroup: info.hasGroup };
    }, [editor]);

    useEffect(() => {
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
                const allIds = new Set(editor.renderer.getNodes().map((n) => n.id));
                for (const id of selectedIds) allIds.delete(id);
                editor.setLegendHighlight(allIds.size > 0 ? allIds : new Set());
            }
            return;
        }

        const checked = activeTab === "level" ? checkedLevels : checkedShapes;
        if (checked.size === 0) {
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
    }, [editor, expanded, activeTab, checkedLevels, checkedShapes, selectionFilter, selectedKey]);

    const toggleCheck = useCallback((tab: LegendTab, key: string) => {
        const setter = tab === "level" ? setCheckedLevels : setCheckedShapes;
        setter((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const handleDescriptionChange = useCallback((tab: "levels" | "shapes", key: string, value: string) => {
        setDescriptions((prev) => ({
            ...prev,
            [tab]: { ...prev[tab], [key]: value },
            ...(key === "root" ? { [tab === "levels" ? "shapes" : "levels"]: { ...prev[tab === "levels" ? "shapes" : "levels"], root: value } } : {}),
        }));

        const timerKey = `${tab}:${key}`;
        const existing = debounceTimers.current.get(timerKey);
        if (existing) clearTimeout(existing);
        debounceTimers.current.set(timerKey, setTimeout(() => {
            editor.setLegendDescription(tab, key, value);
            debounceTimers.current.delete(timerKey);
        }, 300));
    }, [editor]);

    useEffect(() => () => {
        for (const timer of debounceTimers.current.values()) clearTimeout(timer);
    }, []);

    const toggleExpanded = useCallback(() => {
        setExpanded((prev) => !prev);
    }, []);

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
                                            onToggle={() => setSelectionFilter((prev) => prev === "selected" ? "" : "selected")}
                                        />
                                        <SelectionRadioRow
                                            label="Selected with children"
                                            checked={selectionFilter === "selected-with-children"}
                                            onToggle={() => setSelectionFilter((prev) => prev === "selected-with-children" ? "" : "selected-with-children")}
                                        />
                                        <SelectionRadioRow
                                            label="Not selected"
                                            checked={selectionFilter === "not-selected"}
                                            onToggle={() => setSelectionFilter((prev) => prev === "not-selected" ? "" : "not-selected")}
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
