import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import type { EditLinkDialogModel } from "../../../editors/link-editor/EditLinkDialog";
import { cancelDialog, descriptor, dialogState, modelWith, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

type EditLinkDialogState = ReturnType<EditLinkDialogModel["state"]["get"]>;

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "linkTitle", kind: "property", summary: "The current link title." },
    { name: "href", kind: "property", summary: "The current link URL." },
    { name: "category", kind: "property", summary: "The current link category." },
    { name: "tags", kind: "property", summary: "The current link tags." },
    { name: "imgSrc", kind: "property", summary: "The current image URL." },
    { name: "target", kind: "property", summary: "The selected target editor." },
    { name: "buttons", kind: "property", summary: "Visible response buttons." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible response button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog without saving." },
] as const;
const AI_VISION = descriptor("EditLinkDialog", "A link editor dialog awaiting a response.", MEMBERS);

interface EditLinkModel {
    save(): void;
}

export class EditLinkDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    get title(): string { return dialogState<EditLinkDialogState>(this.entry).dialogTitle; }
    get linkTitle(): string { return dialogState<EditLinkDialogState>(this.entry).linkTitle; }
    get href(): string { return dialogState<EditLinkDialogState>(this.entry).href; }
    get category(): string { return dialogState<EditLinkDialogState>(this.entry).category; }
    get tags(): readonly string[] { return dialogState<EditLinkDialogState>(this.entry).tags; }
    get imgSrc(): string { return dialogState<EditLinkDialogState>(this.entry).imgSrc; }
    get target(): string { return dialogState<EditLinkDialogState>(this.entry).target; }
    get buttons(): readonly string[] { return ["Cancel", "Save"]; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        requireButton(this.buttons, button);
        if (button === "Cancel") return this.cancel();
        modelWith<EditLinkModel>(this.entry).save();
        return undefined;
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
