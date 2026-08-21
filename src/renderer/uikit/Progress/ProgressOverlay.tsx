import React from "react";
import { mountVanilla } from "../shared/mount";
import { ProgressOverlayView } from "./ProgressOverlayView";

export interface ProgressOverlayProps {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
}

export function ProgressOverlay({ name }: ProgressOverlayProps = {}): React.ReactElement {
    return mountVanilla(ProgressOverlayView, { name });
}
