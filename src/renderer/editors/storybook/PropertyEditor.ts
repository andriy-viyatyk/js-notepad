import { createPanelElement } from "../../uikit/Panel/panel-style";
import { ButtonView, type ButtonViewProps } from "../../uikit/Button/ButtonView";
import { CheckboxView } from "../../uikit/Checkbox/CheckboxView";
import type { CheckboxProps } from "../../uikit/Checkbox/Checkbox";
import { InputView } from "../../uikit/Input/InputView";
import type { InputProps } from "../../uikit/Input/Input";
import { LabelView } from "../../uikit/Label/LabelView";
import type { LabelProps } from "../../uikit/Label/Label";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { ICON_PRESETS } from "./iconPresets";
import { PropDef, STORYBOOK_MANAGED_PROPS } from "./storyTypes";
import { StorybookEditorModel } from "./StorybookEditorModel";
import { findStory } from "./storyRegistry";
import "../../uikit/Button/Button.css";
import "../../uikit/Checkbox/Checkbox.css";

interface PropertyRowProps {
    def: PropDef;
    value: unknown;
    onChange: (value: unknown) => void;
}

interface OptionControl {
    button: ButtonView;
    emptyLabel?: LabelView;
}

class PropertyRowView extends VanillaView<PropertyRowProps> {
    private label: LabelView | undefined;
    private input: InputView | undefined;
    private checkbox: CheckboxView | undefined;
    private options: OptionControl[] = [];

    public constructor(props: PropertyRowProps) {
        super(props, createPanelElement({ direction: "column", gap: "xs" }));
    }

    protected onMount(): void {
        if (this.props.def.type === "boolean") {
            this.checkbox = this.child(new CheckboxView(this.checkboxProps(this.props)));
            this.root.append(this.checkbox.root);
            this.checkbox.mount();
            return;
        }

        this.label = this.child(new LabelView(this.labelProps(this.props.def)));
        this.root.append(this.label.root);
        this.label.mount();

        if (this.props.def.type === "string" || this.props.def.type === "number") {
            this.input = this.child(new InputView(this.inputProps(this.props)));
            this.root.append(this.input.root);
            this.input.mount();
            return;
        }

        const optionsPanel = createPanelElement({ direction: "row", wrap: true, gap: "xs" });
        this.root.append(optionsPanel);
        const options = this.props.def.type === "enum"
            ? this.props.def.options
            : ICON_PRESETS.map((preset) => preset.id);
        this.options = options.map((option) => {
            const emptyLabel = option === ""
                ? this.child(new LabelView({ italic: true, color: "inherit", children: "(empty)" }))
                : undefined;
            emptyLabel?.mount();
            const buttonProps: ButtonViewProps = {
                size: "sm",
                variant: this.props.value === option ? "primary" : "link",
                onClick: () => this.props.onChange(option),
                children: emptyLabel?.root ?? option,
            };
            const button = this.child(new ButtonView(buttonProps));
            optionsPanel.append(button.root);
            button.mount();
            return { button, emptyLabel };
        });
    }

    protected onUpdate(props: PropertyRowProps): void {
        if (this.checkbox) {
            this.checkbox.update(this.checkboxProps(props));
        } else if (this.input) {
            this.input.update(this.inputProps(props));
        } else {
            this.options.forEach((option, index) => {
                const value = this.optionValue(props.def, index);
                option.button.update({
                    size: "sm",
                    variant: props.value === value ? "primary" : "link",
                    onClick: () => props.onChange(value),
                    children: option.emptyLabel?.root ?? value,
                });
            });
        }
    }

    private labelProps(def: PropDef): LabelProps {
        return { color: "light", children: def.label ?? def.name };
    }

    private checkboxProps(props: PropertyRowProps): CheckboxProps {
        return {
            checked: Boolean(props.value),
            onChange: (value) => props.onChange(value),
            children: props.def.label ?? props.def.name,
        };
    }

    private inputProps(props: PropertyRowProps): InputProps {
        const def = props.def;
        return {
            value: String(props.value ?? ""),
            onChange: (value) => {
                if (def.type === "string") {
                    props.onChange(value);
                    return;
                }
                const numberValue = Number(value);
                if (!Number.isNaN(numberValue)) props.onChange(numberValue);
            },
            size: "sm",
            type: def.type === "number" ? "number" : "text",
            min: def.type === "number" ? def.min : undefined,
            max: def.type === "number" ? def.max : undefined,
            step: def.type === "number" ? def.step : undefined,
            placeholder: def.type === "string" ? def.placeholder : undefined,
        };
    }

    private optionValue(def: PropDef, index: number): string {
        return def.type === "enum" ? def.options[index] : ICON_PRESETS[index].id;
    }
}

export class PropertyEditorView extends VanillaView<{ model: StorybookEditorModel }> {
    private readonly model: StorybookEditorModel;
    private storyId: string | undefined;
    private rows: PropertyRowView[] = [];
    private resetButton: ButtonView | undefined;
    private emptyMessage: HTMLElement | undefined;

    public constructor(props: { model: StorybookEditorModel }) {
        super(props, createPanelElement({
            name: "storybook-property-editor",
            direction: "column",
            width: props.model.state.get().rightPanelWidth,
            shrink: false,
            overflowY: "auto",
            padding: "md",
        }));
        this.model = props.model;
        this.root.dataset.type = "property-editor";
    }

    protected onMount(): void {
        this.bind(this.model.state, (state) => state, (state) => this.sync(state));
    }

    protected onUpdate(props: { model: StorybookEditorModel }): void {
        if (props.model !== this.model) {
            throw new Error("Property editor model cannot change after mount.");
        }
    }

    private sync(state: import("./StorybookEditorModel").StorybookEditorState): void {
        this.root.style.width = `${state.rightPanelWidth}px`;
        const story = findStory(state.selectedStoryId);
        const visibleProps = story?.props.filter((prop) => !STORYBOOK_MANAGED_PROPS.has(prop.name)) ?? [];
        if (
            story?.id !== this.storyId
            || (!story && !this.emptyMessage)
            || (visibleProps.length === 0 && this.rows.length > 0)
        ) {
            this.rebuild(story?.id, visibleProps, story !== undefined);
            this.storyId = story?.id;
        } else {
            this.rows.forEach((row, index) => row.update({
                def: visibleProps[index],
                value: state.propValues[visibleProps[index].name],
                onChange: (value) => this.model.setPropValue(visibleProps[index].name, value),
            }));
        }
    }

    private rebuild(
        storyId: string | undefined,
        visibleProps: PropDef[],
        hasStory: boolean,
    ): void {
        this.rows.forEach((row) => this.releaseChild(row));
        this.rows = [];
        if (this.resetButton) {
            this.releaseChild(this.resetButton);
            this.resetButton = undefined;
        }
        this.emptyMessage = undefined;
        this.root.replaceChildren();
        if (!hasStory || visibleProps.length === 0) {
            const messagePanel = createPanelElement({ padding: "md" });
            this.emptyMessage = createTextElement("No editable props", { size: "sm", color: "light" });
            messagePanel.append(this.emptyMessage);
            this.root.append(messagePanel);
            return;
        }

        const state = this.model.state.get();
        for (const def of visibleProps) {
            const row = this.child(new PropertyRowView({
                def,
                value: state.propValues[def.name],
                onChange: (value) => this.model.setPropValue(def.name, value),
            }));
            this.rows.push(row);
            this.root.append(row.root);
            row.mount();
        }

        this.resetButton = this.child(new ButtonView({
            name: "storybook-reset-props",
            variant: "ghost",
            size: "sm",
            onClick: this.model.resetProps,
            children: "Reset Props",
        }));
        const resetPanel = createPanelElement({ align: "start" });
        resetPanel.append(this.resetButton.root);
        this.root.append(resetPanel);
        this.resetButton.mount();

        // Keep the field assigned as part of the rebuild's state transition so a later callback
        // cannot mistake the freshly-built rows for a different story.
        this.storyId = storyId;
    }
}
