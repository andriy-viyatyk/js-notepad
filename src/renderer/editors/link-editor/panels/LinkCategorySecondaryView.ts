import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../../ui/secondary-views/SideBarPanelHeaderView";
import { IconButtonView } from "../../../uikit/IconButton/IconButtonView";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import "../../../uikit/Panel/Panel.css";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { LinkEditor } from "../LinkEditor";
import { LinkCategoryPanelView } from "./LinkCategoryPanel";

export default class LinkCategorySecondaryView extends VanillaView<SecondaryViewProps> {
    private editor: LinkEditor | undefined;
    private categoryPanel: LinkCategoryPanelView | undefined;
    private saveButton: IconButtonView | undefined;
    private header: SideBarPanelHeaderHandle | undefined;
    private pageBinding: (() => void) | undefined;
    private hostBinding: (() => void) | undefined;
    private boundPageState: NonNullable<LinkEditor["page"]>["state"] | undefined;
    private boundHostState: NonNullable<LinkEditor["host"]>["state"] | undefined;

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "link-category-secondary-view",
            direction: "column",
            flex: true,
            minHeight: 0,
            overflow: "hidden",
        }));
    }

    protected onMount(): void {
        const editor = this.props.model instanceof LinkEditor ? this.props.model : undefined;
        if (!editor) return;

        this.editor = editor;
        this.saveButton = new IconButtonView({
            name: "link-category-secondary-save",
            size: "sm",
            title: "Save",
            icon: "save",
            onClick: (event) => {
                event.stopPropagation();
                this.editor?.host?.saveFile();
            },
        });
        this.saveButton.mount();

        this.categoryPanel = this.child(new LinkCategoryPanelView({ vm: editor }));
        this.root.append(this.categoryPanel.root);
        this.categoryPanel.mount();

        this.header = createSideBarPanelHeader({
            headerHost: this.props.headerHost,
            icon: this.props.iconElement,
            title: "Collections",
        });

        this.syncHeaderBindings(editor, true);
        this.own(() => this.saveButton?.dispose());
        this.own(() => this.header?.dispose());
        this.updateHeader();
    }

    protected onUpdate(props: SecondaryViewProps): void {
        if (props.model instanceof LinkEditor) {
            const editorChanged = props.model !== this.editor;
            this.editor = props.model;
            this.syncHeaderBindings(props.model, editorChanged);
            this.categoryPanel?.update({ vm: props.model });
        }
        this.updateHeader();
    }

    protected onDispose(): void {
        this.categoryPanel = undefined;
        this.saveButton = undefined;
        this.header = undefined;
        this.editor = undefined;
    }

    private syncHeaderBindings(editor: LinkEditor, force: boolean): void {
        const pageState = editor.page?.state;
        if (force || pageState !== this.boundPageState) {
            this.pageBinding?.();
            this.pageBinding = undefined;
            this.boundPageState = pageState;
            if (pageState) {
                this.pageBinding = this.bind(pageState, () => editor.isMain, () => {
                    if (this.editor === editor) this.updateHeader();
                });
            }
        }

        const hostState = editor.host?.state;
        if (force || hostState !== this.boundHostState) {
            this.hostBinding?.();
            this.hostBinding = undefined;
            this.boundHostState = hostState;
            if (hostState) {
                this.hostBinding = this.bind(hostState, (state) => state.modified, () => {
                    if (this.editor === editor) this.updateHeader();
                });
            }
        }
    }

    private readonly showMain = (): void => {
        const editor = this.editor;
        if (editor && !editor.isMain) editor.page?.promoteSecondaryToMain?.(editor);
    };

    private updateHeader(): void {
        const editor = this.editor;
        const header = this.header;
        const saveButton = this.saveButton;
        if (!editor || !header || !saveButton) return;

        header.update({
            headerHost: this.props.headerHost,
            icon: this.props.iconElement,
            title: "Collections",
            actions: this.props.expanded === false || !editor.host?.state.get().modified
                ? undefined
                : saveButton.root,
            showMainTitle: "Show links",
            showMainActive: editor.isMain,
            onShowMain: this.props.expanded === false ? undefined : this.showMain,
        });
    }
}
