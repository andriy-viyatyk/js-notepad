import type { IconRef } from "../shared/slots";
import { TraitKey, type Traited, type TraitType } from "../../core/traits/traits";

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
