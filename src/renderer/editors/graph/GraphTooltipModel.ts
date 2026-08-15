import { IState } from "../../core/state/state";
import { ForceGraphRenderer } from "./ForceGraphRenderer";
import { GraphDataModel } from "./GraphDataModel";
import { GraphGroupModel } from "./GraphGroupModel";
import { GraphNode, nodeLabel } from "./types";

export interface GraphTooltipInfo {
    node: GraphNode;
    x: number;
    y: number;
    isRoot?: boolean;
}

interface GraphTooltipState {
    tooltip: GraphTooltipInfo | null;
    statusHint: string;
}

/** Owns delayed graph tooltip display/hide and the hover status hint. */
export class GraphTooltipModel<TState extends GraphTooltipState = GraphTooltipState> {
    private showTimer: ReturnType<typeof setTimeout> | undefined;
    private hideTimer: ReturnType<typeof setTimeout> | undefined;
    private tooltipHovered = false;

    constructor(
        private readonly state: IState<TState>,
        private readonly renderer: ForceGraphRenderer,
        private readonly dataModel: GraphDataModel,
        private readonly groupModel: GraphGroupModel,
        private readonly isPopupOpen: () => boolean,
    ) {}

    handleHoverChanged(nodeId: string, clientX: number, clientY: number): void {
        clearTimeout(this.showTimer);

        if (!nodeId || this.renderer.isDragging || this.isPopupOpen()) {
            this.clearDelayed();
            this.updateStatusHint("");
            return;
        }

        clearTimeout(this.hideTimer);
        this.tooltipHovered = false;

        const currentTooltip = this.state.get().tooltip;
        if (currentTooltip && currentTooltip.node.id !== nodeId) {
            this.state.update((s) => { s.tooltip = null; });
        }

        this.updateLinkStatusHint(nodeId);

        this.showTimer = setTimeout(() => {
            const node = this.renderer.getNodes().find((candidate) => candidate.id === nodeId);
            if (!node) return;
            const rootNode = this.dataModel.sourceData?.options?.rootNode;
            this.state.update((s) => {
                s.tooltip = {
                    node: { ...node },
                    x: clientX,
                    y: clientY,
                    isRoot: (rootNode === node.id) || undefined,
                };
            });
        }, 500);
    }

    clear(): void {
        clearTimeout(this.showTimer);
        clearTimeout(this.hideTimer);
        this.tooltipHovered = false;
        if (this.state.get().tooltip) {
            this.state.update((s) => { s.tooltip = null; });
        }
    }

    setHovered(hovered: boolean): void {
        this.tooltipHovered = hovered;
        if (hovered) {
            clearTimeout(this.hideTimer);
        } else {
            this.clearDelayed();
        }
    }

    dispose(): void {
        clearTimeout(this.showTimer);
        clearTimeout(this.hideTimer);
        this.showTimer = undefined;
        this.hideTimer = undefined;
    }

    private clearDelayed(): void {
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => {
            if (!this.tooltipHovered) this.clear();
        }, 150);
    }

    private updateLinkStatusHint(nodeId: string): void {
        const selectedId = this.renderer.selectedId;
        if (!selectedId || this.renderer.selectedIds.size !== 1 || nodeId === selectedId || !this.dataModel.sourceData) {
            this.updateStatusHint("");
            return;
        }

        const selectedNode = this.dataModel.sourceData.nodes.find((node) => node.id === selectedId);
        const hoveredNode = this.dataModel.sourceData.nodes.find((node) => node.id === nodeId);

        if (selectedNode?.isGroup && hoveredNode?.isGroup) {
            const hoveredLabel = nodeLabel(hoveredNode);
            const selectedLabel = nodeLabel(selectedNode);
            const isMember = this.groupModel.getGroupOf(nodeId) === selectedId;
            const isReverseMember = this.groupModel.getGroupOf(selectedId) === nodeId;
            if (isMember) {
                this.updateStatusHint(`Alt+Click to remove "${hoveredLabel}" from "${selectedLabel}"`);
            } else if (isReverseMember) {
                this.updateStatusHint(`Alt+Click to remove "${selectedLabel}" from "${hoveredLabel}"`);
            } else {
                this.updateStatusHint(`Alt+Click to add "${hoveredLabel}" into "${selectedLabel}"`);
            }
        } else if (selectedNode?.isGroup && !hoveredNode?.isGroup) {
            const isMember = this.groupModel.getGroupOf(nodeId) === selectedId;
            const label = nodeLabel(selectedNode);
            this.updateStatusHint(isMember
                ? `Alt+Click to remove from "${label}"`
                : `Alt+Click to add to "${label}"`);
        } else if (!selectedNode?.isGroup && hoveredNode?.isGroup) {
            const isMember = this.groupModel.getGroupOf(selectedId) === nodeId;
            const groupLabel = nodeLabel(hoveredNode);
            this.updateStatusHint(isMember
                ? `Alt+Click to remove from "${groupLabel}"`
                : `Alt+Click to add to "${groupLabel}"`);
        } else {
            const linked = this.dataModel.linkExists(selectedId, nodeId);
            const label = nodeLabel(selectedNode ?? { id: selectedId });
            this.updateStatusHint(linked
                ? `Alt+Click to unlink from "${label}"`
                : `Alt+Click to link with "${label}"`);
        }
    }

    private updateStatusHint(hint: string): void {
        if (this.state.get().statusHint !== hint) {
            this.state.update((s) => { s.statusHint = hint; });
        }
    }
}
