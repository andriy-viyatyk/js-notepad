import type React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { DialogsView } from "./DialogsView";

export { closeDialog, dialogsState, showDialog } from "./DialogsView";

export function Dialogs(): React.ReactElement {
    return mountVanilla(DialogsView, undefined);
}
