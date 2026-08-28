import type React from "react";
import color from "../../theme/color";
import { applyRestProps, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/react-compat";
import { VanillaView } from "../shared/vanilla-view";
import "./Dot.css";

export type DotColor =
    | "success"
    | "warning"
    | "error"
    | "info"
    | "neutral"
    | "active";

export interface DotProps
    extends Omit<
        React.HTMLAttributes<HTMLSpanElement>,
        "style" | "className" | "color" | "children"
    > {
    name?: string;
    size?: "xs" | "sm" | "md" | "lg" | number;
    color: DotColor | string;
    bordered?: boolean;
    selected?: boolean;
    hideUntilParentHover?: boolean;
}

const SIZE_MAP = { xs: 6, sm: 8, md: 12, lg: 18 } as const;

function diameter(size: DotProps["size"]): number {
    if (typeof size === "number") return size;
    return SIZE_MAP[size ?? "sm"];
}

function resolveFill(c: DotColor | string): string {
    switch (c) {
        case "success": return color.success.text;
        case "warning": return color.warning.text;
        case "error": return color.error.text;
        case "info": return color.misc.blue;
        case "neutral": return color.text.light;
        case "active": return color.border.active;
        default: return c;
    }
}

export class DotView extends VanillaView<DotProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();

    public constructor(props: DotProps) {
        super(props, document.createElement("span"));
    }

    protected onMount(): void {
        this.applyProps(this.props);
        this.own(() => clearRestListeners(this.root, this.restPropsState));
    }

    protected onUpdate(props: DotProps): void {
        this.applyProps(props);
    }

    protected onDispose(): void {
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyProps(props: DotProps): void {
        const {
            name,
            size = "sm",
            color: colorProp,
            bordered,
            selected,
            hideUntilParentHover,
            onClick,
            ...rest
        } = props;
        applyRestProps(this.root, { ...rest, onClick }, this.restPropsState);
        this.root.dataset.type = "dot";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        if (onClick !== undefined) this.root.dataset.clickable = "";
        else delete this.root.dataset.clickable;
        if (selected) this.root.dataset.selected = "";
        else delete this.root.dataset.selected;
        if (bordered) this.root.dataset.bordered = "";
        else delete this.root.dataset.bordered;
        if (hideUntilParentHover) this.root.dataset.visibility = "parent-hover";
        else delete this.root.dataset.visibility;
        this.root.style.setProperty("--dot-size", `${diameter(size)}px`);
        this.root.style.setProperty("--dot-color", resolveFill(colorProp));
    }
}
