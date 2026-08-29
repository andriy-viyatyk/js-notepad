import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../../ui/secondary-views/SideBarPanelHeaderView";
import { TraitTypeId, type TraitDragPayload, resolveTraits } from "../../../core/traits";
import { LINK } from "../../../core/traits";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import "../../../uikit/Panel/Panel.css";
import { TreeView } from "../../../uikit/Tree/TreeView";
import type { TreeProps } from "../../../uikit/Tree/types";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { NotebookEditor } from "../NotebookEditor";
import { buildCategoryTreeItems, type CategoryItem } from "../category-tree";

export default class NotebookCategoriesSecondaryView extends VanillaView<SecondaryViewProps> {
    private editor: NotebookEditor | undefined;
    private tree: TreeView<CategoryItem> | undefined;
    private stateUnsubscribe: (() => void) | undefined;
    private header: SideBarPanelHeaderHandle | undefined;

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "notebook-categories-secondary-view",
            direction: "column",
            flex: true,
            minHeight: 0,
            overflow: "hidden",
            paddingLeft: "sm",
        }));
    }

    protected onMount(): void {
        const editor = this.notebookEditor(this.props);
        if (!editor) return;

        this.editor = editor;
        this.mountTree(editor);
        this.subscribeToEditor(editor);
        this.header = createSideBarPanelHeader({
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            title: "Categories",
        });
        this.own(() => this.header?.dispose());
        this.updateHeader(this.props);
    }

    protected onUpdate(props: SecondaryViewProps): void {
        const nextEditor = this.notebookEditor(props);
        if (nextEditor !== this.editor) {
            this.retireTree();
            this.stateUnsubscribe?.();
            this.stateUnsubscribe = undefined;
            this.editor = nextEditor;
            if (nextEditor) {
                this.mountTree(nextEditor);
                this.subscribeToEditor(nextEditor);
            }
            this.ensureHeader(props);
        } else if (nextEditor) {
            this.tree?.update(this.treeProps(nextEditor));
        }
        this.updateHeader(props);
    }

    protected onDispose(): void {
        this.stateUnsubscribe = undefined;
        this.tree = undefined;
        this.header = undefined;
        this.editor = undefined;
    }

    private notebookEditor(props: SecondaryViewProps): NotebookEditor | undefined {
        return props.model instanceof NotebookEditor ? props.model : undefined;
    }

    private mountTree(editor: NotebookEditor): void {
        const tree = this.child(new TreeView<CategoryItem>(this.treeProps(editor)));
        this.tree = tree;
        this.root.append(tree.root);
        tree.mount();
    }

    private retireTree(): void {
        const tree = this.tree;
        this.tree = undefined;
        if (tree) this.releaseChild(tree);
    }

    private subscribeToEditor(editor: NotebookEditor): void {
        this.stateUnsubscribe = this.ownSubscription(editor.state.subscribe(() => {
            if (this.editor !== editor) return;
            this.tree?.update(this.treeProps(editor));
        }));
    }

    private treeProps(editor: NotebookEditor): TreeProps<CategoryItem> {
        const state = editor.state.get();
        return {
            name: "notebook-categories-tree",
            items: buildCategoryTreeItems(state.categories, editor.getCategorySize),
            isSelected: (item) => item.category === state.selectedCategory,
            onChange: editor.categoryItemClick,
            traitTypeId: TraitTypeId.NotebookCategory,
            getDragData: editor.getCategoryDragData,
            acceptsDrop: true,
            canTraitDrop: this.canCategoryTraitDrop,
            onTraitDrop: editor.categoryTraitDrop,
            defaultExpandAll: true,
            focusSelection: true,
        };
    }

    private readonly canCategoryTraitDrop = (
        _dropItem: CategoryItem,
        payload: TraitDragPayload,
    ): boolean => {
        if (payload.typeId === TraitTypeId.Note) return true;
        if (payload.typeId === TraitTypeId.NotebookCategory) return true;
        const traits = resolveTraits(payload.typeId);
        return !!traits?.get(LINK);
    };

    private ensureHeader(props: SecondaryViewProps): void {
        if (this.header || !this.editor) return;
        this.header = createSideBarPanelHeader({
            headerRef: props.headerRef,
            icon: props.iconElement,
            title: "Categories",
        });
        this.own(() => this.header?.dispose());
    }

    private updateHeader(props: SecondaryViewProps): void {
        this.header?.update({
            headerRef: props.headerRef,
            icon: props.iconElement,
            title: "Categories",
        });
    }
}
