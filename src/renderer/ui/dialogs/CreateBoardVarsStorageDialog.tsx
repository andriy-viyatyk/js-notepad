import { useEffect, useRef } from "react";

import { Dialog, DialogContent, Panel, Text, Button, Input } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { TComponentState } from "../../core/state/state";
import { LockIcon, FolderOpenIcon } from "../../theme/icons";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { settings } from "../../api/settings";
import { showDialog } from "./Dialogs";
import { errMessage } from "../../../shared/utils";

const createBoardVarsStorageDialogId = Symbol("createBoardVarsStorageDialog");

/** `true` on Create, `undefined`/`false` on Cancel/Esc/X. */
export type CreateBoardVarsStorageResult = boolean | undefined;

interface CreateBoardVarsStorageDialogState {
    path: string;
    /** Transient — a create is in flight; guards double-submit and disables Create. */
    creating: boolean;
}

class CreateBoardVarsStorageDialogModel extends TDialogModel<
    CreateBoardVarsStorageDialogState,
    CreateBoardVarsStorageResult
> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(undefined);
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            void this.submit();
        }
    };

    setPath = (v: string) => this.state.update((s) => { s.path = v; });

    browse = async () => {
        const s = this.state.get();
        const picked = await fs.showSaveDialog({
            title: "Environment variables file",
            defaultPath: s.path.trim() || undefined,
            filters: [
                { name: "Env JSON", extensions: ["env.json"] },
                { name: "JSON", extensions: ["json"] },
            ],
        });
        if (picked) this.setPath(picked);
    };

    /** Create-on-click: write an empty store (if none exists yet at that path), point the
     *  `board-vars.file` setting at it, close on success. On failure, toast + stay open so the
     *  user can fix the path and retry. */
    submit = async () => {
        const s = this.state.get();
        if (s.creating) return;
        const path = s.path.trim();
        if (!path) return; // Create is disabled in this state anyway
        this.state.update((d) => { d.creating = true; });
        try {
            if (!(await fs.exists(path))) {
                await fs.write(path, "{}\n");
            }
            settings.set("board-vars.file", path);
            await this.close(true);
        } catch (err) {
            ui.notify(errMessage(err), "error");
            this.state.update((d) => { d.creating = false; });
        }
    };
}

function CreateBoardVarsStorageDialog({ model }: ViewPropsRO<CreateBoardVarsStorageDialogModel>) {
    const state = model.state.use();
    const pathRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setTimeout(() => pathRef.current?.focus(), 0);
    }, []);

    const path = state.path.trim();
    const canCreate = !!path && !state.creating;

    return (
        <Dialog name="create-board-vars-storage-dialog" onKeyDown={model.handleKeyDown} autoFocus={false}>
            <DialogContent
                title="Create environment variables storage"
                icon={<LockIcon />}
                onClose={() => model.close(undefined)}
                width={520}
            >
                <Panel direction="column" paddingX="xxl" paddingTop="xl" paddingBottom="sm" gap="md">
                    <Text color="light">
                        Boards read/write their variables (connection strings, keys, passwords) from this
                        file — kept outside board folders, so copying or sharing a board never leaks them.
                    </Text>
                    <Panel direction="row" gap="sm" align="center">
                        <Text color="light" nowrap>Path:</Text>
                        <Panel flex={1}>
                            <Input
                                name="create-board-vars-storage-path"
                                ref={pathRef}
                                value={state.path}
                                onChange={model.setPath}
                                invalid={!path}
                                placeholder="Environment variables file path"
                            />
                        </Panel>
                        <Button
                            name="create-board-vars-storage-browse"
                            icon={<FolderOpenIcon />}
                            onClick={() => void model.browse()}
                        >
                            Browse…
                        </Button>
                    </Panel>
                </Panel>

                <Panel direction="row" justify="end" gap="sm" padding="md">
                    <Button name="create-board-vars-storage-cancel" onClick={() => model.close(undefined)}>
                        Cancel
                    </Button>
                    <Button
                        name="create-board-vars-storage-submit"
                        variant="primary"
                        disabled={!canCreate}
                        onClick={() => void model.submit()}
                    >
                        Create
                    </Button>
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(createBoardVarsStorageDialogId, CreateBoardVarsStorageDialog as DefaultView);

/** Shows the create-storage dialog, defaulting to the currently-configured `board-vars.file`
 *  path if one is set, or the Persephone data folder otherwise. Resolves `true` when the store
 *  was created/re-pointed and the `board-vars.file` setting saved, `false`/`undefined` on
 *  Cancel/Esc/X. */
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
