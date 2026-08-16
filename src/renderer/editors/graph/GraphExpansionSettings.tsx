import { useCallback, useMemo } from "react";
import { Input, Panel, Select } from "../../uikit";
import type { IListBoxItem } from "../../uikit";
import { GraphNode, GraphOptions, nodeLabel } from "./types";
import color from "../../theme/color";
import { TComponentModel, useComponentModel } from "../../core/state/model";

/** Narrow structural interface — satisfied by both `GraphEditor` 
 *  and legacy `GraphViewModel` (preserved per GR1). Only the surface this
 *  panel actually consumes. */
interface GraphExpansionHost {
    getExpansionOptions(): { rootNode?: string; expandDepth?: number; maxVisible?: number };
    getAllNodes(): GraphNode[];
    setRootNode(nodeId: string | undefined): void;
    updateExpansionOptions(patch: Partial<Pick<GraphOptions, "expandDepth" | "maxVisible">>): void;
}

interface GraphExpansionSettingsProps {
    editor: GraphExpansionHost;
}

/** Sentinel value representing "auto" root selection (no explicit rootNode). */
const AUTO_ROOT = "__auto__";

interface GraphExpansionState {
    rootNode: string;
    expandDepthStr: string;
    maxVisibleStr: string;
}

class GraphExpansionModel extends TComponentModel<GraphExpansionState, GraphExpansionSettingsProps> {
    setRootNode = (rootNode: string) => {
        this.state.update((s) => { s.rootNode = rootNode; });
    };

    setExpandDepthStr = (expandDepthStr: string) => {
        this.state.update((s) => { s.expandDepthStr = expandDepthStr; });
    };

    setMaxVisibleStr = (maxVisibleStr: string) => {
        this.state.update((s) => { s.maxVisibleStr = maxVisibleStr; });
    };
}

const labelStyle: React.CSSProperties = {
    width: 72,
    flexShrink: 0,
    fontSize: 11,
    color: color.graph.labelText,
    opacity: 0.8,
};

const noteStyle: React.CSSProperties = {
    fontSize: 10,
    fontStyle: "italic",
    paddingTop: 2,
    color: color.warning.text,
};

function GraphExpansionSettings({ editor }: GraphExpansionSettingsProps) {
    const opts = editor.getExpansionOptions();
    const model = useComponentModel({ editor }, GraphExpansionModel, {
        rootNode: opts.rootNode ?? "",
        expandDepthStr: opts.expandDepth !== undefined ? String(opts.expandDepth) : "",
        maxVisibleStr: opts.maxVisible !== undefined ? String(opts.maxVisible) : "",
    });
    const { rootNode, expandDepthStr, maxVisibleStr } = model.state.use();

    const items = useMemo<IListBoxItem[]>(() => {
        const nodes = editor.getAllNodes();
        const sorted = [...nodes].sort((a, b) => nodeLabel(a).localeCompare(nodeLabel(b)));
        return [
            { value: AUTO_ROOT, label: "(auto — lowest level)" },
            ...sorted.map((n) => ({ value: n.id, label: nodeLabel(n) })),
        ];
    }, [editor]);

    const selectedValue = rootNode || AUTO_ROOT;
    const selectedItem = items.find((i) => i.value === selectedValue) ?? null;

    const onRootChange = useCallback((item: IListBoxItem) => {
        const value = String(item.value);
        const nodeId = value === AUTO_ROOT ? undefined : value;
        model.setRootNode(nodeId ?? "");
        editor.setRootNode(nodeId);
    }, [editor, model]);

    const commitExpandDepth = useCallback(() => {
        const trimmed = expandDepthStr.trim();
        if (!trimmed) {
            editor.updateExpansionOptions({ expandDepth: undefined });
        } else {
            const num = parseInt(trimmed, 10);
            if (!isNaN(num) && num >= 1) {
                model.setExpandDepthStr(String(num));
                editor.updateExpansionOptions({ expandDepth: num });
            } else {
                model.setExpandDepthStr(opts.expandDepth !== undefined ? String(opts.expandDepth) : "");
            }
        }
    }, [editor, expandDepthStr, opts.expandDepth, model]);

    const commitMaxVisible = useCallback(() => {
        const trimmed = maxVisibleStr.trim();
        if (!trimmed) {
            editor.updateExpansionOptions({ maxVisible: undefined });
        } else {
            const num = parseInt(trimmed, 10);
            if (!isNaN(num) && num >= 10) {
                model.setMaxVisibleStr(String(num));
                editor.updateExpansionOptions({ maxVisible: num });
            } else {
                model.setMaxVisibleStr(opts.maxVisible !== undefined ? String(opts.maxVisible) : "");
            }
        }
    }, [editor, maxVisibleStr, opts.maxVisible, model]);

    const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, commit: () => void) => {
        if (e.key === "Enter") {
            commit();
            (e.target as HTMLInputElement).blur();
        }
    }, []);

    return (
        <Panel name="graph-expansion-settings" direction="column" gap="md" paddingX="md" paddingY="sm">
            <Panel direction="row" align="center" gap="md">
                <span style={labelStyle}>Root Node</span>
                <Select
                    name="graph-expansion-root"
                    size="sm"
                    items={items}
                    value={selectedItem}
                    onChange={onRootChange}
                    filterMode="contains"
                />
            </Panel>
            <Panel direction="row" align="center" gap="md">
                <span style={labelStyle}>Expand Depth</span>
                <Input
                    name="graph-expansion-depth"
                    size="sm"
                    placeholder="∞ (unlimited)"
                    value={expandDepthStr}
                    onChange={model.setExpandDepthStr}
                    onBlur={commitExpandDepth}
                    onKeyDown={(e) => onKeyDown(e, commitExpandDepth)}
                />
            </Panel>
            <Panel direction="row" align="center" gap="md">
                <span style={labelStyle}>Max Visible</span>
                <Input
                    name="graph-expansion-max"
                    size="sm"
                    placeholder="500 (default)"
                    value={maxVisibleStr}
                    onChange={model.setMaxVisibleStr}
                    onBlur={commitMaxVisible}
                    onKeyDown={(e) => onKeyDown(e, commitMaxVisible)}
                />
            </Panel>
            <span style={noteStyle}>Depth and max visible apply when file is reopened</span>
        </Panel>
    );
}

export { GraphExpansionSettings };
