import React from "react";
import { mountVanilla } from "../shared/mount";
import { ProgressBarView } from "./ProgressBarView";

type Variant = "default" | "success" | "warning" | "danger";

export interface ProgressBarProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    name?: string;
    value?: number;
    max?: number;
    completed?: boolean;
    width?: number | string;
    height?: number;
    variant?: Variant;
    "aria-label"?: string;
}

export function ProgressBar(props: ProgressBarProps): React.ReactElement {
    return mountVanilla(ProgressBarView, props);
}
