import React from "react";
import { mountVanilla } from "../shared/mount";
import type { IconRef } from "../shared/slots";
import type { SlotContent } from "../shared/fill-slot";
import { SegmentedControlView } from "./SegmentedControlView";
import type { Traited } from "../../core/traits/traits";
import "./SegmentedControl.css";

export interface ISegment {
    value: string;
    label?: SlotContent;
    icon?: IconRef;
    title?: string;
    disabled?: boolean;
}

export { SEGMENT_KEY } from "./SegmentedControlView";

export interface SegmentedControlProps {
    name?: string;
    items: ISegment[] | Traited<unknown[]>;
    value: string;
    onChange: (value: string) => void;
    size?: "sm" | "md";
    background?: "default" | "light" | "dark";
    disabled?: boolean;
}

export function SegmentedControl(props: SegmentedControlProps): React.ReactElement {
    return mountVanilla(SegmentedControlView, props);
}
