import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { TorInfoDialogState } from "../../../ui/dialogs/TorInfoDialog";
import { cancelDialog, closeWithResult, descriptor, dialogState, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "message", kind: "property", summary: "The Tor connection explanation." },
    { name: "partition", kind: "property", summary: "The Tor browser partition." },
    { name: "loading", kind: "property", summary: "Whether the exit address is loading." },
    { name: "reconnecting", kind: "property", summary: "Whether Tor is restarting." },
    { name: "info", kind: "property", summary: "Safe displayed exit-node information." },
    { name: "note", kind: "property", summary: "The latest displayed Tor status note." },
    { name: "buttons", kind: "property", summary: "Visible closing buttons." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible closing button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog." },
] as const;
const AI_VISION = descriptor("TorInfoDialog", "A Tor connection information dialog.", MEMBERS);

export class TorInfoDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    get title(): string { return "Tor connection"; }
    // Mirrors TorInfoDialogView.ts:104-106 and :130.
    get message(): string {
        return "Reconnecting restarts Tor for every open Tor page. A new circuit does not always mean a different exit node.";
    }
    get partition(): string { return dialogState<TorInfoDialogState>(this.entry).partition; }
    get loading(): boolean { return dialogState<TorInfoDialogState>(this.entry).loading; }
    get reconnecting(): boolean { return dialogState<TorInfoDialogState>(this.entry).reconnecting; }
    get info(): TorInfoDialogState["info"] { return dialogState<TorInfoDialogState>(this.entry).info; }
    get note(): string { return dialogState<TorInfoDialogState>(this.entry).note; }
    get buttons(): readonly string[] { return ["Close"]; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        requireButton(this.buttons, button);
        return await closeWithResult(this.entry, undefined);
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
