import React from "react";
import { mountVanilla } from "../shared/mount";
import { ButtonView } from "./ButtonView";
import type { IconRef } from "../shared/slots";
import type { SlotContent } from "../shared/fill-slot";
import "./Button.css";

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title" | "onKeyDown" | "children"> {
    ref?: React.Ref<HTMLButtonElement>;
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    title?: string;
    onKeyDown?: (event: KeyboardEvent) => void;
    variant?: "default" | "primary" | "ghost" | "danger" | "link";
    size?: "sm" | "md";
    icon?: IconRef;
    background?: "default" | "light" | "dark";
    block?: boolean;
    hideUntilParentHover?: boolean;
    children?: SlotContent;
}

export function Button(props: ButtonProps): React.ReactElement {
    return mountVanilla(ButtonView, props);
}
