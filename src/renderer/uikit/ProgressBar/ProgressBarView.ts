import { applyRestProps, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/dom-props";
import { VanillaView } from "../shared/vanilla-view";
import type { ProgressBarProps } from "./ProgressBar";
import "./ProgressBar.css";

type ProgressState = "completed" | "determinate" | "indeterminate";

function clampPercent(value: number, max: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
    const pct = (value / max) * 100;
    if (pct < 0) return 0;
    if (pct > 100) return 100;
    return pct;
}

function cssLength(value: number | string): string {
    return typeof value === "number" ? `${value}px` : value;
}

export class ProgressBarView extends VanillaView<ProgressBarProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private fill: HTMLDivElement | undefined;

    public constructor(props: ProgressBarProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        this.fill = document.createElement("div");
        this.fill.dataset.part = "fill";
        this.root.append(this.fill);
        this.applyProps(this.props);
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: ProgressBarProps): void {
        this.applyProps(props);
    }

    protected onDispose(): void {
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: ProgressBarProps): void {
        const {
            name,
            value,
            max = 100,
            completed,
            width,
            height = 6,
            variant = "default",
            "aria-label": ariaLabel = "Progress",
            children: _children,
            ...rest
        } = props;
        const state: ProgressState = completed ? "completed" : value != null ? "determinate" : "indeterminate";
        const percent = state === "completed" ? 100 : state === "determinate" ? clampPercent(value ?? 0, max) : 0;

        this.root.dataset.type = "progress-bar";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        this.root.dataset.state = state;
        this.root.dataset.variant = variant;
        this.root.setAttribute("role", "progressbar");
        this.root.setAttribute("aria-label", ariaLabel);
        if (state === "indeterminate") {
            this.root.setAttribute("aria-busy", "true");
            this.root.setAttribute("aria-valuemin", "0");
            this.root.setAttribute("aria-valuemax", String(max));
            this.root.removeAttribute("aria-valuenow");
        } else {
            this.root.removeAttribute("aria-busy");
            this.root.setAttribute("aria-valuemin", "0");
            this.root.setAttribute("aria-valuemax", String(max));
            this.root.setAttribute("aria-valuenow", String(state === "completed" ? max : value));
        }
        // ariaProps precede residual props in the React face, so callers can
        // override these attributes. Keep that precedence during conversion.
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);

        this.root.style.setProperty("--progress-bar-width", width === undefined ? "100%" : cssLength(width));
        this.root.style.setProperty("--progress-bar-height", `${height}px`);
        if (!this.fill) return;
        if (state === "indeterminate") this.fill.style.removeProperty("--progress-bar-fill-width");
        else this.fill.style.setProperty("--progress-bar-fill-width", `${percent}%`);
    }
}
