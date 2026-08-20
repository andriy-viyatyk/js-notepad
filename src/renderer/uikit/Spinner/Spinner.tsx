import React from "react";
import { mountVanilla } from "../shared/mount";
import { SpinnerView } from "./SpinnerView";
import "./Spinner.css";

export interface SpinnerProps
    extends Omit<React.HTMLAttributes<HTMLSpanElement>, "style" | "className" | "color"> {
    name?: string;
    size?: number;
    color?: string;
}

export function Spinner(props: SpinnerProps): React.ReactElement {
    return mountVanilla(SpinnerView, props);
}
