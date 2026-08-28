import { pagesModel } from "../../api/pages";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import { alertsBarModel } from "../../uikit";
import { ForceGraphRenderer } from "./ForceGraphRenderer";
import { GraphConnectivityModel } from "./GraphConnectivityModel";
import { GraphDataModel } from "./GraphDataModel";
import { GraphGroupModel } from "./GraphGroupModel";
import { GraphPositionHints } from "./GraphGroupActionsModel";
import { buildMarkdown } from "./GraphTooltipView";
import { GraphVisibilityModel } from "./GraphVisibilityModel";
import { GraphData, GraphLink, GraphNode, linkIds } from "./types";

interface GraphMutationCallbacks {
    rebuildAndRender: (
        anchorNodeId?: string,
        newNodePositions?: GraphPositionHints,
        ensureVisible?: string[],
    ) => void;
    serializeToHost: () => void;
    clearRootIfDeleted: (nodeId: string) => void;
    refreshSelectedNodes: () => void;
    initializeEmptyGraph: () => void;
    cleanupEmptyGroups: () => boolean;
    getSelectedNodes: () => GraphNode[];
}

/** Owns graph edits and their rebuild/serialize orchestration. */
export class GraphMutationModel {
    constructor(
        private readonly dataModel: GraphDataModel,
        private readonly groupModel: GraphGroupModel,
        private readonly connectivityModel: GraphConnectivityModel,
        private readonly visibilityModel: GraphVisibilityModel,
        private readonly renderer: ForceGraphRenderer,
        private readonly callbacks: GraphMutationCallbacks,
    ) {}

    updateNodeProps(nodeId: string, props: Partial<GraphNode>): void {
        this.dataModel.updateNodeProps(nodeId, props);
        this.finalize(true);
    }

    renameNode(oldId: string, newId: string): boolean {
        if (!this.dataModel.renameNode(oldId, newId)) return false;
        this.visibilityModel.renameId(oldId, newId);

        const oldRendered = this.renderer.getNodes().find((node) => node.id === oldId);
        const positionHints = oldRendered?.x != null && oldRendered?.y != null
            ? new Map([[newId, { x: oldRendered.x, y: oldRendered.y }]])
            : undefined;
        this.renderer.selectNode(newId);
        this.callbacks.rebuildAndRender(undefined, positionHints);
        this.callbacks.serializeToHost();
        this.callbacks.refreshSelectedNodes();
        return true;
    }

    addNode(worldX: number, worldY: number): string {
        if (!this.dataModel.sourceData) this.callbacks.initializeEmptyGraph();
        const id = this.dataModel.addNode();
        this.callbacks.rebuildAndRender(undefined, new Map([[id, { x: worldX, y: worldY }]]), [id]);
        this.callbacks.serializeToHost();
        return id;
    }

    deleteNode(nodeId: string): void {
        this.dataModel.deleteNode(nodeId);
        this.callbacks.clearRootIfDeleted(nodeId);
        if (this.renderer.selectedIds.has(nodeId) && this.renderer.selectedIds.size <= 1) {
            this.renderer.selectNode("");
        }
        this.callbacks.cleanupEmptyGroups();
        this.finalize();
    }

    async deleteSelectedNodes(): Promise<void> {
        const ids = [...this.renderer.selectedIds];
        if (ids.length === 0) return;
        if (ids.length > 1) {
            const result = await showConfirmationDialog({
                title: "Delete Nodes",
                message: `Delete ${ids.length} selected nodes?`,
            });
            if (result !== "Yes") return;
        }

        for (const id of ids) {
            this.dataModel.deleteNode(id);
            this.callbacks.clearRootIfDeleted(id);
        }
        this.callbacks.cleanupEmptyGroups();
        this.renderer.selectNode("");
        this.finalize();
    }

    copySelectedMarkdown(): void {
        const markdown = this.buildSelectedMarkdown();
        if (markdown) navigator.clipboard.writeText(markdown);
    }

    openSelectedMarkdown(): void {
        const markdown = this.buildSelectedMarkdown();
        if (!markdown) return;
        const selectedNodes = this.callbacks.getSelectedNodes();
        const title = selectedNodes.length === 1
            ? selectedNodes[0]?.title || "Node"
            : `${selectedNodes.length} nodes`;
        pagesModel.addEditorPage("md-view", "markdown", title, markdown);
    }

    openSelectedGrid(): void {
        const selectedIds = this.renderer.selectedIds;
        if (selectedIds.size === 0) return;
        const nodes = (this.dataModel.sourceData?.nodes ?? [])
            .filter((node) => selectedIds.has(node.id))
            .map((node) => this.dataModel.cleanNode(node));
        const title = nodes.length === 1
            ? nodes[0].title || nodes[0].id
            : `${nodes.length} nodes`;
        pagesModel.addEditorPage("grid-json", "json", `${title}.grid.json`, JSON.stringify(nodes, null, 2));
    }

    extractSelected(withChildren: boolean): void {
        if (!this.dataModel.sourceData) return;
        const selectedIds = new Set(this.renderer.selectedIds);
        if (selectedIds.size === 0) return;

        if (withChildren) {
            const children: string[] = [];
            for (const id of selectedIds) {
                children.push(...this.connectivityModel.getRealNeighborIds(id));
            }
            for (const id of children) selectedIds.add(id);
        }

        const nodeMap = new Map(this.dataModel.sourceData.nodes.map((node) => [node.id, node]));
        for (const id of [...selectedIds]) {
            const node = nodeMap.get(id);
            if (!node?.isGroup) continue;
            const hasExtractedMember = [...this.groupModel.getMembers(id)].some((member) => selectedIds.has(member));
            if (!hasExtractedMember) selectedIds.delete(id);
        }

        if (selectedIds.size === 0) {
            alertsBarModel.addAlert(
                "Cannot extract group(s) only — select regular nodes or use 'Extract with children'",
                "warning",
            );
            return;
        }

        const nodes = [...selectedIds]
            .map((id) => nodeMap.get(id))
            .filter((node): node is GraphNode => !!node)
            .map((node) => this.dataModel.cleanNode(node));
        const links: GraphLink[] = [];
        for (const link of this.dataModel.sourceData.links) {
            const { source, target } = linkIds(link);
            if (selectedIds.has(source) && selectedIds.has(target)) {
                links.push({ source, target });
            }
        }

        const graphData: GraphData = { nodes, links };
        const title = withChildren ? "Extract with children.fg.json" : "Extract.fg.json";
        pagesModel.addEditorPage("graph-view", "json", title, JSON.stringify(graphData, null, 2));
    }

    addLink(sourceId: string, targetId: string): void {
        this.dataModel.addLink(sourceId, targetId);
        this.finalize();
    }

    deleteLink(sourceId: string, targetId: string): void {
        this.dataModel.deleteLink(sourceId, targetId);
        this.finalize();
    }

    addChild(parentId: string): string {
        const id = this.dataModel.addChild(parentId);
        if (!id) return "";
        const parentGroup = this.groupModel.getGroupOf(parentId);
        if (parentGroup) this.dataModel.addLink(parentGroup, id);
        this.callbacks.rebuildAndRender(parentId, undefined, [id, parentId]);
        this.callbacks.serializeToHost();
        return id;
    }

    applyPropertiesUpdate(nodeId: string, propsToSet: Record<string, string>, keysToRemove: string[]): void {
        this.dataModel.applyPropertiesUpdate(nodeId, propsToSet, keysToRemove);
        this.finalize(true);
    }

    applyLinkedNodesUpdate(selectedNodeId: string, rows: Record<string, unknown>[], originalIds: Set<string>): void {
        this.dataModel.applyLinkedNodesUpdate(selectedNodeId, rows, originalIds);
        this.finalize(true);
    }

    batchUpdateNodeProps(nodeIds: string[], props: Partial<GraphNode>): void {
        for (const id of nodeIds) this.dataModel.updateNodeProps(id, props);
        this.finalize(true);
    }

    batchApplyPropertiesUpdate(
        nodeIds: string[],
        propsToSet: Record<string, string>,
        keysToRemove: string[],
    ): void {
        for (const id of nodeIds) this.dataModel.applyPropertiesUpdate(id, propsToSet, keysToRemove);
        this.finalize(true);
    }

    private buildSelectedMarkdown(): string | null {
        const nodes = this.callbacks.getSelectedNodes();
        if (nodes.length === 0) return null;
        const rootId = this.dataModel.sourceData?.options?.rootNode;
        const parts = nodes.map((node) => buildMarkdown(node, node.id === rootId));
        if (nodes.length === 1) return parts[0];

        const table = ["| Title | ID |", "|-------|-----|"];
        for (const node of nodes) {
            table.push(`| ${(node.title || "").replace(/\|/g, "\\|")} | ${node.id} |`);
        }
        return table.join("\n") + "\n\n---\n\n" + parts.join("\n\n---\n\n");
    }

    private finalize(refreshSelection = false): void {
        this.callbacks.rebuildAndRender();
        this.callbacks.serializeToHost();
        if (refreshSelection) this.callbacks.refreshSelectedNodes();
    }
}
