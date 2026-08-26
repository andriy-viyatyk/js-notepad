import { createPanelElement } from "../Panel/panel-style";
import { VanillaView } from "../shared/vanilla-view";
import type { SelectableRowProps } from "./SelectableRow";
import { SelectableRowView } from "./SelectableRowView";
import type { Story } from "../../editors/storybook/storyTypes";

interface SelectableRowDemoViewProps {
    selected?: boolean;
    active?: boolean;
    children?: SelectableRowProps["children"];
}

class SelectableRowDemoView extends VanillaView<SelectableRowDemoViewProps> {
    private rowView: SelectableRowView | undefined;

    public constructor(props: SelectableRowDemoViewProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.root.dataset.focusSelection = "true";
        this.root.tabIndex = 0;
        this.root.style.width = "280px";
        const rowView = this.child(new SelectableRowView({
            selected: this.props.selected,
            active: this.props.active,
            children: this.props.children,
        }));
        this.rowView = rowView;
        this.root.append(rowView.root);
        rowView.mount();
    }

    protected onUpdate(props: SelectableRowDemoViewProps): void {
        this.rowView?.update({
            selected: props.selected,
            active: props.active,
            children: props.children,
        });
    }
}

let selectableRowPreviewChild: HTMLDivElement | undefined;

function createPreviewChild(): Node {
    if (!selectableRowPreviewChild) {
        selectableRowPreviewChild = createPanelElement(
            { padding: "md", width: "100%" },
            [document.createTextNode("Selectable row")],
        );
    }
    return selectableRowPreviewChild;
}

export const selectableRowStory: Story<SelectableRowDemoViewProps> = {
    id: "selectable-row",
    name: "SelectableRow",
    section: "Lists",
    view: SelectableRowDemoView,
    previewChildren: createPreviewChild,
    props: [
        { name: "selected", type: "boolean", default: false },
        { name: "active", type: "boolean", default: false },
    ],
};
