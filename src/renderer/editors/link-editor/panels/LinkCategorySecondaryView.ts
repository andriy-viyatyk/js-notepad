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
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            title: "Collections",
        });

        if (editor.page?.state) {
            this.bind(editor.page.state, () => editor.isMain, () => this.updateHeader());
        }
        if (editor.host) {
            this.bind(editor.host.state, (state) => state.modified, () => this.updateHeader());
        }
        this.own(() => this.saveButton?.dispose());
        this.own(() => this.header?.dispose());
        this.updateHeader();
    }

    protected onUpdate(props: SecondaryViewProps): void {
        if (props.model instanceof LinkEditor) {
            this.editor = props.model;
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
            headerRef: this.props.headerRef,
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
