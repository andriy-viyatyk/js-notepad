import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { OpenUrlDialogState } from "../../../ui/dialogs/OpenUrlDialog";
import { cancelDialog, descriptor, dialogState, modelWith, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

interface OpenUrlModel { submit(): void; openFile(): void; }

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "message", kind: "property", summary: "The URL or file prompt." },
    { name: "value", kind: "property", summary: "The current URL or file input." },
    { name: "buttons", kind: "property", summary: "Visible response buttons." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible response button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog without opening anything." },
] as const;
const AI_VISION = descriptor("OpenUrlDialog", "A file or URL dialog awaiting a response.", MEMBERS);

export class OpenUrlDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    get title(): string { return "Open"; }
    get message(): string { return "Paste file path, URL, or cURL command"; }
    get value(): string { return dialogState<OpenUrlDialogState>(this.entry).value; }
    get buttons(): readonly string[] { return ["Open File", "Cancel", "Open"]; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        requireButton(this.buttons, button);
        const model = modelWith<OpenUrlModel>(this.entry);
        if (button === "Cancel") return this.cancel();
        if (button === "Open") {
            if (!this.value.trim()) throw new Error(`Dialog button ${JSON.stringify(button)} is disabled.`);
            await model.submit();
        } else {
            await model.openFile();
        }
        return undefined;
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
