import { applyRestProps, clearRestListeners, createRestPropsState } from "../shared/dom-props";
import type { NativeInputHTMLAttributes, RestPropsState } from "../shared/dom-props";
import { VanillaView } from "../shared/vanilla-view";

export interface SliderProps
    extends Omit<
        NativeInputHTMLAttributes<HTMLInputElement>,
        "value" | "onChange" | "min" | "max" | "step" | "type" | "size" |
        "style" | "className"
    > {
    name?: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    size?: "sm" | "md";
    disabled?: boolean;
    width?: number | string;
    showProgress?: boolean;
}

const ACTIVE_COLOR = "var(--color-border-active, currentColor)";
const DEFAULT_COLOR = "var(--color-border-default, currentColor)";

export class SliderView extends VanillaView<SliderProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();

    public constructor(props: SliderProps) {
        super(props, document.createElement("input"));
    }

    protected onMount(): void {
        this.applyConstructionRestProps(this.props);
        this.applyProps(this.props);
        this.listen(this.root, "input", this.handleInput);
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: SliderProps): void { this.applyProps(props); }

    protected onDispose(): void { clearRestListeners(this.root, this.restPropsState); }

    private applyProps(props: SliderProps): void {
        const {
            name, value, onChange: _onChange, min, max, step = 1, size = "md",
            disabled, width, showProgress, children: _children, ..._rest
        } = props;
        const input = this.root as HTMLInputElement;
        input.type = "range";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        if (String(value) !== input.value) input.value = String(value);
        input.disabled = Boolean(disabled);

        this.root.dataset.type = "slider";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.root.dataset.size = size;
        if (disabled) this.root.dataset.disabled = "";
        else delete this.root.dataset.disabled;
        if (showProgress) this.root.dataset.showProgress = "";
        else delete this.root.dataset.showProgress;

        if (width === undefined) this.root.style.removeProperty("--slider-width");
        else this.root.style.setProperty("--slider-width", typeof width === "number" ? `${width}px` : width);

        if (!showProgress) {
            this.root.style.removeProperty("--slider-track-bg");
        } else {
            const range = max - min;
            const pct = range > 0 ? ((value - min) / range) * 100 : 0;
            const clamped = Math.max(0, Math.min(100, pct));
            this.root.style.setProperty(
                "--slider-track-bg",
                `linear-gradient(to right, ${ACTIVE_COLOR} ${clamped}%, ${DEFAULT_COLOR} ${clamped}%)`,
            );
        }
    }

    private applyConstructionRestProps(props: SliderProps): void {
        const {
            name: _name,
            value: _value,
            onChange: _onChange,
            min: _min,
            max: _max,
            step: _step,
            size: _size,
            disabled: _disabled,
            width: _width,
            showProgress: _showProgress,
            children: _children,
            ...rest
        } = props;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    private readonly handleInput = (event: Event): void => {
        const input = event.currentTarget as HTMLInputElement;
        this.props.onChange(parseFloat(input.value));
    };
}
