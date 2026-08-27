import type { MenuItem } from "../../uikit/Menu";
import type { SlotContent } from "../../uikit/shared/fill-slot";
import type { SlotText } from "../../uikit/shared/slots";
import { TreeView } from "../../uikit/Tree/TreeView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createFolderIconElement } from "../../components/icons/icon-elements";
import { createIconElement } from "../../uikit/shared/slots";
import {
    buildToolsTree,
    type ToolTreeNode,
    type ToolsetTreeInput,
} from "./tools-tree-build";

export interface ToolsTreeViewProps {
    name?: string;
    toolsets: ToolsetTreeInput[];
    baseRoot?: string;
    onOpenToolset: (root: string) => void;
    getContextMenu?: (root: string) => MenuItem[] | undefined;
    emptyMessage?: SlotText | Node;
    renderTrailing?: (root: string) => SlotContent;
}

export class ToolsTreeView extends VanillaView<ToolsTreeViewProps> {
    private readonly iconElements = new Map<string, Node>();
    private readonly handleChange = (node: ToolTreeNode): void => {
        if (node.kind === "toolset" && node.root) this.props.onOpenToolset(node.root);
    };
    private readonly handleActiveChange = (index: number | null): void => {
        this.activeIndex = index;
        this.tree?.update(this.treeProps());
    };
    private readonly getContextMenu = (node: ToolTreeNode): MenuItem[] | undefined =>
        node.kind === "toolset" && node.root
            ? this.props.getContextMenu?.(node.root)
            : undefined;
    private readonly getIconElement = (node: ToolTreeNode): Node => {
        const cached = this.iconElements.get(node.value);
        if (cached) return cached;

        const icon = node.kind === "toolset"
            ? createIconElement("tools", { width: 16, height: 16 })
            : createFolderIconElement();
        this.iconElements.set(node.value, icon);
        return icon;
    };
    private readonly renderTrailing = (node: ToolTreeNode): SlotContent | undefined =>
        node.kind === "toolset" && node.root
            ? this.props.renderTrailing?.(node.root)
            : undefined;

    private tree: TreeView<ToolTreeNode> | undefined;
    private activeIndex: number | null = null;
    private nodes: ToolTreeNode[] = [];
    private nodesToolsets: ToolsetTreeInput[] | undefined;
    private nodesBaseRoot: string | undefined;

    public constructor(props: ToolsTreeViewProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "tools-tree";
        this.root.style.display = "contents";
        this.own(() => this.iconElements.clear());
    }

    protected onMount(): void {
        const tree = this.child(new TreeView<ToolTreeNode>(this.treeProps()));
        this.tree = tree;
        this.root.append(tree.root);
        tree.mount();
    }

    protected onUpdate(): void {
        this.tree?.update(this.treeProps());
        this.tree?.refreshRows();
    }

    private treeProps() {
        return {
            name: this.props.name,
            items: this.projectNodes(),
            defaultExpandAll: true,
            rowHeight: 28,
            activeIndex: this.activeIndex,
            onActiveChange: this.handleActiveChange,
            onChange: this.handleChange,
            getContextMenu: this.getContextMenu,
            getIconElement: this.getIconElement,
            renderTrailing: this.renderTrailing,
            emptyMessage: this.props.emptyMessage,
        };
    }

    private projectNodes(): ToolTreeNode[] {
        if (this.nodesToolsets === this.props.toolsets && this.nodesBaseRoot === this.props.baseRoot) {
            return this.nodes;
        }
        this.nodesToolsets = this.props.toolsets;
        this.nodesBaseRoot = this.props.baseRoot;
        this.nodes = buildToolsTree(this.props.toolsets, this.props.baseRoot);
        return this.nodes;
    }
}
