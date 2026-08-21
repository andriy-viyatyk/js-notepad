import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    type RestPropsState,
} from "../shared/react-compat";
import { VanillaView } from "../shared/vanilla-view";
import type { SplitterProps } from "./Splitter";
import "./Splitter.css";

export class SplitterView extends VanillaView<SplitterProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private startCoord = 0;
    private startValue = 0;
    private pointerId: number | undefined;
    private dragging = false;

    public constructor(props: SplitterProps) {
        super(props, document.createElement("div"));
        this.root.classList.add("splitter-root");
    }

    protected onMount(): void {
        this.listen(this.root, "pointerdown", this.onPointerDown);
        this.listen(this.root, "pointermove", this.onPointerMove);
        this.listen(this.root, "pointerup", this.onPointerUp);
        this.listen(this.root, "pointercancel", this.onPointerUp);
        this.applyProps(this.props);
        this.own(() => this.releaseCapture());
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: SplitterProps): void {
        this.applyProps(props);
    }

    protected onDispose(): void {
        this.releaseCapture();
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: SplitterProps): void {
        const {
            name,
            orientation = "vertical",
            value,
            onChange: _onChange,
            side = "before",
            min = 0,
            max = Infinity,
            disabled,
            border = "after",
            background = "default",
            hoverBackground = "light",
            ...rest
        } = props;

        this.root.dataset.type = "splitter";
        this.setDataset("name", name);
        this.root.dataset.orientation = orientation;
        this.root.dataset.side = side;
        this.root.dataset.border = border;
        this.root.dataset.bg = background;
        this.root.dataset.bgHover = hoverBackground;
        this.setPresence("disabled", disabled);
        this.setPresence("dragging", this.dragging);
        this.root.setAttribute("role", "separator");
        this.root.setAttribute("aria-orientation", orientation);
        this.root.setAttribute("aria-valuenow", String(value));
        if (min !== 0) this.root.setAttribute("aria-valuemin", String(min));
        else this.root.removeAttribute("aria-valuemin");
        if (max !== Infinity) this.root.setAttribute("aria-valuemax", String(max));
        else this.root.removeAttribute("aria-valuemax");

        // Native drag listeners remain authoritative. Residual pointer callbacks
        // are additive through applyRestProps; no production caller uses them.
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    private setDataset(key: string, value: string | undefined): void {
        if (value === undefined) delete this.root.dataset[key];
        else this.root.dataset[key] = value;
    }

    private setPresence(key: string, value: boolean | undefined): void {
        if (value) this.root.dataset[key] = "";
        else delete this.root.dataset[key];
    }

    private readonly onPointerDown = (event: PointerEvent): void => {
        if (this.props.disabled) return;
        event.preventDefault();
        this.root.setPointerCapture(event.pointerId);
        this.pointerId = event.pointerId;
        this.startCoord = this.coordinate(event);
        this.startValue = this.props.value;
        this.dragging = true;
        this.applyProps(this.props);
    };

    private readonly onPointerMove = (event: PointerEvent): void => {
        if (!this.dragging || this.pointerId !== event.pointerId) return;
        if (!this.root.hasPointerCapture(event.pointerId)) return;
        const { side = "before", min = 0, max = Infinity } = this.props;
        const delta = this.coordinate(event) - this.startCoord;
        const sign = side === "before" ? 1 : -1;
        const next = Math.min(Math.max(this.startValue + delta * sign, min), max);
        this.props.onChange(next);
    };

    private readonly onPointerUp = (event: PointerEvent): void => {
        if (this.pointerId !== event.pointerId) return;
        this.releaseCapture();
        this.applyProps(this.props);
    };

    private coordinate(event: PointerEvent): number {
        return (this.props.orientation ?? "vertical") === "vertical" ? event.clientX : event.clientY;
    }

    private releaseCapture(): void {
        if (this.pointerId !== undefined && this.root.hasPointerCapture(this.pointerId)) {
            this.root.releasePointerCapture(this.pointerId);
        }
        this.pointerId = undefined;
        this.dragging = false;
    }
}
