import type React from "react";
import { mountVanilla } from "../shared/mount";
import { MenuView } from "./MenuView";
import type { MenuProps } from "./MenuModel";

// Menu is intentionally a thin React-facing adapter. The model, rows, search
// input, and recursive submenu branches are all owned by MenuView.
export function Menu(props: MenuProps & { ref?: React.Ref<HTMLDivElement> }): React.ReactElement {
    return mountVanilla(MenuView, props);
}

export type { MenuProps } from "./MenuModel";
