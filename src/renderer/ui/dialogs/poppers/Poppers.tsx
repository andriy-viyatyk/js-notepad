import type React from "react";
import { mountVanilla } from "../../../uikit/shared/mount";
import { PoppersView } from "./PoppersView";

export {
    closePopper,
    showPopper,
    visiblePoppers,
} from "./PoppersView";
export type { IPopperViewData } from "./types";

export function Poppers(): React.ReactElement {
    return mountVanilla(PoppersView, undefined);
}
