import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import { showInputDialog } from "../../ui/dialogs/InputDialog";
import { alertsBarModel } from "../../uikit";
import { ForceGraphRenderer } from "./ForceGraphRenderer";
import { GraphConnectivityModel } from "./GraphConnectivityModel";
import { GraphDataModel } from "./GraphDataModel";
import { GraphGroupModel } from "./GraphGroupModel";
import { GraphNode, nodeLabel } from "./types";

export type GraphPositionHints = Map<string, { x: number; y: number }>;

interface GraphGroupActionsCallbacks {
    rebuildAndRender: (
        anchorNodeId?: string,
        newNodePositions?: GraphPositionHints,
        ensureVisible?: string[],
    ) => void;
    serializeToHost: () => void;
    clearRootIfDeleted: (nodeId: string) => void;
    updateNodeProps: (nodeId: string, props: Partial<GraphNode>) => void;
}

/** Interactive group editing built on top of the read-only GraphGroupModel index. */
export class GraphGroupActionsModel {
    constructor(
        private readonly dataModel: GraphDataModel,
        private readonly groupModel: GraphGroupModel,
        private readonly connectivityModel: GraphConnectivityModel,
        private readonly renderer: ForceGraphRenderer,
        private readonly callbacks: GraphGroupActionsCallbacks,
    ) {}

    handleAltClick(nodeId: string): void {
        if (this.renderer.selectedIds.size !== 1) return;
        const selectedId = this.renderer.selectedId;
        if (!selectedId || selectedId === nodeId || !this.dataModel.sourceData) return;

        const selectedNode = this.dataModel.sourceData.nodes.find((node) => node.id === selectedId);
        const clickedNode = this.dataModel.sourceData.nodes.find((node) => node.id === nodeId);
        if (!selectedNode || !clickedNode) return;

        if (selectedNode.isGroup && clickedNode.isGroup) {
            const clickedParent = this.groupModel.getGroupOf(nodeId);
            if (clickedParent === selectedId) {
                this.dataModel.deleteLink(selectedId, nodeId);
            } else if (this.groupModel.getGroupOf(selectedId) === nodeId) {
                this.dataModel.deleteLink(nodeId, selectedId);
            } else {
                if (this.groupModel.wouldCreateCycle(selectedId, nodeId)) {
                    alertsBarModel.addAlert("Cannot add: would create circular group hierarchy.", "warning");
                    return;
                }
                if (clickedParent) this.dataModel.deleteLink(clickedParent, nodeId);
                this.dataModel.addLink(selectedId, nodeId);
            }
            this.finalize();
            return;
        }

        if (selectedNode.isGroup || clickedNode.isGroup) {
            const groupId = selectedNode.isGroup ? selectedId : nodeId;
            const memberId = selectedNode.isGroup ? nodeId : selectedId;
            const isMember = this.groupModel.getGroupOf(memberId) === groupId;
            if (isMember) {
                this.dataModel.deleteLink(groupId, memberId);
            } else {
                this.reparent([memberId], groupId);
            }
            this.finalize();
            return;
        }

        if (this.dataModel.linkExists(selectedId, nodeId)) {
            this.dataModel.deleteLink(selectedId, nodeId);
        } else {
            this.dataModel.addLink(selectedId, nodeId);
        }
        this.finalize();
    }

    async groupSelectedNodes(): Promise<void> {
        if (!this.dataModel.sourceData) return;

        const selectedIds = [...this.renderer.selectedIds];
        const { groupIds, regularIds } = this.partitionSelection(selectedIds);
        const regularParents = new Set(regularIds.map((id) => this.groupModel.getGroupOf(id)));

        if (groupIds.length === 0) {
            if (regularIds.length < 2) return;
            if (regularParents.size > 1) {
                alertsBarModel.addAlert("Cannot group: selected nodes belong to different groups.", "warning");
                return;
            }
            const title = await this.requestGroupTitle();
            if (title === undefined) return;
            this.createGroup(regularIds, [...regularParents][0], title);
            return;
        }

        if (groupIds.length === 1 && regularIds.length > 0) {
            const groupId = groupIds[0];
            const groupNode = this.dataModel.sourceData.nodes.find((node) => node.id === groupId);
            const choice = await showConfirmationDialog({
                title: "Group Options",
                message: `Add ${regularIds.length} node(s) to group "${nodeLabel(groupNode ?? { id: groupId })}", or create a new group containing all selected?`,
                buttons: ["Add to Group", "Create New Group", "Cancel"],
            });
            if (choice === "Add to Group") {
                this.reparent(regularIds, groupId);
                this.finalize();
            } else if (choice === "Create New Group") {
                const title = await this.requestGroupTitle();
                if (title === undefined) return;
                const oldParent = this.groupModel.getGroupOf(groupId);
                this.createGroup([...regularIds, groupId], oldParent, title);
            }
            return;
        }

        if (groupIds.length >= 2) {
            const groupParents = new Set(groupIds.map((id) => this.groupModel.getGroupOf(id)));
            if (groupParents.size > 1) {
                alertsBarModel.addAlert("Cannot group: selected groups belong to different parent groups.", "warning");
                return;
            }

            const selectedGroupSet = new Set(groupIds);
            const commonParent = [...groupParents][0];
            for (const id of regularIds) {
                const nodeParent = this.groupModel.getGroupOf(id);
                if (nodeParent && !selectedGroupSet.has(nodeParent) && nodeParent !== commonParent) {
                    alertsBarModel.addAlert("Cannot group: selected nodes belong to different groups.", "warning");
                    return;
                }
            }

            const title = await this.requestGroupTitle();
            if (title === undefined) return;
            this.createGroup(selectedIds, commonParent, title);
        }
    }

    async editGroupTitle(groupId: string): Promise<void> {
        const currentTitle = this.dataModel.sourceData?.nodes.find((node) => node.id === groupId)?.title ?? "";
        const result = await showInputDialog({
            title: "Group Title",
            message: "Enter a title for the group:",
            value: currentTitle,
        });
        if (result?.button === "OK") {
            this.callbacks.updateNodeProps(groupId, { title: result.value });
        }
    }

    async ungroupNode(groupId: string): Promise<void> {
        if (!this.dataModel.sourceData) return;
        const node = this.dataModel.sourceData.nodes.find((candidate) => candidate.id === groupId);
        if (!node?.isGroup) return;

        const members = [...this.groupModel.getMembers(groupId)];
        const parentGroup = this.groupModel.getGroupOf(groupId);
        const destination = parentGroup
            ? `${members.length} member(s) will be moved to the parent group.`
            : `${members.length} member(s) will become top-level nodes.`;
        const result = await showConfirmationDialog({
            title: "Ungroup",
            message: `Ungroup "${nodeLabel(node)}"? ${destination}`,
        });
        if (result !== "Yes") return;

        this.dataModel.removeAllNodeLinks(groupId);
        if (parentGroup) {
            for (const memberId of members) this.dataModel.addLink(parentGroup, memberId);
        }
        this.dataModel.sourceData.nodes = this.dataModel.sourceData.nodes.filter((candidate) => candidate.id !== groupId);
        this.renderer.selectNode("");
        this.finalize();
    }

    async deleteGroupNode(groupId: string): Promise<void> {
        if (!this.dataModel.sourceData) return;
        const node = this.dataModel.sourceData.nodes.find((candidate) => candidate.id === groupId);
        if (!node?.isGroup) return;

        const visualNeighbors = this.connectivityModel.getProcessedNeighborIds(groupId);
        const parentGroup = this.groupModel.getGroupOf(groupId);
        const toDelete = new Set<string>();
        const toPromote = new Set<string>();

        for (const memberId of this.groupModel.getMembers(groupId)) {
            if (visualNeighbors.has(memberId)) {
                toDelete.add(memberId);
                if (this.groupModel.isGroup(memberId)) {
                    for (const child of this.collectAllSubGroups(memberId)) toDelete.add(child);
                    for (const child of this.connectivityModel.getAllRealMembers(memberId)) toDelete.add(child);
                }
            } else {
                toPromote.add(memberId);
            }
        }

        const realDeleteCount = [...toDelete].filter((id) => !this.groupModel.isGroup(id)).length;
        const subGroupDeleteCount = [...toDelete].filter((id) => this.groupModel.isGroup(id)).length;
        const message = this.buildDeleteMessage(
            nodeLabel(node), toDelete.size, toPromote.size,
            realDeleteCount, subGroupDeleteCount, !!parentGroup,
        );
        const result = await showConfirmationDialog({ title: "Delete Group", message });
        if (result !== "Yes") return;

        for (const id of toPromote) {
            this.dataModel.deleteLink(groupId, id);
            if (parentGroup) this.dataModel.addLink(parentGroup, id);
        }
        for (const id of toDelete) {
            this.dataModel.deleteNode(id);
            this.callbacks.clearRootIfDeleted(id);
        }
        this.dataModel.deleteNode(groupId);
        this.callbacks.clearRootIfDeleted(groupId);
        this.renderer.selectNode("");
        this.finalize();
    }

    removeFromGroup(nodeId: string): void {
        const groupId = this.groupModel.getGroupOf(nodeId);
        if (!groupId) return;
        this.dataModel.deleteLink(groupId, nodeId);
        this.cleanupEmptyGroups();
        this.finalize();
    }

    cleanupEmptyGroups(): boolean {
        if (!this.dataModel.sourceData) return false;
        let removed = false;
        for (;;) {
            const { nodes, links } = this.dataModel.sourceData;
            this.groupModel.rebuild(nodes, links);
            const emptyIds = this.groupModel.getEmptyGroupIds();
            if (emptyIds.length === 0) return removed;
            removed = true;
            for (const id of emptyIds) {
                this.dataModel.deleteNode(id);
                this.callbacks.clearRootIfDeleted(id);
            }
        }
    }

    selectChildren(): void {
        const toAdd: string[] = [];
        for (const id of this.renderer.selectedIds) {
            if (this.groupModel.isGroup(id)) continue;
            for (const neighborId of this.connectivityModel.getRealNeighborIds(id)) {
                if (!this.renderer.selectedIds.has(neighborId)) toAdd.push(neighborId);
            }
        }
        if (toAdd.length > 0) this.renderer.addToSelection(toAdd);
    }

    selectMembers(): void {
        const toAdd: string[] = [];
        for (const id of this.renderer.selectedIds) {
            if (!this.groupModel.isGroup(id)) continue;
            for (const memberId of this.groupModel.getMembers(id)) {
                if (!this.renderer.selectedIds.has(memberId)) toAdd.push(memberId);
            }
        }
        if (toAdd.length > 0) this.renderer.addToSelection(toAdd);
    }

    selectMembersDeep(): void {
        const toAdd: string[] = [];
        const visited = new Set<string>();
        const queue = [...this.renderer.selectedIds].filter((id) => this.groupModel.isGroup(id));
        while (queue.length > 0) {
            const groupId = queue.pop();
            if (!groupId || visited.has(groupId)) continue;
            visited.add(groupId);
            for (const memberId of this.groupModel.getMembers(groupId)) {
                if (!this.renderer.selectedIds.has(memberId)) toAdd.push(memberId);
                if (this.groupModel.isGroup(memberId)) queue.push(memberId);
            }
        }
        if (toAdd.length > 0) this.renderer.addToSelection(toAdd);
    }

    private partitionSelection(ids: string[]): { groupIds: string[]; regularIds: string[] } {
        const nodes = this.dataModel.sourceData?.nodes ?? [];
        const groupIds: string[] = [];
        const regularIds: string[] = [];
        for (const id of ids) {
            const node = nodes.find((candidate) => candidate.id === id);
            if (node?.isGroup) groupIds.push(id);
            else if (node) regularIds.push(id);
        }
        return { groupIds, regularIds };
    }

    private async requestGroupTitle(): Promise<string | undefined> {
        const result = await showInputDialog({
            title: "Group Title",
            message: "Enter a title for the group:",
            value: "",
        });
        return result?.button === "OK" ? result.value : undefined;
    }

    private createGroup(memberIds: string[], parentGroup: string | undefined, title: string): void {
        if (!this.dataModel.sourceData) return;
        const newGroupId = this.dataModel.generateGroupId();
        this.dataModel.sourceData.nodes.push({ id: newGroupId, isGroup: true });
        this.reparent(memberIds, newGroupId);
        if (parentGroup) this.dataModel.addLink(parentGroup, newGroupId);
        if (title) this.dataModel.updateNodeProps(newGroupId, { title });

        const position = this.centroidOf(memberIds);
        const hints = position ? new Map([[newGroupId, position]]) : undefined;
        this.callbacks.rebuildAndRender(undefined, hints, [newGroupId]);
        this.callbacks.serializeToHost();
        this.renderer.selectNode(newGroupId);
    }

    private reparent(ids: string[], groupId: string): void {
        for (const id of ids) {
            const oldGroup = this.groupModel.getGroupOf(id);
            if (oldGroup) this.dataModel.deleteLink(oldGroup, id);
            this.dataModel.addLink(groupId, id);
        }
    }

    private centroidOf(ids: string[]): { x: number; y: number } | undefined {
        const renderedById = new Map(this.renderer.getNodes().map((node) => [node.id, node]));
        let x = 0;
        let y = 0;
        let count = 0;
        for (const id of ids) {
            const node = renderedById.get(id);
            if (node?.x == null || node.y == null) continue;
            x += node.x;
            y += node.y;
            count++;
        }
        return count > 0 ? { x: x / count, y: y / count } : undefined;
    }

    private collectAllSubGroups(groupId: string): string[] {
        const result: string[] = [];
        for (const memberId of this.groupModel.getMembers(groupId)) {
            if (!this.groupModel.isGroup(memberId)) continue;
            result.push(memberId, ...this.collectAllSubGroups(memberId));
        }
        return result;
    }

    private buildDeleteMessage(
        label: string,
        deleteCount: number,
        promoteCount: number,
        realDeleteCount: number,
        subGroupDeleteCount: number,
        hasParent: boolean,
    ): string {
        const destination = hasParent ? "moved to parent group" : "promoted to top level";
        if (deleteCount === 0) {
            return `Delete group "${label}"? ${promoteCount} member(s) will be ${destination}.`;
        }
        if (promoteCount === 0) {
            return subGroupDeleteCount > 0
                ? `Delete group "${label}" and all ${realDeleteCount + subGroupDeleteCount} descendants (${realDeleteCount} nodes, ${subGroupDeleteCount} sub-groups)?`
                : `Delete group "${label}" and its ${realDeleteCount} member node(s)?`;
        }
        return `Delete group "${label}" with ${deleteCount} visually connected descendant(s)? ${promoteCount} unconnected member(s) will be ${destination}.`;
    }

    private finalize(): void {
        this.callbacks.rebuildAndRender();
        this.callbacks.serializeToHost();
    }
}
