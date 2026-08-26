import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { TagsInputView } from "./TagsInputView";
import type { TagsInputProps } from "./TagsInput";
import type { Story } from "../../editors/storybook/storyTypes";

const TAG_SETS: Record<string, string[]> = {
    flat: ["react", "typescript", "node", "rust", "go"],
    namespaced: [
        "hobby:photography",
        "hobby:music",
        "work:project1",
        "work:project2",
        "home:cooking",
        "home:diy",
    ],
};

interface TagsInputDemoViewProps {
    items?: string;
    separator?: string;
    maxDepth?: number;
    placeholder?: string;
    tagVariant?: "filled" | "outlined";
    size?: "sm" | "md";
    disabled?: boolean;
    readOnly?: boolean;
}

class TagsInputDemoView extends VanillaView<TagsInputDemoViewProps> {
    private tags: string[] = ["work:project1", "react"];
    private tagsInputView: TagsInputView | undefined;
    private valueText: HTMLSpanElement | undefined;

    public constructor(props: TagsInputDemoViewProps) {
        super(props, createPanelElement({ direction: "column", gap: "md", width: 420 }));
    }

    protected onMount(): void {
        const tagsInputView = this.child(new TagsInputView(this.childProps(this.props)));
        this.tagsInputView = tagsInputView;
        this.valueText = createTextElement(`value: ${JSON.stringify(this.tags)}`, { size: "xs", color: "light" });
        this.root.append(tagsInputView.root, this.valueText);
        tagsInputView.mount();
    }

    protected onUpdate(props: TagsInputDemoViewProps): void {
        this.valueText && (this.valueText.textContent = `value: ${JSON.stringify(this.tags)}`);
        this.tagsInputView?.update(this.childProps(props));
    }

    protected onDispose(): void {
        this.tagsInputView = undefined;
        this.valueText = undefined;
    }

    private childProps(props: TagsInputDemoViewProps): TagsInputProps {
        return {
            value: this.tags,
            onChange: this.setTags,
            items: TAG_SETS[props.items ?? "namespaced"] ?? TAG_SETS.namespaced,
            separator: props.separator,
            maxDepth: props.maxDepth || undefined,
            placeholder: props.placeholder,
            tagVariant: props.tagVariant,
            size: props.size,
            disabled: props.disabled,
            readOnly: props.readOnly,
            "aria-label": "Demo tags",
        };
    }

    private readonly setTags = (tags: string[]): void => {
        this.tags = tags;
        this.valueText && (this.valueText.textContent = `value: ${JSON.stringify(tags)}`);
        this.tagsInputView?.update(this.childProps(this.props));
    };
}

export const tagsInputStory: Story<TagsInputDemoViewProps> = {
    id: "tags-input",
    name: "TagsInput",
    section: "Bootstrap",
    view: TagsInputDemoView,
    props: [
        { name: "items",       type: "enum",    options: ["flat", "namespaced"], default: "namespaced", label: "Items set" },
        { name: "separator",   type: "enum",    options: [":", "/", "."], default: ":" },
        {
            name: "maxDepth",
            type: "number",
            default: 1,
            min: 0,
            max: 5,
            step: 1,
            label: "Max depth (0 = unlimited)",
        },
        { name: "placeholder", type: "string",  default: "Type + Enter to add" },
        { name: "tagVariant",  type: "enum",    options: ["filled", "outlined"], default: "filled", label: "Tag variant" },
        { name: "size",        type: "enum",    options: ["sm", "md"], default: "md" },
        { name: "disabled",    type: "boolean", default: false },
        { name: "readOnly",    type: "boolean", default: false },
    ],
};
