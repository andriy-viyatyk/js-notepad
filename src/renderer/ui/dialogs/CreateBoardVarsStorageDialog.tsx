import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { settings } from "../../api/settings";
import { errMessage } from "../../../shared/utils";
import { showDialog } from "./Dialogs";
import { registerDialogView } from "./dialog-view-registry";
import { CreateBoardVarsStorageDialogView } from "./CreateBoardVarsStorageDialogView";

export const createBoardVarsStorageDialogId = Symbol("createBoardVarsStorageDialog");

/** `true` on Create, `undefined`/`false` on Cancel/Esc/X. */
export type CreateBoardVarsStorageResult = boolean | undefined;

export interface CreateBoardVarsStorageDialogState {
    path: string;
    /** Transient — a create is in flight; guards double-submit and disables Create. */
    creating: boolean;
}

class CreateBoardVarsStorageDialogModel extends TDialogModel<
    CreateBoardVarsStorageDialogState,
    CreateBoardVarsStorageResult
> {
    private viewDisposed = false;

    handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            void this.close(undefined);
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            void this.submit();
        }
    };

    setPath = (value: string) => this.state.update((state) => { state.path = value; });

    browse = async () => {
        const state = this.state.get();
        const picked = await fs.showSaveDialog({
            title: "Environment variables file",
            defaultPath: state.path.trim() || undefined,
            filters: [
                { name: "Env JSON", extensions: ["env.json"] },
                { name: "JSON", extensions: ["json"] },
            ],
        });
        if (this.viewDisposed) return;
        if (picked) this.setPath(picked);
    };

    /** Create-on-click: write an empty store if needed, save the setting, and close on success. */
    submit = async () => {
        const state = this.state.get();
        if (state.creating) return;
        const path = state.path.trim();
        if (!path) return;
        this.state.update((draft) => { draft.creating = true; });
        try {
            if (!(await fs.exists(path))) {
                await fs.write(path, "{}\n");
            }
            if (this.viewDisposed) return;
            settings.set("board-vars.file", path);
            await this.close(true);
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

registerDialogView(createBoardVarsStorageDialogId, CreateBoardVarsStorageDialogView);

/** Shows the create-storage dialog, defaulting to the currently-configured `board-vars.file`
 *  path if one is set, or the Persephone data folder otherwise. */
export async function showCreateBoardVarsStorageDialog(): Promise<boolean> {
    const defaultPath = settings.get("board-vars.file") || (await fs.dataFileName("board-vars.env.json"));
    const model = new CreateBoardVarsStorageDialogModel(
        new TComponentState({
            path: defaultPath,
            creating: false,
        }),
    );
    const result = await showDialog({
        viewId: createBoardVarsStorageDialogId,
        model,
    });
    return result === true;
}
