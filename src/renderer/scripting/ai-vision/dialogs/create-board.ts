import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { CreateBoardDialogState } from "../../../ui/dialogs/CreateBoardDialog";
import { cancelDialog, descriptor, dialogState, modelWith, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

interface CreateBoardModel { submit(): Promise<void>; }

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "template", kind: "property", summary: "The board template to create." },
    { name: "folder", kind: "property", summary: "The parent folder." },
    { name: "name", kind: "property", summary: "The new board name." },
    { name: "creating", kind: "property", summary: "Whether board creation is in progress." },
    { name: "buttons", kind: "property", summary: "Visible response buttons." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible response button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog without creating a board." },
] as const;
const AI_VISION = descriptor("CreateBoardDialog", "A board creation dialog awaiting a response.", MEMBERS);

export class CreateBoardDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    private get state(): CreateBoardDialogState { return dialogState<CreateBoardDialogState>(this.entry); }
    get title(): string { return this.state.title; }
    get message(): undefined { return undefined; }
    get template(): string { return this.state.template; }
    get folder(): string { return this.state.folder; }
    get name(): string { return this.state.name; }
    get creating(): boolean { return this.state.creating; }
    get buttons(): readonly string[] { return ["Cancel", "Create"]; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        requireButton(this.buttons, button);
        if (button === "Cancel") return this.cancel();
        if (this.state.creating || !this.state.folder.trim() || !this.state.name.trim()) {
            throw new Error(`Dialog button ${JSON.stringify(button)} is disabled.`);
        }
        await modelWith<CreateBoardModel>(this.entry).submit();
        return undefined;
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
