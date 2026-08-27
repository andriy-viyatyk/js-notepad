import React from "react";

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
