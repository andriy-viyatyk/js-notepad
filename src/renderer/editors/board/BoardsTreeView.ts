import type React from "react";
import type { MenuItem } from "../../uikit/Menu";
import { TreeView } from "../../uikit/Tree/TreeView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createFolderIconElement } from "../../components/icons/icon-elements";
import { subscribeBoardIconChanges } from "./board-icon-cache";
import { createBoardGlyphElement } from "./board-glyph-element";
import { buildBoardsTree, type BoardTreeNode } from "./boards-tree-build";
import type { BoardsTreeProps } from "./BoardsTree";

export interface BoardsTreeViewProps extends Omit<BoardsTreeProps, "renderTrailing"> {
    renderTrailing?: (root: string) => React.ReactNode | Node;
}

export class BoardsTreeView extends VanillaView<BoardsTreeViewProps> {
    private readonly iconElements = new Map<string, Node>();
    private readonly handleChange = (node: BoardTreeNode): void => {
        if (node.kind === "board" && node.root) this.props.onOpenBoard(node.root);
    };
    private readonly handleActiveChange = (index: number | null): void => {
        this.activeIndex = index;
        this.tree?.update(this.treeProps());
    };
    private readonly getContextMenu = (node: BoardTreeNode): MenuItem[] | undefined =>
        node.kind === "board" && node.root
            ? this.props.getBoardContextMenu?.(node.root)
            : undefined;
    private readonly getIconElement = (node: BoardTreeNode): Node => {
        const cached = this.iconElements.get(node.value);
        if (cached) return cached;

        const icon = node.kind === "board"
            ? createBoardGlyphElement(node.root, 16)
            : createFolderIconElement();
        this.iconElements.set(node.value, icon);
        return icon;
    };
    private readonly renderTrailing = (node: BoardTreeNode): React.ReactNode | Node | undefined =>
        node.kind === "board" && node.root
            ? this.props.renderTrailing?.(node.root)
            : undefined;
    private readonly getTrailingVisibility = (node: BoardTreeNode): "always" | "hover" =>
        node.kind === "board" && node.root && this.props.trailingVisible
            && !this.props.trailingVisible(node.root)
            ? "hover"
            : "always";

    private tree: TreeView<BoardTreeNode> | undefined;
    private activeIndex: number | null = null;
    private nodes: BoardTreeNode[] = [];
    private nodesBoards: string[] | undefined;
    private nodesBaseRoot: string | undefined;

    public constructor(props: BoardsTreeViewProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "boards-tree";
        this.root.style.display = "contents";
        this.own(() => this.iconElements.clear());
    }

    protected onMount(): void {
        this.own(subscribeBoardIconChanges(() => {
            for (const value of this.iconElements.keys()) {
                if (value.startsWith("board:")) this.iconElements.delete(value);
            }
            this.tree?.refreshRows();
        }));

        const tree = this.child(new TreeView<BoardTreeNode>(this.treeProps()));
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
            getTrailingVisibility: this.getTrailingVisibility,
            emptyMessage: this.props.emptyMessage,
        };
    }

    private projectNodes(): BoardTreeNode[] {
        if (this.nodesBoards === this.props.boards && this.nodesBaseRoot === this.props.baseRoot) {
            return this.nodes;
        }
        this.nodesBoards = this.props.boards;
        this.nodesBaseRoot = this.props.baseRoot;
        this.nodes = buildBoardsTree(this.props.boards, this.props.baseRoot);
        return this.nodes;
    }
}
