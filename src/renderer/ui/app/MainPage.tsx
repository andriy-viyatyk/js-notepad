import type React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { MainPageView } from "./MainPageView";

export function MainPage(): React.ReactElement {
    return mountVanilla(MainPageView, {});
}
