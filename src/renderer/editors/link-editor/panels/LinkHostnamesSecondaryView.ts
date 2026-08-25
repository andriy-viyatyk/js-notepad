import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../../ui/secondary-views/SideBarPanelHeaderView";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import "../../../uikit/Panel/Panel.css";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { LinkEditor } from "../LinkEditor";
import LinkHostnamesNavigationPanelView from "./LinkHostnamesNavigationPanel";

export default class LinkHostnamesSecondaryView extends VanillaView<SecondaryViewProps> {
    private navigation: LinkHostnamesNavigationPanelView | undefined;
    private header: SideBarPanelHeaderHandle | undefined;

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "link-hostnames-secondary-view",
            direction: "column",
            flex: true,
            minHeight: 0,
            overflow: "hidden",
        }));
    }

    protected onMount(): void {
        if (!(this.props.model instanceof LinkEditor)) return;
        this.navigation = this.child(new LinkHostnamesNavigationPanelView(this.props.model));
        this.root.append(this.navigation.root);
        this.navigation.mount();
        this.header = createSideBarPanelHeader({
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            title: "Hostnames",
        });
        this.own(() => this.header?.dispose());
        this.updateHeader();
    }

    protected onUpdate(props: SecondaryViewProps): void {
        if (props.model instanceof LinkEditor) this.navigation?.update(props.model);
        this.updateHeader();
    }

    protected onDispose(): void {
        this.navigation = undefined;
        this.header = undefined;
    }

    private updateHeader(): void {
        this.header?.update({
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            title: "Hostnames",
        });
    }
}
