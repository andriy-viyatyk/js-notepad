import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { ButtonView } from "./ButtonView";
import type { ButtonViewProps } from "./ButtonView";
import { VanillaView } from "../shared/vanilla-view";
import type { IconRef } from "../shared/slots";
import type { Story } from "../../editors/storybook/storyTypes";

type ButtonDemoViewProps = Omit<ButtonViewProps, "icon"> & {
    icon?: IconRef | null;
};

function createContentsHost(): HTMLDivElement {
    const element = document.createElement("div");
    element.style.display = "contents";
    return element;
}

class ButtonDemoView extends VanillaView<ButtonDemoViewProps> {
    private buttonView: ButtonView | undefined;
    private currentHideUntilParentHover = false;

    public constructor(props: ButtonDemoViewProps) {
        super(props, createContentsHost());
    }

    protected onMount(): void {
        this.rebuild(this.props);
    }

    protected onUpdate(props: ButtonDemoViewProps): void {
        const hideUntilParentHover = Boolean(props.hideUntilParentHover);
        if (hideUntilParentHover !== this.currentHideUntilParentHover) {
            this.rebuild(props);
            return;
        }
        this.buttonView?.update(this.buttonProps(props));
    }

    private rebuild(props: ButtonDemoViewProps): void {
        if (this.buttonView) {
            this.releaseChild(this.buttonView);
            this.buttonView = undefined;
        }
        this.root.replaceChildren();

        const buttonView = this.child(new ButtonView(this.buttonProps(props)));
        if (props.hideUntilParentHover) {
            const panel = createPanelElement({
                direction: "row",
                align: "center",
                gap: "md",
                padding: "md",
                border: true,
                rounded: "md",
                revealChildrenOnHover: true,
            }, [
                createTextElement("Hover this row →", { color: "light" }),
                buttonView.root,
            ]);
            this.root.append(panel);
        } else {
            this.root.append(buttonView.root);
        }
        buttonView.mount();
        this.buttonView = buttonView;
        this.currentHideUntilParentHover = Boolean(props.hideUntilParentHover);
    }

    private buttonProps(props: ButtonDemoViewProps): ButtonViewProps {
        const { icon, title, ...rest } = props;
        return {
            ...rest,
            title: title || undefined,
            icon: icon ?? undefined,
        };
    }
}

export const buttonStory: Story<ButtonDemoViewProps> = {
    id: "button",
    name: "Button",
    section: "Bootstrap",
    view: ButtonDemoView,
    props: [
        { name: "children", type: "string", default: "Click me" },
        { name: "variant", type: "enum", options: ["default", "primary", "ghost", "danger", "link"], default: "default" },
        { name: "size", type: "enum", options: ["sm", "md"], default: "md" },
        { name: "background", type: "enum", options: ["default", "light", "dark"], default: "default" },
        { name: "icon", type: "icon", default: "none", label: "Icon" },
        { name: "title", type: "string", default: "" },
        { name: "disabled", type: "boolean", default: false },
        { name: "hideUntilParentHover", type: "boolean", default: false, label: "Hide until parent hover (wraps in a hover-reveal Panel)" },
    ],
};
