import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { createIconElement, type IconRef } from "../shared/slots";
import { VanillaView } from "../shared/vanilla-view";
import { IconButtonView } from "./IconButtonView";
import type { IconButtonViewProps } from "./IconButtonView";
import type { Story } from "../../editors/storybook/storyTypes";

type IconButtonDemoViewProps = Omit<IconButtonViewProps, "icon"> & {
    icon?: IconRef | null;
};

function createContentsHost(): HTMLDivElement {
    const element = document.createElement("div");
    element.style.display = "contents";
    return element;
}

class IconButtonDemoView extends VanillaView<IconButtonDemoViewProps> {
    private iconButtonView: IconButtonView | undefined;
    private currentHideUntilParentHover = false;

    public constructor(props: IconButtonDemoViewProps) {
        super(props, createContentsHost());
    }

    protected onMount(): void {
        this.rebuild(this.props);
    }

    protected onUpdate(props: IconButtonDemoViewProps): void {
        const hideUntilParentHover = Boolean(props.hideUntilParentHover);
        if (hideUntilParentHover !== this.currentHideUntilParentHover) {
            this.rebuild(props);
            return;
        }
        this.iconButtonView?.update(this.iconButtonProps(props));
    }

    private rebuild(props: IconButtonDemoViewProps): void {
        if (this.iconButtonView) {
            this.releaseChild(this.iconButtonView);
            this.iconButtonView = undefined;
        }
        this.root.replaceChildren();

        const iconButtonView = this.child(new IconButtonView(this.iconButtonProps(props)));
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
                iconButtonView.root,
            ]);
            this.root.append(panel);
        } else {
            this.root.append(iconButtonView.root);
        }
        iconButtonView.mount();
        this.iconButtonView = iconButtonView;
        this.currentHideUntilParentHover = Boolean(props.hideUntilParentHover);
    }

    private iconButtonProps(props: IconButtonDemoViewProps): IconButtonViewProps {
        const { icon, title, ...rest } = props;
        return {
            ...rest,
            title: title || undefined,
            icon: icon ?? createIconElement("settings"),
        };
    }
}

export const iconButtonStory: Story<IconButtonDemoViewProps> = {
    id: "icon-button",
    name: "IconButton",
    section: "Bootstrap",
    view: IconButtonDemoView,
    props: [
        { name: "icon", type: "icon", default: "folder", label: "Icon" },
        { name: "size", type: "enum", options: ["sm", "md"], default: "md" },
        { name: "variant", type: "enum", options: ["default", "chip"], default: "default" },
        { name: "title", type: "string", default: "" },
        { name: "active", type: "boolean", default: false },
        { name: "warning", type: "boolean", default: false },
        { name: "disabled", type: "boolean", default: false },
        { name: "strikethrough", type: "boolean", default: false, label: "Strikethrough (diagonal line over icon)" },
        { name: "hideUntilParentHover", type: "boolean", default: false, label: "Hide until parent hover (wraps in a hover-reveal Panel)" },
    ],
};
