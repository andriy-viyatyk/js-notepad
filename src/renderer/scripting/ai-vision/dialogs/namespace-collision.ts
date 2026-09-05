import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { NamespaceCollisionDialogProps } from "../../../ui/dialogs/NamespaceCollisionDialog";
import { cancelDialog, closeWithResult, descriptor, dialogState, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "message", kind: "property", summary: "The namespace collision explanation." },
    { name: "namespace", kind: "property", summary: "The colliding namespace." },
    { name: "collidingRoot", kind: "property", summary: "The already-registered board root." },
    { name: "buttons", kind: "property", summary: "Visible response buttons." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible response button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog without registering." },
] as const;
const AI_VISION = descriptor("NamespaceCollisionDialog", "A namespace collision confirmation dialog.", MEMBERS);

export class NamespaceCollisionDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    get title(): string { return "Environment variables namespace already registered"; }
    // Mirrors NamespaceCollisionDialogView.ts:34-37 and :55.
    get message(): string {
        const { namespace } = dialogState<NamespaceCollisionDialogProps>(this.entry);
        return `Another registered board already uses the namespace "${namespace}" for its environment variables. Registering this board too means they'll share the same stored variables.`;
    }
    get namespace(): string { return dialogState<NamespaceCollisionDialogProps>(this.entry).namespace; }
    get collidingRoot(): string { return dialogState<NamespaceCollisionDialogProps>(this.entry).collidingRoot; }
    get buttons(): readonly string[] { return ["Cancel", "Register Anyway"]; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        requireButton(this.buttons, button);
        return await closeWithResult(this.entry, button === "Register Anyway");
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
