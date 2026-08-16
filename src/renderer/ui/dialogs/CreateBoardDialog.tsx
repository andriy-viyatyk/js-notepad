import { useEffect, useRef } from "react";

import { Dialog, DialogContent, Panel, Text, Button, Input } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { TComponentState } from "../../core/state/state";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { fpJoin } from "../../core/utils/file-path";
import { createBoardFromTemplate } from "../../editors/board/board-scaffold";
import { showDialog } from "./Dialogs";
import { errMessage } from "../../../shared/utils";

const createBoardDialogId = Symbol("createBoardDialog");

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

interface CreateBoardDialogState {
    title: string;
    template: string;
    folder: string;
    name: string;
    /** Transient — a create is in flight; guards double-submit and disables Create. */
    creating: boolean;
}

class CreateBoardDialogModel extends TDialogModel<CreateBoardDialogState, CreateBoardResult> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(undefined);
            return;
        }
        // Single-line inputs → plain Enter submits.
        if (e.key === "Enter") {
            e.preventDefault();
            void this.submit();
        }
    };

    setFolder = (v: string) => this.state.update((s) => { s.folder = v; });
    setName = (v: string) => this.state.update((s) => { s.name = v; });

    browse = async () => {
        const s = this.state.get();
        const picked = await fs.showFolderDialog({
            title: "Choose board location",
            defaultPath: s.folder.trim() || undefined, // C8: no defaultPath when empty
        });
        if (picked && picked[0]) this.setFolder(picked[0]);
    };

    /** Create-on-click: scaffold, close on success; on failure toast + stay open so the user can
     *  fix the folder/name and retry. Guards double-submit via `creating`. No name/path
     *  pre-validation — both-inputs-non-empty is the only gate; everything else (collision,
     *  illegal folder name) fails inside `createBoardFromTemplate` and surfaces as the toast. */
    submit = async () => {
        const s = this.state.get();
        if (s.creating) return;
        const folder = s.folder.trim();
        const name = s.name.trim();
        if (!folder || !name) return; // Create is disabled in this state anyway
        this.state.update((d) => { d.creating = true; });
        try {
            const root = await createBoardFromTemplate(name, folder, s.template);
            await this.close(root); // success → resolve the new board root
        } catch (err) {
            ui.notify(errMessage(err), "error");
            this.state.update((d) => { d.creating = false; }); // stay open for fix-and-retry
        }
    };
}

function CreateBoardDialog({ model }: ViewPropsRO<CreateBoardDialogModel>) {
    const state = model.state.use();
    const folderRef = useRef<HTMLInputElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);

    // Focus the name input when a folder is already known (the common case — the user just types
    // a name); otherwise focus the folder input.
    useEffect(() => {
        const hasFolder = !!model.state.get().folder.trim();
        setTimeout(() => {
            (hasFolder ? nameRef.current : folderRef.current)?.focus();
        }, 0);
    }, [model]);

    const folder = state.folder.trim();
    const name = state.name.trim();
    const canCreate = !!folder && !!name && !state.creating;

    return (
        <Dialog name="create-board-dialog" onKeyDown={model.handleKeyDown} autoFocus={false}>
            <DialogContent
                title={state.title}
                icon="board"
                onClose={() => model.close(undefined)}
                width={520}
            >
                <Panel direction="column" paddingX="xxl" paddingTop="xl" paddingBottom="sm" gap="md">
                    <Panel direction="row" gap="sm" align="center">
                        <Text color="light" nowrap>Folder:</Text>
                        <Panel flex={1}>
                            <Input
                                name="create-board-folder"
                                ref={folderRef}
                                value={state.folder}
                                onChange={model.setFolder}
                                invalid={!folder}
                                placeholder="Board location"
                            />
                        </Panel>
                        <Button
                            name="create-board-browse"
                            icon="folder-open"
                            onClick={() => void model.browse()}
                        >
                            Browse…
                        </Button>
                    </Panel>

                    <Panel direction="row" gap="sm" align="center">
                        <Text color="light" nowrap>Name:</Text>
                        <Panel flex={1}>
                            <Input
                                name="create-board-name"
                                ref={nameRef}
                                value={state.name}
                                onChange={model.setName}
                                invalid={!name}
                                placeholder="Board name (becomes the folder name)"
                            />
                        </Panel>
                    </Panel>

                    {!!folder && !!name && (
                        <Text color="light">Will be created at: {fpJoin(folder, name)}</Text>
                    )}
                </Panel>

                <Panel direction="row" justify="end" gap="sm" padding="md">
                    <Button name="create-board-cancel" onClick={() => model.close(undefined)}>
                        Cancel
                    </Button>
                    <Button
                        name="create-board-submit"
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

Views.registerView(createBoardDialogId, CreateBoardDialog as DefaultView);

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
