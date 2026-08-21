import React from "react";
import { mountVanilla } from "../shared/mount";
import { SplitterView } from "./SplitterView";

export interface SplitterProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    name?: string;
    orientation?: "vertical" | "horizontal";
    value: number;
    onChange: (value: number) => void;
    side?: "before" | "after";
    min?: number;
    max?: number;
    disabled?: boolean;
    border?: "before" | "after" | "none";
    background?: "default" | "light" | "dark" | "overlay";
    hoverBackground?: "default" | "light" | "dark" | "overlay";
}

export function Splitter(props: SplitterProps): React.ReactElement {
    return mountVanilla(SplitterView, props);
}
