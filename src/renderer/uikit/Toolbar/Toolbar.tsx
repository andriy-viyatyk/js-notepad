import React from "react";
import { mountVanilla } from "../shared/mount";
import { ToolbarView } from "./ToolbarView";

// --- Types ---

export interface ToolbarProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    orientation?: "horizontal" | "vertical";
    background?: "default" | "light" | "dark";
    borderTop?: boolean;
    borderBottom?: boolean;
    disabled?: boolean;
    "aria-label"?: string;
}

export function Toolbar(props: ToolbarProps): React.ReactElement {
    return mountVanilla(ToolbarView, props);
}
