import { showDialog } from "./Dialogs";
import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { registerDialogView } from "./dialog-view-registry";
import { PasswordDialogView } from "./PasswordDialogView";

export const passwordDialogId = Symbol("passwordDialog");

export interface PasswordDialogProps {
    mode: "encrypt" | "decrypt";
    /** Optional explanatory text shown above the password field. */
    message?: string;
}

export interface PasswordDialogState extends PasswordDialogProps {
    password: string;
    confirm: string;
    error: string;
}

const defaultPasswordDialogProps: PasswordDialogState = {
    mode: "decrypt",
    password: "",
    confirm: "",
    error: "",
};

class PasswordDialogModel extends TDialogModel<PasswordDialogState, string> {
    setPassword = (password: string) => {
        this.state.update((state) => { state.password = password; state.error = ""; });
    };

    setConfirm = (confirm: string) => {
        this.state.update((state) => { state.confirm = confirm; state.error = ""; });
    };

    setError = (error: string) => {
        this.state.update((state) => { state.error = error; });
    };

    submit = () => {
        const { password, confirm, mode } = this.state.get();
        if (!password) {
            this.setError("Password cannot be empty");
            return;
        }
        if (mode !== "decrypt" && password !== confirm) {
            this.setError("Passwords do not match");
            return;
        }
        void this.close(password);
    };

}

registerDialogView(passwordDialogId, PasswordDialogView);

export function showPasswordDialog(props?: Partial<PasswordDialogProps>) {
    const modelState = {
        ...defaultPasswordDialogProps,
        ...props,
    };

    const model = new PasswordDialogModel(new TComponentState(modelState));
    return showDialog({
        viewId: passwordDialogId,
        model,
    }) as Promise<string | undefined>;
}
