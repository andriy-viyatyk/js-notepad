import { createIconElement } from "../shared/slots";
import { applyRestProps, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/react-compat";
import { VanillaView } from "../shared/vanilla-view";
import type { SpinnerProps } from "./Spinner";

export class SpinnerView extends VanillaView<SpinnerProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();

    public constructor(props: SpinnerProps) {
        super(props, document.createElement("span"));
    }

    protected onMount(): void {
        this.root.append(createIconElement("progress"));
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
        const { name, size = 32, color, children: _children, ...rest } = props;
        // Spinner historically forwards residual props first, then writes its
        // owned data/ARIA/style fields after the spread.
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
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
}
