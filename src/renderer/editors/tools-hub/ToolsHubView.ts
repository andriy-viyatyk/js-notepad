import type { EditorModel } from "../base/EditorModel";
import { ToolsHubEditor, type HubTab } from "./ToolsHubEditor";
import { SearchBoardsTabView } from "./SearchBoardsTab";
import { BuiltinEditorsListView } from "../../ui/sidebar/BuiltinEditorsListView";
import { PinnedRailView } from "../../ui/sidebar/PinnedRailView";
import { TrustedBoardsListView } from "../../ui/sidebar/TrustedBoardsListView";
import { TrustedToolsListView } from "../../ui/sidebar/TrustedToolsListView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { SegmentedControlView } from "../../uikit/SegmentedControl/SegmentedControlView";
import { VanillaView, type IOwnedView } from "../../uikit/shared/vanilla-view";
import "../../uikit/Button/Button.css";
import "../../uikit/Panel/Panel.css";
import "../../uikit/SegmentedControl/SegmentedControl.css";
import "../../uikit/Text/Text.css";
import "../../uikit/Tag/Tag.css";

function requireToolsHubModel(model: EditorModel): ToolsHubEditor {
    if (!(model instanceof ToolsHubEditor)) {
        throw new Error("Tools hub view received an invalid model.");
    }
    return model;
}

export class ToolsHubEditorView extends VanillaView<{ model: EditorModel }> {
    private model: ToolsHubEditor;
    private tabs: SegmentedControlView | undefined;
    private body: HTMLDivElement | undefined;
    private activeBody: IOwnedView | undefined;
    private activeTab: HubTab | undefined;
    private modelSubscription: (() => void) | undefined;

    public constructor(props: { model: EditorModel }) {
        const root = createPanelElement({
            name: "tools-hub",
            direction: "row",
            width: "100%",
            height: "100%",
            minHeight: 0,
        });
        root.dataset.type = "tools-hub";
        super(props, root);
        this.model = requireToolsHubModel(props.model);
    }

    protected onMount(): void {
        const main = createPanelElement({ direction: "column", flex: 1, minWidth: 0, minHeight: 0 });
        const tabsHost = createPanelElement({ direction: "row", paddingX: "lg", paddingY: "md", shrink: false });
        this.body = createPanelElement({ direction: "column", flex: 1, minHeight: 0 });
        this.tabs = this.child(new SegmentedControlView(this.tabProps()));
        tabsHost.append(this.tabs.root);
        main.append(tabsHost, this.body);

        const pinned = this.child(new PinnedRailView({ layout: "vertical" }));
        this.root.append(main, pinned.root);
        this.tabs.mount();
        pinned.mount();

        this.mountBody(this.model.state.get().tab);
        this.modelSubscription = this.model.state.subscribe<HubTab>(
            (tab) => this.applyTab(tab),
            (state) => state.tab,
        );
        this.own(() => {
            this.modelSubscription?.();
            this.modelSubscription = undefined;
        });
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireToolsHubModel(props.model);
        if (model !== this.model) {
            this.modelSubscription?.();
            this.model = model;
            this.modelSubscription = this.model.state.subscribe<HubTab>(
                (tab) => this.applyTab(tab),
                (state) => state.tab,
            );
        } else {
            this.model = model;
        }
        this.applyTab(this.model.state.get().tab);
    }

    protected onDispose(): void {
        this.activeBody = undefined;
        this.activeTab = undefined;
        this.body?.replaceChildren();
    }

    private tabProps() {
        return {
            name: "tools-hub-tabs",
            value: this.model.state.get().tab,
            onChange: (value: string) => this.model.setTab(value as HubTab),
            items: [
                { value: "builtin", label: "Built-in" },
                { value: "boards", label: "Registered boards" },
                { value: "search", label: "Search boards" },
                { value: "tools", label: "Tools" },
            ],
        };
    }

    private applyTab(tab: HubTab): void {
        this.tabs?.update({ ...this.tabProps(), value: tab });
        if (tab === this.activeTab) return;
        this.mountBody(tab);
    }

    private mountBody(tab: HubTab): void {
        if (this.activeBody) this.releaseChild(this.activeBody);
        const view = tab === "builtin"
            ? new BuiltinEditorsListView({})
            : tab === "boards"
                ? new TrustedBoardsListView({})
                : tab === "search"
                    ? new SearchBoardsTabView({})
                    : new TrustedToolsListView({});
        this.activeBody = this.child(view);
        this.body?.append(view.root);
        view.mount();
        this.activeTab = tab;
    }
}
