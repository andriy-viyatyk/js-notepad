import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { RegisterToolsetDialogProps } from "../../../ui/dialogs/RegisterToolsetDialog";
import { cancelDialog, closeWithResult, descriptor, dialogState, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "message", kind: "property", summary: "The toolset registration explanation." },
    { name: "toolsetName", kind: "property", summary: "The toolset name." },
    { name: "toolsetRoot", kind: "property", summary: "The toolset root folder." },
    { name: "tools", kind: "property", summary: "Tools proposed for registration." },
    { name: "buttons", kind: "property", summary: "Visible response buttons." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible response button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog without registering." },
] as const;
const AI_VISION = descriptor("RegisterToolsetDialog", "A toolset registration confirmation dialog.", MEMBERS);

export class RegisterToolsetDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    get title(): string { return "Register this toolset?"; }
    // Mirrors RegisterToolsetDialogView.ts:31-37 and :58.
    get message(): string {
        return "An AI agent wants to register a toolset. Once registered, its tools run as programs on your computer with your full user privileges — headlessly, whenever the agent calls them, and after the agent edits them, with no further prompt.";
    }
    get toolsetName(): string { return dialogState<RegisterToolsetDialogProps>(this.entry).toolsetName; }
    get toolsetRoot(): string { return dialogState<RegisterToolsetDialogProps>(this.entry).toolsetRoot; }
    get tools(): readonly { name: string; description: string }[] { return dialogState<RegisterToolsetDialogProps>(this.entry).tools; }
    get buttons(): readonly string[] { return ["Cancel", "Register toolset"]; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        requireButton(this.buttons, button);
        return await closeWithResult(this.entry, button === "Register toolset");
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
