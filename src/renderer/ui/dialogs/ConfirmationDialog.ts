import { showDialog } from "./Dialogs";
import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { registerDialogView } from "./dialog-view-registry";
import { ConfirmationDialogView } from "./ConfirmationDialogView";

export const confirmationDialogId = Symbol("confirmationDialog");

export interface ConfirmationDialogProps {
    title?: string;
    message: string;
    buttons?: string[];
}

const defaultConfirmationDialogProps: ConfirmationDialogProps = {
    title: "Confirmatioin",
    message: "",
    buttons: ["Yes", "Cancel"],
};

class ConfirmationDialogModel extends TDialogModel<
    ConfirmationDialogProps,
    string
> {
    handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(undefined);
        }
    };
}

registerDialogView(confirmationDialogId, ConfirmationDialogView);

export function showConfirmationDialog(props: ConfirmationDialogProps) {
    const modelState = {
        ...defaultConfirmationDialogProps,
        ...props,
    };

    const model = new ConfirmationDialogModel(new TComponentState(modelState));
    return showDialog({
        viewId: confirmationDialogId,
        model,
    }) as Promise<string>;
}
