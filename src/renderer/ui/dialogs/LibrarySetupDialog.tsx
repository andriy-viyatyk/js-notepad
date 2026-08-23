import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { fs } from "../../api/fs";
import { settings } from "../../api/settings";
import { ui } from "../../api/ui";
import { copyExampleScripts } from "../../api/library-service";
import { api } from "../../../ipc/renderer/api";
import { showDialog } from "./Dialogs";
import { registerDialogView } from "./dialog-view-registry";
import { LibrarySetupDialogView } from "./LibrarySetupDialogView";
import { errMessage } from "../../../shared/utils";

export const librarySetupDialogId = Symbol("librarySetupDialog");

export interface LibrarySetupDialogProps {
    title?: string;
}

export interface LibrarySetupDialogState extends LibrarySetupDialogProps {
    folderPath: string;
    copyExamples: boolean;
    linking: boolean;
}

const defaultProps: LibrarySetupDialogState = {
    title: "Link Script Library",
    folderPath: "",
    copyExamples: true,
    linking: false,
};

export class LibrarySetupDialogModel extends TDialogModel<LibrarySetupDialogState, string | undefined> {
    private viewDisposed = false;

    setFolderPath = (folderPath: string) => {
        this.state.update((state) => { state.folderPath = folderPath; });
    };

    setCopyExamples = (copyExamples: boolean) => {
        this.state.update((state) => { state.copyExamples = copyExamples; });
    };

    browse = async () => {
        const result = await api.showOpenFolderDialog({
            title: "Select Script Library Folder",
        });
        if (this.viewDisposed) return;
        if (result && result.length > 0) this.setFolderPath(result[0]);
    };

    link = async () => {
        const trimmed = this.state.get().folderPath.trim();
        if (!trimmed || this.state.get().linking) return;
        const copyExamples = this.state.get().copyExamples;

        this.state.update((state) => { state.linking = true; });
        try {
            if (!await fs.exists(trimmed)) {
                await fs.mkdir(trimmed);
            }
            if (this.viewDisposed) return;

            if (copyExamples) {
                await copyExampleScripts(trimmed);
            }
            if (this.viewDisposed) return;

            settings.set("script-library.path", trimmed);
            await this.close(trimmed);
        } catch (error) {
            if (this.viewDisposed) return;
            ui.notify(`Failed to link library: ${errMessage(error)}`, "error");
            this.state.update((state) => { state.linking = false; });
        }
    };

    handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            void this.close(undefined);
        }
        if (event.key === "Enter" && this.state.get().folderPath.trim()) {
            event.preventDefault();
            void this.link();
        }
    };

    disposeView = () => {
        this.viewDisposed = true;
    };
}

registerDialogView(librarySetupDialogId, LibrarySetupDialogView);

export function showLibrarySetupDialog(props?: LibrarySetupDialogProps): Promise<string | undefined> {
    const model = new LibrarySetupDialogModel(
        new TComponentState({
            ...defaultProps,
            ...props,
        }),
    );
    return showDialog({
        viewId: librarySetupDialogId,
        model,
    }) as Promise<string | undefined>;
}
