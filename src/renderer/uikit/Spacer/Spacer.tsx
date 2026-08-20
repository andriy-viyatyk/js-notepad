import React from "react";
import { mountVanilla } from "../shared/mount";
import { SpacerView } from "./SpacerView";

export interface SpacerProps {
    name?: string;
    size?: number | string;
}

export function Spacer(props: SpacerProps): React.ReactElement {
    return mountVanilla(SpacerView, props);
}
