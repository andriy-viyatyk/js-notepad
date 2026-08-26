import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { TagView } from "./TagView";
import type { TagProps } from "./Tag";
import color from "../../theme/color";
import type { Story } from "../../editors/storybook/storyTypes";

interface TagDemoViewProps {
    label?: string;
    variant?: "filled" | "outlined";
    size?: "sm" | "md";
    selected?: boolean;
    disabled?: boolean;
    removable?: boolean;
    clickable?: boolean;
    removeAffordance?: "always" | "hover";
    withIcon?: boolean;
}

function createTagIcon(): HTMLSpanElement {
    const element = document.createElement("span");
    element.style.width = "8px";
    element.style.height = "8px";
    element.style.borderRadius = "50%";
    element.style.backgroundColor = color.misc.blue;
    element.style.display = "inline-block";
    return element;
}

class TagDemoView extends VanillaView<TagDemoViewProps> {
    private firstTag: TagView | undefined;
    private secondTag: TagView | undefined;
    private thirdTag: TagView | undefined;
    private lastAction = "(none)";
    private actionText: HTMLSpanElement | undefined;

    public constructor(props: TagDemoViewProps) {
        super(props, createPanelElement({ direction: "column", gap: "md", width: 360 }));
    }

    protected onMount(): void {
        const firstTag = this.child(new TagView(this.tagProps("react", true, this.props)));
        const secondTag = this.child(new TagView(this.tagProps("typescript", false, this.props)));
        const thirdTag = this.child(new TagView(this.tagProps("hobby:photography", false, this.props)));
        this.firstTag = firstTag;
        this.secondTag = secondTag;
        this.thirdTag = thirdTag;
        this.actionText = createTextElement(`last action: ${this.lastAction}`, { size: "xs", color: "light" });
        const tags = createPanelElement({ direction: "row", wrap: true, gap: "sm", align: "center" }, [
            firstTag.root, secondTag.root, thirdTag.root,
        ]);
        this.root.append(tags, this.actionText);
        firstTag.mount();
        secondTag.mount();
        thirdTag.mount();
    }

    protected onUpdate(props: TagDemoViewProps): void {
        this.firstTag?.update(this.tagProps("react", true, props));
        this.secondTag?.update(this.tagProps("typescript", false, props));
        this.thirdTag?.update(this.tagProps("hobby:photography", false, props));
    }

    protected onDispose(): void {
        this.firstTag = undefined;
        this.secondTag = undefined;
        this.thirdTag = undefined;
        this.actionText = undefined;
    }

    private tagProps(label: string, selected: boolean, props: TagDemoViewProps): TagProps {
        return {
            label: selected ? (props.label ?? "react") : label,
            icon: props.withIcon ? createTagIcon() : undefined,
            variant: props.variant,
            size: props.size,
            selected: selected ? props.selected : undefined,
            disabled: props.disabled,
            removeAffordance: props.removeAffordance,
            onClick: props.clickable ? () => this.setAction(`clicked: ${selected ? (props.label ?? "react") : label}`) : undefined,
            onRemove: props.removable ? () => this.setAction(`removed: ${selected ? (props.label ?? "react") : label}`) : undefined,
        };
    }

    private readonly setAction = (action: string): void => {
        this.lastAction = action;
        if (this.actionText) this.actionText.textContent = `last action: ${action}`;
    };
}

export const tagStory: Story<TagDemoViewProps> = {
    id: "tag",
    name: "Tag",
    section: "Bootstrap",
    view: TagDemoView,
    props: [
        { name: "label",            type: "string",  default: "react" },
        { name: "variant",          type: "enum",    options: ["filled", "outlined"], default: "filled" },
        { name: "size",             type: "enum",    options: ["sm", "md"], default: "md" },
        { name: "selected",         type: "boolean", default: false },
        { name: "disabled",         type: "boolean", default: false },
        { name: "removable",        type: "boolean", default: true },
        { name: "clickable",        type: "boolean", default: false },
        { name: "removeAffordance", type: "enum",    options: ["always", "hover"], default: "always", label: "Remove affordance" },
        { name: "withIcon",         type: "boolean", default: false, label: "With icon (dot)" },
    ],
};
