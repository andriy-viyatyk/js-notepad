import color from "../../theme/color";
import type { ButtonProps } from "../../uikit/Button/ButtonView";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import type { SliderProps } from "../../uikit/Slider/SliderView";
import { SliderView } from "../../uikit/Slider/SliderView";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { ForceGraphRenderer, type ForceParams } from "./ForceGraphRenderer";
import "../../uikit/Button/Button.css";
import "../../uikit/Slider/Slider.css";
import "./GraphTuningSliders.css";

export interface GraphTuningHost {
    readonly renderer: { readonly forceParams: ForceParams };
    updateForceParams(params: Partial<ForceParams>): void;
    resetForceParams(): void;
}

export interface GraphTuningSlidersProps {
    editor: GraphTuningHost;
}

type TuningKey = "charge" | "linkDistance" | "collide";
type TuningValues = Pick<ForceParams, TuningKey>;

const defaults = ForceGraphRenderer.defaultForceParams;

const sliders: ReadonlyArray<{
    key: TuningKey;
    label: string;
    min: number;
    max: number;
    step: number;
}> = [
    { key: "charge", label: "Charge", min: -200, max: 0, step: 1 },
    { key: "linkDistance", label: "Distance", min: 10, max: 200, step: 1 },
    { key: "collide", label: "Collide", min: 0, max: 1, step: 0.05 },
];

function readValues(editor: GraphTuningHost): TuningValues {
    const current = editor.renderer.forceParams;
    return {
        charge: current.charge,
        linkDistance: current.linkDistance,
        collide: current.collide,
    };
}

interface TuningControl {
    readonly definition: (typeof sliders)[number];
    readonly label: HTMLSpanElement;
    readonly slider: SliderView;
    readonly value: HTMLSpanElement;
}

export class GraphTuningSlidersView extends VanillaView<GraphTuningSlidersProps> {
    private readonly controls = new Map<TuningKey, TuningControl>();
    private readonly editor: GraphTuningHost;
    private readonly values: TuningValues;
    private resetButton: ButtonView | undefined;

    public constructor(props: GraphTuningSlidersProps) {
        super(props, createPanelElement({
            name: "graph-tuning",
            direction: "column",
            gap: "xs",
            paddingX: "md",
            paddingY: "sm",
            borderTop: true,
        }));
        this.root.classList.add("graph-tuning-sliders");
        this.editor = props.editor;
        this.values = readValues(this.editor);
    }

    protected onMount(): void {
        for (const definition of sliders) {
            const label = createTextElement(definition.label, { color: color.graph.labelText });
            label.classList.add("graph-tuning-label");
            const value = createTextElement(String(this.values[definition.key]), { color: color.graph.labelText });
            value.classList.add("graph-tuning-value");
            const slider = this.child(new SliderView(this.sliderProps(definition)));
            const row = createPanelElement({ direction: "row", align: "center", gap: "md" }, [
                label,
                slider.root,
                value,
            ]);
            this.root.append(row);
            slider.mount();
            this.controls.set(definition.key, { definition, label, slider, value });
        }

        const resetButton = this.child(new ButtonView(this.resetButtonProps()));
        this.resetButton = resetButton;
        this.root.append(createPanelElement({ direction: "row", justify: "end", paddingTop: "xs" }, [resetButton.root]));
        resetButton.mount();
    }

    protected onUpdate(props: GraphTuningSlidersProps): void {
        if (props.editor !== this.editor) {
            throw new Error("Graph tuning sliders received a different editor instance.");
        }
        this.syncControls();
    }

    private sliderProps(definition: (typeof sliders)[number]): SliderProps {
        return {
            name: `tuning-${definition.key.replace(/([A-Z])/g, "-$1").toLowerCase()}`,
            size: "sm",
            min: definition.min,
            max: definition.max,
            step: definition.step,
            value: this.values[definition.key],
            onChange: (value) => this.changeValue(definition.key, value),
        };
    }

    private resetButtonProps(): ButtonProps {
        return {
            name: "tuning-reset",
            size: "sm",
            variant: "ghost",
            onClick: this.reset,
            children: "Reset",
        };
    }

    private readonly changeValue = (key: TuningKey, value: number): void => {
        this.values[key] = value;
        this.editor.updateForceParams({ [key]: value });
        this.syncControls();
    };

    private readonly reset = (): void => {
        this.values.charge = defaults.charge;
        this.values.linkDistance = defaults.linkDistance;
        this.values.collide = defaults.collide;
        this.editor.resetForceParams();
        this.syncControls();
    };

    private syncControls(): void {
        for (const control of this.controls.values()) {
            const value = this.values[control.definition.key];
            control.slider.update(this.sliderProps(control.definition));
            control.value.textContent = String(value);
        }
        this.resetButton?.update(this.resetButtonProps());
    }
}
