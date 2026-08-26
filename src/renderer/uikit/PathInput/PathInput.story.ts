import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { PathInputView, type PathInputViewProps } from "./PathInputView";
import type { Story } from "../../editors/storybook/storyTypes";

const PATH_SETS: Record<string, string[]> = {
    deep: [
        "work",
        "work/projects",
        "work/projects/persephone",
        "work/projects/storybook",
        "work/notes",
        "work/notes/2026",
        "personal",
        "personal/journal",
        "personal/recipes",
    ],
    flat: ["alpha", "beta", "gamma", "delta", "epsilon"],
    tags: [
        "hobby:photography",
        "hobby:music",
        "work:project1",
        "work:project2",
        "react",
        "typescript",
    ],
};

interface PathInputDemoProps {
    pathSet?: string;
    separator?: string;
    maxDepth?: number;
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    size?: "sm" | "md";
    autoFocus?: boolean;
}

class PathInputDemoView extends VanillaView<PathInputDemoProps> {
    private value = "";
    private lastCommit = "(none)";
    private pathInputView: PathInputView | undefined;
    private valueElement: HTMLSpanElement | undefined;
    private commitElement: HTMLSpanElement | undefined;

    public constructor(props: PathInputDemoProps) {
        super(props, createPanelElement({ direction: "column", gap: "md", width: 360 }));
    }

    protected onMount(): void {
        const pathInput = this.child(new PathInputView(this.childProps(this.props)));
        const valueElement = createTextElement("", { size: "xs", color: "light" });
        const commitElement = createTextElement("", { size: "xs", color: "light" });
        this.pathInputView = pathInput;
        this.valueElement = valueElement;
        this.commitElement = commitElement;
        this.root.append(pathInput.root, valueElement, commitElement);
        pathInput.mount();
        this.updateLabels();
    }

    protected onUpdate(props: PathInputDemoProps): void {
        this.pathInputView?.update(this.childProps(props));
        this.updateLabels();
    }

    private readonly onChange = (value: string): void => {
        this.value = value;
        this.pathInputView?.update(this.childProps(this.props));
        this.updateLabels();
    };

    private readonly onBlur = (value: string | undefined): void => {
        this.lastCommit = value === undefined ? "undefined" : JSON.stringify(value);
        this.updateLabels();
    };

    private childProps(props: PathInputDemoProps): PathInputViewProps {
        return {
            value: this.value,
            onChange: this.onChange,
            onBlur: this.onBlur,
            paths: PATH_SETS[props.pathSet ?? "deep"] ?? PATH_SETS.deep,
            separator: props.separator ?? "/",
            maxDepth: props.maxDepth || undefined,
            placeholder: props.placeholder ?? "Enter path...",
            disabled: props.disabled ?? false,
            readOnly: props.readOnly ?? false,
            size: props.size ?? "md",
            autoFocus: props.autoFocus ?? false,
            "aria-label": "Demo path input",
        };
    }

    private updateLabels(): void {
        if (this.valueElement) this.valueElement.textContent = `value: ${JSON.stringify(this.value)}`;
        if (this.commitElement) this.commitElement.textContent = `last commit (onBlur): ${this.lastCommit}`;
    }

    protected onDispose(): void {
        this.pathInputView = undefined;
        this.valueElement = undefined;
        this.commitElement = undefined;
    }
}

export const pathInputStory: Story<PathInputDemoProps> = {
    id: "path-input",
    name: "PathInput",
    section: "Bootstrap",
    view: PathInputDemoView,
    props: [
        {
            name: "pathSet",
            type: "enum",
            options: ["deep", "flat", "tags"],
            default: "deep",
            label: "Path set",
        },
        { name: "separator",   type: "enum",    options: ["/", ":", "."], default: "/" },
        {
            name: "maxDepth",
            type: "number",
            default: 0,
            min: 0,
            max: 5,
            step: 1,
            label: "Max depth (0 = unlimited)",
        },
        { name: "placeholder", type: "string",  default: "Enter path..." },
        { name: "disabled",    type: "boolean", default: false },
        { name: "readOnly",    type: "boolean", default: false },
        { name: "size",        type: "enum",    options: ["sm", "md"], default: "md" },
        { name: "autoFocus",   type: "boolean", default: false },
    ],
};
