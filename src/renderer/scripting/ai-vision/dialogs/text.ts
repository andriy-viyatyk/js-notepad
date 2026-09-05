import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { TextDialogModel, TextDialogProps } from "../../../ui/dialogs/TextDialog";
import { cancelDialog, closeWithResult, descriptor, dialogState, requireButton, modelWith, type DialogAdapter, type DialogEntry } from "./shared";

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "text", kind: "property", summary: "The initial text content." },
    { name: "editorText", kind: "property", summary: "The current editor text." },
    { name: "buttons", kind: "property", summary: "Visible response buttons." },
    { name: "readOnly", kind: "property", summary: "Whether the text editor is read-only." },
    { name: "options", kind: "property", summary: "Editor display options." },
    { name: "width", kind: "property", summary: "Dialog width, if specified." },
    { name: "height", kind: "property", summary: "Dialog height, if specified." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible response button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog without selecting a response." },
] as const;
const AI_VISION = descriptor("TextDialog", "A text dialog awaiting a response.", MEMBERS);

export class TextDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    get title(): string | undefined { return dialogState<TextDialogProps>(this.entry).title; }
    get message(): undefined { return undefined; }
    get text(): string { return dialogState<TextDialogProps>(this.entry).text ?? ""; }
    get editorText(): string { return modelWith<TextDialogModel>(this.entry).editorText; }
    get buttons(): readonly string[] { return dialogState<TextDialogProps>(this.entry).buttons ?? []; }
    get readOnly(): boolean { return dialogState<TextDialogProps>(this.entry).readOnly ?? true; }
    get options(): TextDialogProps["options"] { return dialogState<TextDialogProps>(this.entry).options; }
    get width(): number | undefined { return dialogState<TextDialogProps>(this.entry).width; }
    get height(): number | undefined { return dialogState<TextDialogProps>(this.entry).height; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        requireButton(this.buttons, button);
        return await closeWithResult(this.entry, { text: this.editorText, button });
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
