import React from "react";
import { mountVanilla } from "../shared/mount";
import { IconButtonView } from "./IconButtonView";
import type { IconRef } from "../shared/slots";

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
    ref?: React.Ref<HTMLButtonElement>;
    name?: string;
    title?: string;
    // DOM Node icons support registry-excluded language icons.
    icon: IconRef;
    size?: "sm" | "md";
    variant?: "default" | "chip";
    active?: boolean;
    warning?: boolean;
    hideUntilParentHover?: boolean;
    strikethrough?: boolean;
}

export function IconButton(props: IconButtonProps): React.ReactElement {
    return mountVanilla(IconButtonView, props);
}
