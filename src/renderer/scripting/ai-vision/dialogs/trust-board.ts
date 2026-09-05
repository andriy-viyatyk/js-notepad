import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { TrustBoardDialogProps } from "../../../ui/dialogs/TrustBoardDialog";
import { cancelDialog, closeWithResult, descriptor, dialogState, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "message", kind: "property", summary: "The trust warning." },
    { name: "boardPath", kind: "property", summary: "The board root folder." },
    { name: "buttons", kind: "property", summary: "Visible response buttons." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible response button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog without trusting it." },
] as const;
const AI_VISION = descriptor("TrustBoardDialog", "A board trust confirmation dialog.", MEMBERS);

export class TrustBoardDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    get title(): string { return "Trust this board?"; }
    // Mirrors TrustBoardDialogView.ts:30-35 and :57.
    get message(): string {
        return "Trusting this board lets it run programs on your computer with your full user privileges — including reading and changing your files and using any signed-in command-line tools (cloud CLIs, git, etc.).";
    }
    get boardPath(): string { return dialogState<TrustBoardDialogProps>(this.entry).boardPath; }
    get buttons(): readonly string[] { return ["Cancel", "Trust Board"]; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        requireButton(this.buttons, button);
        return await closeWithResult(this.entry, button === "Trust Board");
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
