import { commitDialogId } from "../../../ui/dialogs/CommitDialog";
import { confirmationDialogId } from "../../../ui/dialogs/ConfirmationDialog";
import { createBoardDialogId } from "../../../ui/dialogs/CreateBoardDialog";
import { createBoardVarsStorageDialogId } from "../../../ui/dialogs/CreateBoardVarsStorageDialog";
import { inputDialogId } from "../../../ui/dialogs/InputDialog";
import { librarySetupDialogId } from "../../../ui/dialogs/LibrarySetupDialog";
import { namespaceCollisionDialogId } from "../../../ui/dialogs/NamespaceCollisionDialog";
import { openUrlDialogId } from "../../../ui/dialogs/OpenUrlDialog";
import { passwordDialogId } from "../../../ui/dialogs/PasswordDialog";
import { registerToolsetDialogId } from "../../../ui/dialogs/RegisterToolsetDialog";
import { textDialogId } from "../../../ui/dialogs/TextDialog";
import { torInfoDialogId } from "../../../ui/dialogs/TorInfoDialog";
import { trustBoardDialogId } from "../../../ui/dialogs/TrustBoardDialog";
import { dialogsState } from "../../../ui/dialogs/DialogsView";
import type { IAiChild, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";
import { CommitDialogAdapter } from "./commit";
import { ConfirmationDialogAdapter } from "./confirmation";
import { CreateBoardDialogAdapter } from "./create-board";
import { CreateBoardVarsStorageDialogAdapter } from "./create-board-vars-storage";
import { InputDialogAdapter } from "./input";
import { LibrarySetupDialogAdapter } from "./library-setup";
import { NamespaceCollisionDialogAdapter } from "./namespace-collision";
import { OpenUrlDialogAdapter } from "./open-url";
import { PasswordDialogAdapter } from "./password";
import { RegisterToolsetDialogAdapter } from "./register-toolset";
import { TextDialogAdapter } from "./text";
import { TorInfoDialogAdapter } from "./tor-info";
import { TrustBoardDialogAdapter } from "./trust-board";
import type { DialogAdapter, DialogEntry } from "./shared";

type AdapterFactory = (entry: DialogEntry) => DialogAdapter;

const adapterFactories = new Map<symbol, AdapterFactory>([
    [confirmationDialogId as unknown as symbol, (entry) => new ConfirmationDialogAdapter(entry)],
    [inputDialogId as unknown as symbol, (entry) => new InputDialogAdapter(entry)],
    [textDialogId as unknown as symbol, (entry) => new TextDialogAdapter(entry)],
    [passwordDialogId as unknown as symbol, (entry) => new PasswordDialogAdapter(entry)],
    [commitDialogId as unknown as symbol, (entry) => new CommitDialogAdapter(entry)],
    [createBoardDialogId as unknown as symbol, (entry) => new CreateBoardDialogAdapter(entry)],
    [createBoardVarsStorageDialogId as unknown as symbol, (entry) => new CreateBoardVarsStorageDialogAdapter(entry)],
    [librarySetupDialogId as unknown as symbol, (entry) => new LibrarySetupDialogAdapter(entry)],
    [namespaceCollisionDialogId as unknown as symbol, (entry) => new NamespaceCollisionDialogAdapter(entry)],
    [openUrlDialogId as unknown as symbol, (entry) => new OpenUrlDialogAdapter(entry)],
    [registerToolsetDialogId as unknown as symbol, (entry) => new RegisterToolsetDialogAdapter(entry)],
    [torInfoDialogId as unknown as symbol, (entry) => new TorInfoDialogAdapter(entry)],
    [trustBoardDialogId as unknown as symbol, (entry) => new TrustBoardDialogAdapter(entry)],
]);

const MEMBERS: IAiVisionDescriptor["members"] = [];

/** A live, side-effect-free view of the renderer's modal dialog stack. */
export class DialogsNode {
    private readonly adapters = new WeakMap<DialogEntry, DialogAdapter>();

    private getAdapter(entry: DialogEntry): DialogAdapter {
        const cached = this.adapters.get(entry);
        if (cached) return cached;
        const factory = adapterFactories.get(entry.viewId as unknown as symbol);
        if (!factory) throw new Error(`No dialog adapter for ${entry.viewId.toString()}.`);
        const adapter = factory(entry);
        this.adapters.set(entry, adapter);
        return adapter;
    }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "Dialogs",
            summary: "Open renderer dialogs indexed in live display order.",
            members: MEMBERS,
            help: "dialogs[i] is a live dialog adapter. Read its safe fields, then use click(button) or cancel() to answer it.",
            children: () => this.children(),
            index: (key) => this.index(key),
        };
    }

    children(): readonly IAiChild[] {
        return dialogsState.get().map((entry, index) => {
            const adapter = this.getAdapter(entry);
            return {
                segment: `[${index}]`,
                kind: adapter.aiVision.kind,
                summary: adapter.aiVision.summary,
            };
        });
    }

    index(key: string | number): DialogAdapter | undefined {
        const index = typeof key === "number" ? key : Number(key);
        if (!Number.isInteger(index) || index < 0) return undefined;
        const entry = dialogsState.get()[index];
        return entry ? this.getAdapter(entry) : undefined;
    }
}

export type { DialogAdapter } from "./shared";
