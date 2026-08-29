import { applyRestProps, clearRestListeners, createRestPropsState } from "../shared/dom-props";
import type { NativeHTMLAttributes, RestPropsState } from "../shared/dom-props";
import { createIconElement } from "../shared/slots";
import { VanillaView } from "../shared/vanilla-view";

export interface SpinnerProps
    extends Omit<NativeHTMLAttributes<HTMLSpanElement>, "style" | "className" | "color"> {
    name?: string;
    size?: number;
    color?: string;
}

export class SpinnerView extends VanillaView<SpinnerProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();

    public constructor(props: SpinnerProps) {
        super(props, document.createElement("span"));
    }

    protected onMount(): void {
        this.root.append(createIconElement("progress"));
        this.applyConstructionRestProps(this.props);
        this.applyProps(this.props);
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: SpinnerProps): void {
        this.applyProps(props);
    }

    protected onDispose(): void {
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: SpinnerProps): void {
        const { name, size = 32, color, children: _children, ..._rest } = props;
        this.root.dataset.type = "spinner";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.root.setAttribute("role", "status");
        this.root.setAttribute("aria-live", "polite");
        this.root.setAttribute("aria-label", "Loading");
        this.root.style.setProperty("--spinner-size", `${size}px`);
        if (color) this.root.style.setProperty("--spinner-color", color);
        else this.root.style.removeProperty("--spinner-color");
    }

    private applyConstructionRestProps(props: SpinnerProps): void {
        const { name: _name, size: _size, color: _color, children: _children, ...rest } = props;
        // Spinner historically forwards residual props first, then owned data/ARIA/style fields.
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }
}
