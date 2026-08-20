import React from "react";
import { mountVanilla } from "../shared/mount";
import { SliderView } from "./SliderView";
import "./Slider.css";

export interface SliderProps
    extends Omit<
        React.InputHTMLAttributes<HTMLInputElement>,
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

export function Slider(props: SliderProps): React.ReactElement {
    return mountVanilla(SliderView, props);
}
