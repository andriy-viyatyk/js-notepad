import React from "react";
import { mountVanilla } from "../shared/mount";
import { DotView } from "./DotView";

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

export function Dot(props: DotProps): React.ReactElement {
    return mountVanilla(DotView, props);
}
