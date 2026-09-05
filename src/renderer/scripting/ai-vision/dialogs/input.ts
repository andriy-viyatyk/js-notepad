import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { InputDialogProps, InputResult } from "../../../ui/dialogs/InputDialog";
import { cancelDialog, closeWithResult, descriptor, dialogState, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "message", kind: "property", summary: "The input prompt." },
    { name: "value", kind: "property", summary: "The current input value." },
    { name: "buttons", kind: "property", summary: "Visible response buttons." },
    { name: "options", kind: "property", summary: "Visible radio options, if any." },
    { name: "selectedOption", kind: "property", summary: "The selected radio option, if any." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible response button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog without selecting a response." },
] as const;
const AI_VISION = descriptor("InputDialog", "An input dialog awaiting a response.", MEMBERS);

export class InputDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    get title(): string | undefined { return dialogState<InputDialogProps>(this.entry).title; }
    get message(): string { return dialogState<InputDialogProps>(this.entry).message; }
    get value(): string { return dialogState<InputDialogProps>(this.entry).value ?? ""; }
    get buttons(): readonly string[] { return dialogState<InputDialogProps>(this.entry).buttons ?? []; }
    get options(): readonly string[] { return dialogState<InputDialogProps>(this.entry).options ?? []; }
    get selectedOption(): string | undefined { return dialogState<InputDialogProps>(this.entry).selectedOption; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        const state = dialogState<InputDialogProps>(this.entry);
        requireButton(state.buttons ?? [], button);
        const result: InputResult = {
            value: state.value ?? "",
            button,
            selectedOption: state.selectedOption,
        };
        return await closeWithResult(this.entry, result);
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
