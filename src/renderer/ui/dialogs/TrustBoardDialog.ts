import { showDialog } from "./Dialogs";
import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { registerDialogView } from "./dialog-view-registry";
import { TrustBoardDialogView } from "./TrustBoardDialogView";

export const trustBoardDialogId = Symbol("trustBoardDialog");

export interface TrustBoardDialogProps {
    boardPath: string; // absolute board-root path, for display
}

class TrustBoardDialogModel extends TDialogModel<TrustBoardDialogProps, boolean> {
    handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(false);
        }
    };
}

registerDialogView(trustBoardDialogId, TrustBoardDialogView);

export function showTrustBoardDialog(boardPath: string) {
    const model = new TrustBoardDialogModel(new TComponentState({ boardPath }));
    return showDialog({
        viewId: trustBoardDialogId,
        model,
    }) as Promise<boolean>;
}
