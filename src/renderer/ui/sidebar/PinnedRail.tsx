import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { PinnedRailView, type PinnedRailProps } from "./PinnedRailView";

export type { PinnedRailProps } from "./PinnedRailView";

export function PinnedRail(props: PinnedRailProps): React.ReactElement {
    return mountVanilla(PinnedRailView, props);
}
