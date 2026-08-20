import React from "react";
import { mountVanilla } from "../shared/mount";
import { CheckboxView } from "./CheckboxView";
import "./Checkbox.css";

export interface CheckboxProps
    extends Omit<React.HTMLAttributes<HTMLLabelElement>, "onChange"> {
    /** Optional debug label emitted as `data-name` on the root element. */
    name?: string;
    /** Checked state (controlled). */
    checked: boolean;
    /** Change handler — receives the new boolean value. */
    onChange: (checked: boolean) => void;
    /** Disables interaction. */
    disabled?: boolean;
}

export function Checkbox(props: CheckboxProps): React.ReactElement {
    return mountVanilla(CheckboxView, props);
}
