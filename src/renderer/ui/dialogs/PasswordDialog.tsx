import { useCallback } from "react";

import { showDialog } from "./Dialogs";
import { Dialog, DialogContent, Panel, Text, Button, Input, Label } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { TComponentState } from "../../core/state/state";

// =============================================================================
// Model
// =============================================================================

const passwordDialogId = Symbol("passwordDialog");

export interface PasswordDialogProps {
    mode: "encrypt" | "decrypt";
    /** Optional explanatory text shown above the password field. */
    message?: string;
}

interface PasswordDialogState extends PasswordDialogProps {
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
        this.state.update((s) => { s.password = password; s.error = ""; });
    };

    setConfirm = (confirm: string) => {
        this.state.update((s) => { s.confirm = confirm; s.error = ""; });
    };

    setError = (error: string) => {
        this.state.update((s) => { s.error = error; });
    };

    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(undefined);
        }
    };
}

// =============================================================================
// Component
// =============================================================================

function PasswordDialog({ model }: ViewPropsRO<PasswordDialogModel>) {
    const state = model.state.use();
    const isDecrypt = state.mode === "decrypt";

    const doSubmit = useCallback(() => {
        const { password, confirm } = model.state.get();
        if (!password) {
            model.setError("Password cannot be empty");
            return;
        }
        if (!isDecrypt && password !== confirm) {
            model.setError("Passwords do not match");
            return;
        }
        model.close(password);
    }, [isDecrypt, model]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                doSubmit();
            } else if (e.key === "Escape") {
                model.close(undefined);
            }
        },
        [doSubmit, model],
    );

    return (
        <Dialog name="password-dialog" onKeyDown={model.handleKeyDown} autoFocus={false}>
            <DialogContent
                title={isDecrypt ? "Decrypt File" : "Encrypt File"}
                icon="lock"
                onClose={() => model.close(undefined)}
                minWidth={340}
                maxWidth={500}
            >
                <Panel direction="column" paddingX="xxl" paddingY="xl" gap="md">
                    {state.message && (
                        <Text color="light">{state.message}</Text>
                    )}
                    <Panel direction="column" gap="xs">
                        <Label>Password</Label>
                        <Input
                            name="password-dialog-password"
                            type="password"
                            value={state.password}
                            onChange={model.setPassword}
                            autoFocus
                            onKeyDown={handleKeyDown}
                        />
                    </Panel>
                    {!isDecrypt && (
                        <Panel direction="column" gap="xs">
                            <Label>Confirm Password</Label>
                            <Input
                                name="password-dialog-confirm"
                                type="password"
                                value={state.confirm}
                                onChange={model.setConfirm}
                                onKeyDown={handleKeyDown}
                            />
                        </Panel>
                    )}
                    {state.error && (
                        <Text color="error" size="sm">{state.error}</Text>
                    )}
                </Panel>
                <Panel direction="row" justify="end" gap="sm" padding="md">
                    <Button name="password-submit" variant="primary" onClick={doSubmit}>
                        {isDecrypt ? "Decrypt" : "Encrypt"}
                    </Button>
                    <Button name="password-cancel" onClick={() => model.close(undefined)}>
                        Cancel
                    </Button>
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(passwordDialogId, PasswordDialog as DefaultView);

// =============================================================================
// Public API
// =============================================================================

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
