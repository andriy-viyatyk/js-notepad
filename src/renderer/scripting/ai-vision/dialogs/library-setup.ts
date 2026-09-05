import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { LibrarySetupDialogState } from "../../../ui/dialogs/LibrarySetupDialog";
import { cancelDialog, descriptor, dialogState, modelWith, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

interface LibrarySetupModel { link(): Promise<void>; }

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "folderPath", kind: "property", summary: "The script library folder." },
    { name: "copyExamples", kind: "property", summary: "Whether to copy example scripts." },
    { name: "linking", kind: "property", summary: "Whether library linking is in progress." },
    { name: "buttons", kind: "property", summary: "Visible response buttons." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible response button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog without linking a library." },
] as const;
const AI_VISION = descriptor("LibrarySetupDialog", "A script library setup dialog awaiting a response.", MEMBERS);

export class LibrarySetupDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    private get state(): LibrarySetupDialogState { return dialogState<LibrarySetupDialogState>(this.entry); }
    get title(): string | undefined { return this.state.title; }
    get message(): undefined { return undefined; }
    get folderPath(): string { return this.state.folderPath; }
    get copyExamples(): boolean { return this.state.copyExamples; }
    get linking(): boolean { return this.state.linking; }
    get buttons(): readonly string[] { return [this.state.linking ? "Linking..." : "Link", "Cancel"]; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        requireButton(this.buttons, button);
        if (button === "Cancel") return this.cancel();
        if (this.state.linking || !this.state.folderPath.trim()) {
            throw new Error(`Dialog button ${JSON.stringify(button)} is disabled.`);
        }
        await modelWith<LibrarySetupModel>(this.entry).link();
        return undefined;
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
