import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { createBoardFromTemplate } from "../../editors/board/board-scaffold";
import { errMessage } from "../../../shared/utils";
import { showDialog } from "./Dialogs";
import { registerDialogView } from "./dialog-view-registry";
import { CreateBoardDialogView } from "./CreateBoardDialogView";

export const createBoardDialogId = Symbol("createBoardDialog");

export interface CreateBoardDialogProps {
    /** Dialog title — lets the two entry points read "Create board" vs "Create Demo board".
     *  Default "Create board". */
    title?: string;
    /** Which bundled template to scaffold. "board-template" (blank) | "demo-board".
     *  Default "board-template". */
    template?: string;
    /** Initial folder (the Explorer root when one is open; C8 — omit when none, so both the
     *  input and the Browse dialog's defaultPath start empty). */
    defaultFolder?: string;
    /** Initial board name (e.g. "Demo" for the Demo entry point). Default "". */
    defaultName?: string;
}

/** Resolved with the created board's absolute root on success; `undefined` on Cancel/Esc/X.
 *  The caller opens the returned root (e.g. via persephone-board:// with its pageId). */
export type CreateBoardResult = string | undefined;

export interface CreateBoardDialogState {
    title: string;
    template: string;
    folder: string;
    name: string;
    /** Transient — a create is in flight; guards double-submit and disables Create. */
    creating: boolean;
}

class CreateBoardDialogModel extends TDialogModel<CreateBoardDialogState, CreateBoardResult> {
    private viewDisposed = false;

    handleKeyDown = (event: KeyboardEvent) => {
        // Single-line inputs → plain Enter submits.
        if (event.key === "Enter") {
            event.preventDefault();
            void this.submit();
        }
    };

    setFolder = (value: string) => this.state.update((state) => { state.folder = value; });
    setName = (value: string) => this.state.update((state) => { state.name = value; });

    browse = async () => {
        const state = this.state.get();
        const picked = await fs.showFolderDialog({
            title: "Choose board location",
            defaultPath: state.folder.trim() || undefined,
        });
        if (this.viewDisposed) return;
        if (picked && picked[0]) this.setFolder(picked[0]);
    };

    /** Create-on-click: scaffold, close on success; on failure toast + stay open so the user can
     *  fix the folder/name and retry. Guards double-submit via `creating`. */
    submit = async () => {
        const state = this.state.get();
        if (state.creating) return;
        const folder = state.folder.trim();
        const name = state.name.trim();
        if (!folder || !name) return;
        this.state.update((draft) => { draft.creating = true; });
        try {
            const root = await createBoardFromTemplate(name, folder, state.template);
            if (this.viewDisposed) return;
            await this.close(root);
        } catch (error) {
            if (this.viewDisposed) return;
            ui.notify(errMessage(error), "error");
            this.state.update((draft) => { draft.creating = false; });
        }
    };

    disposeView = () => {
        this.viewDisposed = true;
    };
}

registerDialogView(createBoardDialogId, CreateBoardDialogView);

export function showCreateBoardDialog(props?: CreateBoardDialogProps): Promise<CreateBoardResult> {
    const model = new CreateBoardDialogModel(
        new TComponentState({
            title: props?.title ?? "Create board",
            template: props?.template ?? "board-template",
            folder: props?.defaultFolder ?? "",
            name: props?.defaultName ?? "",
            creating: false,
        }),
    );
    return showDialog({
        viewId: createBoardDialogId,
        model,
    }) as Promise<CreateBoardResult>;
}
