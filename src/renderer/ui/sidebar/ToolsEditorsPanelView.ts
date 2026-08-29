import { pagesModel } from "../../api/pages";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import {
    SegmentedControlView,
    type SegmentedControlProps,
} from "../../uikit/SegmentedControl/SegmentedControlView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { PinnedRailView } from "./PinnedRailView";
import { BuiltinEditorsListView } from "./BuiltinEditorsListView";
import { TrustedBoardsListView } from "./TrustedBoardsListView";
import { TrustedToolsListView } from "./TrustedToolsListView";
import type { HubTab } from "../../editors/tools-hub";
import "./ToolsEditorsPanel.css";

type PanelTab = "editors" | "boards" | "tools";

export interface ToolsEditorsPanelProps {
    onClose?: () => void;
}

function panelTabToHubTab(tab: PanelTab): HubTab {
    return tab === "editors" ? "builtin" : tab === "boards" ? "boards" : "tools";
}

export class ToolsEditorsPanelView extends VanillaView<ToolsEditorsPanelProps> {
    private tab: PanelTab = "editors";
    private readonly onOpenInNewTab = (): void => this.openInNewTab();
    private readonly onTabChange = (value: string): void => {
        const next = value as PanelTab;
        if (next === this.tab) return;
        this.tab = next;
        this.tabsProps.value = this.tab;
        this.tabs.update(this.tabsProps);
        this.mountBody();
    };
    private readonly tabsProps: SegmentedControlProps = {
        name: "tools-editors-tabs",
        size: "sm",
        value: this.tab,
        onChange: this.onTabChange,
        items: [
            { value: "editors", label: "Built-in Editors" },
            { value: "boards", label: "Boards" },
            { value: "tools", label: "Tools" },
        ],
    };
    private readonly header = document.createElement("div");
    private readonly tabsHost = document.createElement("div");
    private readonly body = document.createElement("div");
    private readonly openButton: IconButtonView;
    private readonly pinned: PinnedRailView;
    private readonly tabs: SegmentedControlView;
    private bodyView: VanillaView<{ onClose?: () => void }> | undefined;
    private previousOnClose: (() => void) | undefined;

    public constructor(props: ToolsEditorsPanelProps) {
        super(props);
        this.openButton = new IconButtonView({
            name: "tools-editors-open-in-tab",
            size: "sm",
            icon: "new-window",
            title: "Open in new tab",
            onClick: this.onOpenInNewTab,
        });
        this.pinned = new PinnedRailView({ layout: "horizontal", onClose: props.onClose });
        this.tabs = new SegmentedControlView(this.tabsProps);
        this.previousOnClose = props.onClose;
    }

    protected onMount(): void {
        this.root.dataset.type = "tools-editors-panel";
        this.header.dataset.part = "header";
        this.tabsHost.dataset.part = "tabs";
        this.body.dataset.part = "body";
        this.root.append(this.header, this.pinned.root, this.tabsHost, this.body);

        this.child(this.openButton).mount();
        this.header.append(this.openButton.root);
        this.child(this.pinned).mount();
        this.child(this.tabs).mount();
        this.tabsHost.append(this.tabs.root);
        this.mountBody();
    }

    protected onUpdate(props: ToolsEditorsPanelProps): void {
        if (props.onClose === this.previousOnClose) return;
        this.previousOnClose = props.onClose;
        this.pinned.update({ layout: "horizontal", onClose: props.onClose });
        this.bodyView?.update({ onClose: props.onClose });
    }

    private mountBody(): void {
        this.bodyView?.dispose();
        this.bodyView?.root.remove();
        const view = this.tab === "editors"
            ? new BuiltinEditorsListView({ onClose: this.props.onClose })
            : this.tab === "boards"
                ? new TrustedBoardsListView({ onClose: this.props.onClose })
                : new TrustedToolsListView({ onClose: this.props.onClose });
        this.bodyView = view;
        this.body.append(view.root);
        this.child(view).mount();
    }

    private openInNewTab(): void {
        void pagesModel.showToolsHubPage({ tab: panelTabToHubTab(this.tab) });
        this.props.onClose?.();
    }
}
