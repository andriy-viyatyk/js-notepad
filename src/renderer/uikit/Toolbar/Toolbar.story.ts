import React from "react";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import { SegmentedControl } from "../SegmentedControl/SegmentedControl";
import { Spacer } from "../Spacer/Spacer";
import { Text } from "../Text/Text";
import { createIconElement, type IconRef } from "../shared/slots";
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
    }

    protected onUpdate(props: ToolbarProps): void {
        this.toolbarView?.update(this.toolbarProps(props));
    }

    private toolbarProps(props: ToolbarProps): ToolbarProps {
        return {
            ...props,
            children: this.createChildren(props.background),
        };
    }

    private createChildren(background: ToolbarProps["background"]): React.ReactNode {
        return React.createElement(
            React.Fragment,
            null,
            React.createElement(Text, { size: "sm", color: "light" }, "Demo:"),
            React.createElement(Button, null, "Action"),
            React.createElement(IconButton, { icon: this.saveIcon ?? "save", "aria-label": "Save" }),
            React.createElement(Spacer),
            React.createElement(SegmentedControl, {
                items: [
                    { value: "default", label: "Default" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                ],
                value: this.picked,
                onChange: this.onPicked,
                size: "sm",
                background,
            }),
        );
    }

    private readonly onPicked = (value: string): void => {
        this.picked = value;
        this.toolbarView?.update(this.toolbarProps(this.props));
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
