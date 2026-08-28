import { ButtonView, type ButtonViewProps } from "../Button/ButtonView";
import { IconButtonView, type IconButtonViewProps } from "../IconButton/IconButtonView";
import { SegmentedControlView, type SegmentedControlViewProps } from "../SegmentedControl/SegmentedControlView";
import { SpacerView, type SpacerProps } from "../Spacer/SpacerView";
import { createIconElement, type IconRef } from "../shared/slots";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { ToolbarView } from "./ToolbarView";
import type { ToolbarProps } from "./Toolbar";
import type { Story } from "../../editors/storybook/storyTypes";

function createContentsHost(): HTMLDivElement {
    const element = document.createElement("div");
    element.style.display = "contents";
    return element;
}

class ToolbarDemoView extends VanillaView<ToolbarProps> {
    private toolbarView: ToolbarView | undefined;
    private demoLabel: HTMLSpanElement | undefined;
    private buttonView: ButtonView | undefined;
    private iconButtonView: IconButtonView | undefined;
    private spacerView: SpacerView | undefined;
    private segmentedView: SegmentedControlView | undefined;
    private saveIcon: IconRef | undefined;
    private picked = "default";

    public constructor(props: ToolbarProps) {
        super(props, createContentsHost());
    }

    protected onMount(): void {
        this.saveIcon = createIconElement("save");
        const toolbarView = this.child(new ToolbarView(this.toolbarProps(this.props)));
        this.toolbarView = toolbarView;
        this.root.append(toolbarView.root);
        toolbarView.mount();

        this.demoLabel = createTextElement("Demo:", { size: "sm", color: "light" });
        this.buttonView = this.child(new ButtonView(this.buttonProps()));
        this.iconButtonView = this.child(new IconButtonView(this.iconButtonProps()));
        this.spacerView = this.child(new SpacerView(this.spacerProps()));
        this.segmentedView = this.child(new SegmentedControlView(this.segmentedProps(this.props.background)));
        toolbarView.root.append(
            this.demoLabel,
            this.buttonView.root,
            this.iconButtonView.root,
            this.spacerView.root,
            this.segmentedView.root,
        );
        this.buttonView.mount();
        this.iconButtonView.mount();
        this.spacerView.mount();
        this.segmentedView.mount();
    }

    protected onUpdate(props: ToolbarProps): void {
        this.toolbarView?.update(this.toolbarProps(props));
        this.buttonView?.update(this.buttonProps());
        this.iconButtonView?.update(this.iconButtonProps());
        this.spacerView?.update(this.spacerProps());
        this.segmentedView?.update(this.segmentedProps(props.background));
    }

    private toolbarProps(props: ToolbarProps): ToolbarProps {
        return {
            ...props,
            children: null,
        };
    }

    private buttonProps(): ButtonViewProps {
        return { children: "Action" };
    }

    private iconButtonProps(): IconButtonViewProps {
        return { icon: this.saveIcon ?? "save", "aria-label": "Save" };
    }

    private spacerProps(): SpacerProps {
        return {};
    }

    private segmentedProps(background: ToolbarProps["background"]): SegmentedControlViewProps {
        return {
            items: [
                { value: "default", label: "Default" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
            ],
            value: this.picked,
            onChange: this.onPicked,
            size: "sm",
            background,
        };
    }

    private readonly onPicked = (value: string): void => {
        this.picked = value;
        this.segmentedView?.update(this.segmentedProps(this.props.background));
    };
}

export const toolbarStory: Story<ToolbarProps> = {
    id: "toolbar",
    name: "Toolbar",
    section: "Layout",
    view: ToolbarDemoView,
    props: [
        { name: "orientation",  type: "enum",    options: ["horizontal", "vertical"], default: "horizontal" },
        { name: "background",   type: "enum",    options: ["default", "light", "dark"], default: "dark" },
        { name: "borderTop",    type: "boolean", default: false },
        { name: "borderBottom", type: "boolean", default: false },
        { name: "disabled",     type: "boolean", default: false },
    ],
};
