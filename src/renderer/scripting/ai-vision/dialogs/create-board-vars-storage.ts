import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { CreateBoardVarsStorageDialogState } from "../../../ui/dialogs/CreateBoardVarsStorageDialog";
import { cancelDialog, descriptor, dialogState, modelWith, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

interface CreateBoardVarsStorageModel { submit(): Promise<void>; }

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "path", kind: "property", summary: "The environment variables file path." },
    { name: "creating", kind: "property", summary: "Whether storage creation is in progress." },
    { name: "buttons", kind: "property", summary: "Visible response buttons." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible response button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog without creating storage." },
] as const;
const AI_VISION = descriptor("CreateBoardVarsStorageDialog", "An environment variables storage dialog awaiting a response.", MEMBERS);

export class CreateBoardVarsStorageDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    private get state(): CreateBoardVarsStorageDialogState { return dialogState<CreateBoardVarsStorageDialogState>(this.entry); }
    get title(): string { return "Create environment variables storage"; }
    get message(): undefined { return undefined; }
    get path(): string { return this.state.path; }
    get creating(): boolean { return this.state.creating; }
    get buttons(): readonly string[] { return ["Cancel", "Create"]; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        requireButton(this.buttons, button);
        if (button === "Cancel") return this.cancel();
        if (this.state.creating || !this.state.path.trim()) {
            throw new Error(`Dialog button ${JSON.stringify(button)} is disabled.`);
        }
        await modelWith<CreateBoardVarsStorageModel>(this.entry).submit();
        return undefined;
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
