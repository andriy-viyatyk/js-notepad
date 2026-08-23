import type React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { PagesView } from "./PagesView";

export function Pages(): React.ReactElement {
    return mountVanilla(PagesView, {});
}
