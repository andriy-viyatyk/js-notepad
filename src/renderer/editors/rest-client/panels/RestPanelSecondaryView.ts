import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../../ui/secondary-views/SideBarPanelHeaderView";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import "../../../uikit/Panel/Panel.css";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { buildGroupedTree, type RequestTreeItem } from "../RestClientShared";
import { RestClientEditor } from "../RestClientEditor";
import { RestRequestTreeView } from "./RestRequestTreeView";

interface RestRequestItems {
    source: RestClientEditor["state"]["get"] extends () => infer State
        ? State extends { data: { requests: infer Requests } } ? Requests : never
        : never;
    items: RequestTreeItem[];
}

export default class RestPanelSecondaryView extends VanillaView<SecondaryViewProps> {
    private editor: RestClientEditor | undefined;
    private tree: RestRequestTreeView | undefined;
    private header: SideBarPanelHeaderHandle | undefined;
    private requestItems: RestRequestItems | undefined;

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "rest-secondary-view",
            direction: "column",
            flex: true,
            minHeight: 0,
            overflow: "hidden",
        }));
    }

    protected onMount(): void {
        const editor = this.getEditor(this.props);
        if (!editor) return;

        this.editor = editor;
        const body = createPanelElement({
            name: "rest-panel-pane",
            direction: "column",
            flex: true,
            overflow: "auto",
            minHeight: 0,
            minWidth: 0,
        });
        this.tree = this.child(new RestRequestTreeView({
            vm: editor,
            items: this.itemsFor(editor),
            selectedId: editor.state.get().selectedRequestId,
        }));
        body.append(this.tree.root);
        this.root.append(body);
        this.tree.mount();

        this.header = createSideBarPanelHeader({
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            title: "Rest",
        });
        this.bind(
            editor.state,
            (state) => ({
                requests: state.data.requests,
                selectedRequestId: state.selectedRequestId,
            }),
            (state) => {
                this.tree?.update({
                    vm: editor,
                    items: this.itemsFor(editor, state.requests),
                    selectedId: state.selectedRequestId,
                });
            },
        );
        this.own(() => this.header?.dispose());
        this.updateHeader(this.props);
    }

    protected onUpdate(props: SecondaryViewProps): void {
        const editor = this.getEditor(props);
        if (editor && editor === this.editor) {
            this.tree?.update({
                vm: editor,
                items: this.itemsFor(editor),
                selectedId: editor.state.get().selectedRequestId,
            });
        }
        this.updateHeader(props);
    }

    protected onDispose(): void {
        this.tree = undefined;
        this.header = undefined;
        this.editor = undefined;
        this.requestItems = undefined;
    }

    private getEditor(props: SecondaryViewProps): RestClientEditor | undefined {
        return props.model instanceof RestClientEditor ? props.model : undefined;
    }

    private itemsFor(
        editor: RestClientEditor,
        requests = editor.state.get().data.requests,
    ): RequestTreeItem[] {
        if (this.requestItems?.source === requests) return this.requestItems.items;
        const rootItem: RequestTreeItem = {
            id: "__root__",
            isRoot: true,
            items: buildGroupedTree(requests),
        };
        this.requestItems = { source: requests, items: [rootItem] };
        return this.requestItems.items;
    }

    private updateHeader(props: SecondaryViewProps): void {
        this.header?.update({
            headerRef: props.headerRef,
            icon: props.iconElement,
            title: "Rest",
        });
    }
}
