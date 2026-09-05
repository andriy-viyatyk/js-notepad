import type { IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import { actionButtonLabel, type CommitDialogModel, type CommitDialogProps } from "../../../ui/dialogs/CommitDialog";
import { cancelDialog, descriptor, dialogState, modelWith, requireButton, type DialogAdapter, type DialogEntry } from "./shared";

const MEMBERS = [
    { name: "title", kind: "property", summary: "The dialog title." },
    { name: "branch", kind: "property", summary: "The target branch." },
    { name: "message", kind: "property", summary: "The commit message." },
    { name: "name", kind: "property", summary: "The commit author name." },
    { name: "email", kind: "property", summary: "The commit author email." },
    { name: "buttons", kind: "property", summary: "Visible response buttons." },
    { name: "committing", kind: "property", summary: "Whether a commit is in progress." },
    { name: "click", kind: "method", signature: "click(button: string)", summary: "Click an exact visible response button." },
    { name: "cancel", kind: "method", signature: "cancel()", summary: "Dismiss the dialog without selecting a response." },
] as const;
const AI_VISION = descriptor("CommitDialog", "A commit dialog awaiting a response.", MEMBERS);

export class CommitDialogAdapter implements DialogAdapter {
    constructor(public readonly entry: DialogEntry) {}

    private get state(): CommitDialogProps { return dialogState<CommitDialogProps>(this.entry); }
    private get model(): CommitDialogModel { return modelWith<CommitDialogModel>(this.entry); }

    get title(): string | undefined { return this.state.title; }
    get message(): string { return this.state.message ?? ""; }
    get branch(): string { return this.state.branch ?? ""; }
    get name(): string { return this.state.name ?? ""; }
    get email(): string { return this.state.email ?? ""; }
    get buttons(): readonly string[] {
        const state = this.state;
        const branchChanged = !!state.branch?.trim() && state.branch.trim() !== (state.originalBranch ?? "");
        return (state.buttons ?? ["Commit", "Cancel"]).map((button) =>
            button === "Cancel" ? button : actionButtonLabel(button, branchChanged),
        );
    }
    get committing(): boolean { return !!this.state.committing; }
    get aiVision(): IAiVisionDescriptor { return AI_VISION; }

    async click(button: string): Promise<unknown> {
        const state = this.state;
        const visibleButtons = this.buttons;
        requireButton(visibleButtons, button);
        if (button === "Cancel") return this.cancel();
        if (state.committing || !state.message?.trim() || !state.branch?.trim()) {
            throw new Error(`Dialog button ${JSON.stringify(button)} is disabled.`);
        }
        const branchChanged = !!state.branch.trim() && state.branch.trim() !== (state.originalBranch ?? "");
        const underlyingButton = (state.buttons ?? ["Commit", "Cancel"]).find((candidate) =>
            actionButtonLabel(candidate, branchChanged) === button,
        );
        if (!underlyingButton || underlyingButton === "Cancel") {
            throw new Error(`Dialog button ${JSON.stringify(button)} is unavailable.`);
        }
        await this.model.submit(underlyingButton);
        return undefined;
    }

    cancel(): Promise<undefined> { return cancelDialog(this.entry); }
}
