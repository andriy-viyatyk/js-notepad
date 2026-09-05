import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { PasswordDialogState } from "../../../ui/dialogs/PasswordDialog";
import { cancelDialog, descriptor, dialogState, modelWith, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

interface PasswordModel {
    submit(): void;
}

const MEMBERS = [
    { name: "buttons", kind: "property", summary: "Visible safe password actions and cancellation." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible password action." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Cancel without exposing the password." },
] as const;
const AI_VISION = descriptor("PasswordDialog", "A password dialog with a privacy-preserving action surface.", MEMBERS);

export class PasswordDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    get buttons(): readonly string[] {
        const state = dialogState<PasswordDialogState>(this.entry);
        return [state.mode === "decrypt" ? "Decrypt" : "Encrypt", "Cancel"];
    }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        requireButton(this.buttons, button);
        if (button === "Cancel") return this.cancel();
        // The submit result is the secret password. Await the action but deliberately discard it.
        await modelWith<PasswordModel>(this.entry).submit();
        return undefined;
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
