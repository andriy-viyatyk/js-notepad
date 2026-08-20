import React from "react";
import { mountVanilla } from "../shared/mount";
import type { IconRef } from "../shared/slots";
import { TraitKey, Traited, TraitType } from "../../core/traits/traits";
import { RadioGroupView } from "./RadioGroupView";
import "./RadioGroup.css";

export interface IRadio {
    value: string;
    label?: string;
    icon?: IconRef;
    disabled?: boolean;
}

export const RADIO_KEY = new TraitKey<TraitType<IRadio>>("radio-group-item");

type GapSize = "xs" | "sm" | "md" | "lg" | "xl";
type Orientation = "horizontal" | "vertical";

export interface RadioGroupProps {
    name?: string;
    items: IRadio[] | Traited<unknown[]>;
    value: string;
    onChange: (value: string) => void;
    orientation?: Orientation;
    wrap?: boolean;
    gap?: GapSize;
    disabled?: boolean;
    "aria-label"?: string;
    "aria-labelledby"?: string;
}

export function RadioGroup(props: RadioGroupProps): React.ReactElement {
    return mountVanilla(RadioGroupView, props);
}
