import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { MenuBarView, type MenuBarProps } from "./MenuBarView";

export type { MenuBarProps } from "./MenuBarView";

export function MenuBar(props: MenuBarProps): React.ReactElement {
    return mountVanilla(MenuBarView, props);
}
