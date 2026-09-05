import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { ConfirmationDialogProps } from "../../../ui/dialogs/ConfirmationDialog";
import { cancelDialog, closeWithResult, descriptor, dialogState, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "message", kind: "property", summary: "The confirmation message." },
    { name: "buttons", kind: "property", summary: "Visible response buttons." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible response button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog without selecting a response." },
] as const;
const AI_VISION = descriptor("ConfirmationDialog", "A confirmation dialog awaiting a response.", MEMBERS);

export class ConfirmationDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    get title(): string | undefined { return dialogState<ConfirmationDialogProps>(this.entry).title; }
    get message(): string { return dialogState<ConfirmationDialogProps>(this.entry).message; }
    get buttons(): readonly string[] { return dialogState<ConfirmationDialogProps>(this.entry).buttons ?? []; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        const buttons = this.buttons;
        requireButton(buttons, button);
        return await closeWithResult(this.entry, button);
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
