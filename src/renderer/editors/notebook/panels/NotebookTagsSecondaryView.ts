import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../../ui/secondary-views/SideBarPanelHeaderView";
import { CategoryListView } from "../../../uikit/CategoryList/CategoryListView";
import type { CategoryListProps } from "../../../uikit/CategoryList/CategoryList";
import "../../../uikit/CategoryList/CategoryList.css";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import "../../../uikit/Panel/Panel.css";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { NotebookEditor } from "../NotebookEditor";

export default class NotebookTagsSecondaryView extends VanillaView<SecondaryViewProps> {
    private editor: NotebookEditor | undefined;
    private list: CategoryListView | undefined;
    private stateUnsubscribe: (() => void) | undefined;
    private header: SideBarPanelHeaderHandle | undefined;

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "notebook-tags-secondary-view",
            direction: "row",
            flex: true,
            height: 0,
            overflow: "hidden",
            width: "100%",
        }));
    }

    protected onMount(): void {
        const editor = this.notebookEditor(this.props);
        if (!editor) return;

        this.editor = editor;
        this.mountList(editor);
        this.subscribeToEditor(editor);
        this.header = createSideBarPanelHeader({
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            title: "Tags",
        });
        this.own(() => this.header?.dispose());
        this.updateHeader(this.props);
    }

    protected onUpdate(props: SecondaryViewProps): void {
        const nextEditor = this.notebookEditor(props);
        if (nextEditor !== this.editor) {
            this.retireList();
            this.stateUnsubscribe?.();
            this.stateUnsubscribe = undefined;
            this.editor = nextEditor;
            if (nextEditor) {
                this.mountList(nextEditor);
                this.subscribeToEditor(nextEditor);
            }
            this.ensureHeader(props);
        } else if (nextEditor) {
            this.list?.update(this.listProps(nextEditor));
        }
        this.updateHeader(props);
    }

    protected onDispose(): void {
        this.stateUnsubscribe = undefined;
        this.list = undefined;
        this.header = undefined;
        this.editor = undefined;
    }

    private notebookEditor(props: SecondaryViewProps): NotebookEditor | undefined {
        return props.model instanceof NotebookEditor ? props.model : undefined;
    }

    private mountList(editor: NotebookEditor): void {
        const list = this.child(new CategoryListView(this.listProps(editor)));
        this.list = list;
        this.root.append(list.root);
        list.mount();
    }

    private retireList(): void {
        const list = this.list;
        this.list = undefined;
        if (list) this.releaseChild(list);
    }

    private subscribeToEditor(editor: NotebookEditor): void {
        this.stateUnsubscribe = this.ownSubscription(editor.state.subscribe(
            () => {
                if (this.editor !== editor) return;
                this.list?.update(this.listProps(editor));
            },
            (state) => ({ tags: state.tags, selectedTag: state.selectedTag, tagsSize: state.tagsSize }),
        ));
    }

    private listProps(editor: NotebookEditor): CategoryListProps {
        const state = editor.state.get();
        return {
            name: "notebook-tags-list",
            items: state.tags,
            value: state.selectedTag,
            onChange: editor.setSelectedTag,
            getCount: editor.getTagSize,
        };
    }

    private ensureHeader(props: SecondaryViewProps): void {
        if (this.header || !this.editor) return;
        this.header = createSideBarPanelHeader({
            headerRef: props.headerRef,
            icon: props.iconElement,
            title: "Tags",
        });
        this.own(() => this.header?.dispose());
    }

    private updateHeader(props: SecondaryViewProps): void {
        this.header?.update({
            headerRef: props.headerRef,
            icon: props.iconElement,
            title: "Tags",
        });
    }
}
