import { showDialog } from "./Dialogs";
import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { registerDialogView } from "./dialog-view-registry";
import { NamespaceCollisionDialogView } from "./NamespaceCollisionDialogView";

export const namespaceCollisionDialogId = Symbol("namespaceCollisionDialog");

export interface NamespaceCollisionDialogProps {
    namespace: string; // the colliding "author/name" namespace, for display
    collidingRoot: string; // absolute root path of the already-trusted board using it
}

class NamespaceCollisionDialogModel extends TDialogModel<NamespaceCollisionDialogProps, boolean> {
    handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(false);
        }
    };
}

registerDialogView(namespaceCollisionDialogId, NamespaceCollisionDialogView);

export function showNamespaceCollisionDialog(namespace: string, collidingRoot: string) {
    const model = new NamespaceCollisionDialogModel(
        new TComponentState({ namespace, collidingRoot }),
    );
    return showDialog({
        viewId: namespaceCollisionDialogId,
        model,
    }) as Promise<boolean>;
}
