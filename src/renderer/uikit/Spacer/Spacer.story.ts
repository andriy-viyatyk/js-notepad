import { createPanelElement } from "../Panel/panel-style";
import { VanillaView } from "../shared/vanilla-view";
import { SpacerView } from "./SpacerView";
import type { SpacerProps } from "./Spacer";
import type { Story } from "../../editors/storybook/storyTypes";

interface SpacerDemoViewProps {
    size?: SpacerProps["size"];
}

function createText(text: string): HTMLSpanElement {
    const element = document.createElement("span");
    element.textContent = text;
    return element;
}

class SpacerDemoView extends VanillaView<SpacerDemoViewProps> {
    private spacerView: SpacerView | undefined;

    public constructor(props: SpacerDemoViewProps) {
        super(
            props,
            createPanelElement({
                direction: "row",
                gap: "sm",
                align: "center",
                width: 240,
                padding: "md",
                border: true,
            }),
        );
    }

    protected onMount(): void {
        const spacerView = this.child(new SpacerView({ size: this.props.size || undefined }));
        this.spacerView = spacerView;
        this.root.append(createText("Left"), spacerView.root, createText("Right"));
        spacerView.mount();
    }

    protected onUpdate(props: SpacerDemoViewProps): void {
        this.spacerView?.update({ size: props.size || undefined });
    }
}

export const spacerStory: Story<SpacerDemoViewProps> = {
    id: "spacer",
    name: "Spacer",
    section: "Layout",
    view: SpacerDemoView,
    props: [
        { name: "size", type: "number", default: 0, min: 0, max: 120, step: 8, label: "size (0 = flex grow)" },
    ],
};
