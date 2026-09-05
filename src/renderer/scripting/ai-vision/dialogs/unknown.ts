import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import { cancelDialog, descriptor, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

/**
 * The fallback adapter for a dialog no `viewId` factory covers.
 *
 * Without it, one unregistered dialog makes `dialogs[i]` — and `children()`, and every attention
 * block — throw for *all* open dialogs, so a single missed registration blinds the agent to the
 * whole stack. `EditLinkDialog` was exactly that miss (found by EPIC-084's `/review`, after
 * US-1298's inventory put the count at 13).
 *
 * A dialog reached this way is still answerable: `cancel()` is the one action that works without
 * knowing anything about the model, and it is what an agent needs to unblock the app. Fields the
 * dialog might carry are deliberately NOT reflected over — an unknown dialog could be holding a
 * credential, and guessing at its members is exactly what the privacy rule forbids.
 */
const MEMBERS = [
    { name: "buttons", kind: "property", summary: "Always empty: this dialog has no adapter, so its buttons are unknown." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Always fails — no button names are known for this dialog.", caution: "not usable on this dialog; use cancel()" },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog. The only action available without an adapter." },
] as const;

const AI_VISION = descriptor(
    "UnknownDialog",
    "An open dialog with no AiVision adapter: it can be dismissed, but not read or answered by button.",
    MEMBERS,
);

export class UnknownDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    get title(): string { return ""; }
    get buttons(): readonly string[] { return []; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        requireButton(this.buttons, button);
        return undefined;
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
