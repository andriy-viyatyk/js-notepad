import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { CheckboxView } from "../../uikit/Checkbox/CheckboxView";
import type { CheckboxProps } from "../../uikit/Checkbox/Checkbox";
import { InputView } from "../../uikit/Input/InputView";
import type { InputProps } from "../../uikit/Input/Input";
import { SelectView } from "../../uikit/Select/SelectView";
import type { SelectViewProps } from "../../uikit/Select/SelectView";
import { TextareaView } from "../../uikit/Textarea/TextareaView";
import type { TextareaProps } from "../../uikit/Textarea/Textarea";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { IListBoxItem } from "../../uikit/ListBox/types";
import { MonacoEditorHostView } from "../shared/MonacoEditorHostView";
import type { McpToolInfo } from "./McpInspectorEditorModel";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../uikit/Checkbox/Checkbox.css";
import "../../uikit/Input/Input.css";
import "../../uikit/Select/Select.css";
import "../../uikit/Textarea/Textarea.css";
import "./mcp-inspector.css";

const CODE_FIELD_PATTERNS = /^(script|code|content|body|query|json|yaml|xml|source|template|expression|command)$/i;

function isCodeLikeField(name: string): boolean {
    return CODE_FIELD_PATTERNS.test(name);
}

interface JsonSchemaProperty {
    type?: string;
    enum?: string[];
    description?: string;
    default?: unknown;
}

function getSchemaType(schema: JsonSchemaProperty | undefined): string {
    if (!schema) return "string";
    if (schema.type) return schema.type;
    if (schema.enum) return "enum";
    return "string";
}

export interface ToolArgFormProps {
    schema: McpToolInfo["inputSchema"];
    args: Record<string, string>;
    onArgChange: (name: string, value: string) => void;
    disabled?: boolean;
}

interface ArgEntry {
    name: string;
    propSchema: JsonSchemaProperty;
    required: boolean;
    value: string;
}

export class ToolArgFormView extends VanillaView<ToolArgFormProps> {
    private list: KeyedList<ArgEntry, string, HTMLElement> | undefined;
    private emptyText: HTMLSpanElement | undefined;
    private fieldHost: HTMLDivElement | undefined;

    public constructor(props: ToolArgFormProps) {
        super(props, createPanelElement({ direction: "column", gap: "lg" }));
        this.root.dataset.type = "mcp-tool-arg-form";
    }

    protected onMount(): void {
        this.fieldHost = document.createElement("div");
        this.fieldHost.style.display = "contents";
        this.root.append(this.fieldHost);
        this.list = new KeyedList(this.fieldHost, {
            keyOf: (entry) => entry.name,
            create: (entry) => {
                const view = new ArgFieldView({
                    ...entry,
                    onChange: this.props.onArgChange,
                    disabled: this.props.disabled,
                });
                view.mount();
                return view.root;
            },
            update: (element, entry) => {
                (element as ArgFieldRoot).view?.update({
                    ...entry,
                    onChange: this.props.onArgChange,
                    disabled: this.props.disabled,
                });
            },
            remove: (element) => {
                (element as ArgFieldRoot).view?.dispose();
            },
        });
        this.own(() => this.list?.dispose());
        this.updateFields(this.props);
    }

    protected onUpdate(props: ToolArgFormProps): void {
        this.updateFields(props);
    }

    private updateFields(props: ToolArgFormProps): void {
        const properties = props.schema.properties || {};
        const requiredFields = new Set(props.schema.required || []);
        const entries: ArgEntry[] = Object.entries(properties).map(([name, schema]) => ({
            name,
            propSchema: schema as JsonSchemaProperty,
            required: requiredFields.has(name),
            value: props.args[name] || "",
        }));

        if (entries.length === 0) {
            this.list?.clear();
            this.emptyText ??= createTextElement("No arguments", { size: "md", color: "light", italic: true });
            if (!this.emptyText.parentNode) this.root.append(this.emptyText);
        } else {
            this.emptyText?.remove();
            this.list?.update(entries);
        }
    }
}

interface ArgFieldProps extends ArgEntry {
    onChange: (name: string, value: string) => void;
    disabled?: boolean;
}

type ArgFieldRoot = HTMLElement & { view?: ArgFieldView };

class ArgFieldView extends VanillaView<ArgFieldProps> {
    private readonly controlSwap: SubtreeSwap<string>;
    private controlView: VanillaView<unknown> | undefined;
    private controlKey = "";
    private controlHost: HTMLDivElement | undefined;
    private descriptionText: HTMLSpanElement | undefined;
    private typeText: HTMLSpanElement | undefined;
    private requiredText: HTMLSpanElement | undefined;
    private editorHost: MonacoEditorHostView | undefined;

    public constructor(props: ArgFieldProps) {
        super(props, createPanelElement({ direction: "column", gap: "xs" }));
        (this.root as ArgFieldRoot).view = this;
        this.controlSwap = new SubtreeSwap(this.root);
    }

    protected onMount(): void {
        const header = createPanelElement({ direction: "row", gap: "md", align: "center" });
        header.append(createTextElement(this.props.name, { size: "base", color: "default" }));
        this.typeText = createTextElement("", { size: "sm", color: "default" });
        this.typeText.dataset.part = "type";
        header.append(this.typeText);
        this.root.append(header);

        this.controlHost = document.createElement("div");
        this.controlHost.style.display = "contents";
        this.root.append(this.controlHost);
        this.own(() => this.controlSwap.dispose());
        this.renderField(this.props);
    }

    protected onUpdate(props: ArgFieldProps): void {
        this.renderField(props);
    }

    protected onDispose(): void {
        delete (this.root as ArgFieldRoot).view;
        this.editorHost = undefined;
    }

    private renderField(props: ArgFieldProps): void {
        const typeText = this.typeText;
        if (!typeText) return;
        const type = getSchemaType(props.propSchema);
        const isBoolean = type === "boolean";
        const isCodeEditor = type === "object" || type === "array" || isCodeLikeField(props.name);
        typeText.textContent = type;
        this.syncRequired(props.required, isBoolean);
        this.syncDescription(props.propSchema.description);

        const nextKey = isBoolean
            ? "boolean"
            : props.propSchema.enum
                ? "enum"
                : type === "number" || type === "integer"
                    ? "number"
                    : isCodeEditor ? "code" : "text";
        if (nextKey !== this.controlKey) {
            this.controlKey = nextKey;
            this.editorHost = undefined;
            const view = this.createControlView(nextKey, props, type);
            this.controlView = view;
            this.controlSwap.set(nextKey, () => view);
            view.mount();
        } else {
            this.controlView?.update(nextKey === "code"
                ? this.codeProps(props, type)
                : this.controlProps(nextKey, props));
        }

        if (nextKey === "code" && this.editorHost?.isReady) {
            this.editorHost.setValue(props.value);
        }
    }

    private createControlView(key: string, props: ArgFieldProps, type: string): VanillaView<unknown> {
        let view: VanillaView<unknown>;
        if (key === "boolean") {
            view = new CheckboxView(this.controlProps(key, props) as CheckboxProps);
        } else if (key === "enum") {
            view = new SelectView<IListBoxItem>(this.controlProps(key, props) as SelectViewProps<IListBoxItem>);
        } else if (key === "number") {
            view = new InputView(this.controlProps(key, props) as InputProps);
        } else if (key === "code") {
            view = new CodeFieldView(this.codeProps(props, type));
        } else {
            view = new TextareaView(this.controlProps(key, props) as TextareaProps);
        }
        return view;
    }

    private controlProps(key: string, props: ArgFieldProps): unknown {
        const onChange = (value: string) => props.onChange(props.name, value);
        const placeholder = props.propSchema.default !== undefined ? String(props.propSchema.default) : "";
        if (key === "boolean") {
            return {
                checked: props.value === "true",
                onChange: (checked: boolean) => props.onChange(props.name, String(checked)),
                disabled: props.disabled,
                children: props.name,
            } satisfies CheckboxProps;
        }
        if (key === "enum") {
            const items = (props.propSchema.enum || []).map((value) => ({ value, label: value }));
            return {
                items,
                value: items.find((item) => item.value === props.value) || null,
                onChange: (item: IListBoxItem) => props.onChange(props.name, String(item.value)),
                placeholder: "— select —",
                disabled: props.disabled,
                size: "sm",
            } satisfies SelectViewProps<IListBoxItem>;
        }
        if (key === "number") {
            return { value: props.value, onChange, placeholder, disabled: props.disabled, size: "sm" } satisfies InputProps;
        }
        return { value: props.value, onChange, placeholder, readOnly: props.disabled, size: "sm" } satisfies TextareaProps;
    }

    private codeProps(props: ArgFieldProps, type: string): CodeFieldProps {
        return {
            value: props.value,
            language: type === "object" || type === "array" ? "json" : "plaintext",
            height: type === "object" || type === "array" ? 120 : 80,
            disabled: props.disabled,
            onChange: this.handleEditorChange,
            onMount: this.handleEditorMount,
        };
    }

    private syncRequired(required: boolean, isBoolean: boolean): void {
        if (isBoolean) {
            this.requiredText?.remove();
            this.requiredText = undefined;
            return;
        }
        if (required) {
            this.requiredText ??= createTextElement("required", { size: "xs", color: "error" });
            const header = this.typeText.parentElement;
            if (header && !this.requiredText.parentNode) header.append(this.requiredText);
        } else {
            this.requiredText?.remove();
        }
    }

    private syncDescription(description: string | undefined): void {
        if (description) {
            this.descriptionText ??= createTextElement("", { size: "md", color: "light" });
            this.descriptionText.textContent = description;
            if (!this.descriptionText.parentNode) this.root.append(this.descriptionText);
        } else {
            this.descriptionText?.remove();
        }
    }

    private readonly handleEditorMount = (host: MonacoEditorHostView): void => {
        this.editorHost = host;
    };

    private readonly handleEditorChange = (value: string): void => {
        this.props.onChange(this.props.name, value);
    };
}

interface CodeFieldProps {
    value: string;
    language: string;
    height: number;
    disabled?: boolean;
    onChange: (value: string) => void;
    onMount: (host: MonacoEditorHostView) => void;
}

class CodeFieldView extends VanillaView<CodeFieldProps> {
    private host: MonacoEditorHostView | undefined;

    public constructor(props: CodeFieldProps) {
        super(props, createPanelElement({ border: true, rounded: "md", overflow: "hidden", height: props.height }));
    }

    protected onMount(): void {
        this.host = this.child(new MonacoEditorHostView({
            initialValue: this.props.value,
            language: this.props.language,
            onMount: this.props.onMount,
            onChange: this.props.onChange,
            options: {
                automaticLayout: true,
                minimap: { enabled: false },
                lineNumbers: "off",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                folding: false,
                renderLineHighlight: "none",
                padding: { top: 4, bottom: 4 },
                readOnly: this.props.disabled,
                domReadOnly: this.props.disabled,
                overviewRulerLanes: 0,
                scrollbar: { alwaysConsumeMouseWheel: false },
            },
        }));
        this.root.append(this.host.root);
        this.host.mount();
    }

    protected onUpdate(props: CodeFieldProps): void {
        this.host?.update({
            initialValue: props.value,
            language: props.language,
            onChange: props.onChange,
            onMount: props.onMount,
            options: {
                automaticLayout: true,
                minimap: { enabled: false },
                lineNumbers: "off",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                folding: false,
                renderLineHighlight: "none",
                padding: { top: 4, bottom: 4 },
                readOnly: props.disabled,
                domReadOnly: props.disabled,
                overviewRulerLanes: 0,
                scrollbar: { alwaysConsumeMouseWheel: false },
            },
        });
        if (this.host?.isReady) this.host.setValue(props.value);
    }
}
