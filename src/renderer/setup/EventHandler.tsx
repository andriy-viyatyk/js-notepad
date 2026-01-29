import { useEffect } from "react";
import { TModel, useModel } from "../common/classes/model";
import { TComponentState } from "../common/classes/state";
import { showAppPopupMenu } from "../dialogs/poppers/showPopupMenu";
import { parseObject } from "../common/parseUtils";
import { filesModel } from "../model/files-model";
import { api } from "../../ipc/renderer/api";
import { alertError } from "../dialogs/alerts/AlertsBar";
import { scriptRunner } from "../script/ScriptRunner";
import { nodeUtils } from "../common/node-utils";
import { RendererEvent } from "../../ipc/api-types";

class EventHandlerModel extends TModel<null> {
    init = () => {
        document.addEventListener("contextmenu", this.handleContextMenu);
        document.addEventListener("dragover", this.handleDragOver);
        document.addEventListener("drop", this.captureDrop, true);
        document.addEventListener("drop", this.handleDrop);
        window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
    }

    dispose = () => {
        document.removeEventListener("contextmenu", this.handleContextMenu);
        document.removeEventListener("dragover", this.handleDragOver);
        document.removeEventListener("drop", this.captureDrop, true);
        document.removeEventListener("drop", this.handleDrop);
        window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
    }

    private handleContextMenu = (e: PointerEvent) => {
        showAppPopupMenu(e.clientX, e.clientY, e.menuItems || []);
        e.preventDefault();
    }

    private handleDragOver = (e: DragEvent) => {
        const types = e.dataTransfer?.types || [];
        if (types.includes('application/js-notepad-tab')) {
            e.dataTransfer.dropEffect = 'move';
        }
        e.preventDefault();
        e.stopPropagation();
    }

    private handleDrop = (e: DragEvent) => {
        const dataStr = e.dataTransfer?.getData('application/js-notepad-tab');
        const data = parseObject(dataStr);
        if (data && data.sourceWindowIndex !== undefined && data.sourceWindowIndex !== filesModel.windowIndex) {
            api.addDragEvent({ targetWindowIndex: filesModel.windowIndex });
        }
    }

    private captureDrop = (e: DragEvent) => {
        let filePath: string | undefined = undefined;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];

            try {
                filePath = window.electron.getPathForFile(file);
            } catch (error) {
                console.error("Error getting file path:", error);
            }
        }

        if (!filePath) {
            const textData = e.dataTransfer.getData("text/plain");
            filePath = textData?.split("\n")[0]?.trim();
        }

        if (filePath && nodeUtils.fileExists(filePath)) {
            e.preventDefault();
            e.stopPropagation();
            window.electron.ipcRenderer.sendMessage(RendererEvent.fileDropped, filePath);
        }
    }

    private handleUnhandledRejection = (e: PromiseRejectionEvent) => {
        if (scriptRunner.handlePromiseException) {
            alertError(`'Unhandled promise rejection:', ${e.reason}`);
        }
    }
}

export function EventHandler({ children }: { children?: React.ReactNode}) {
    const model = useModel(EventHandlerModel, TComponentState, null);

    useEffect(() => {
        model.init();
        return () => {
            model.dispose();
        };
    }, [model]);

    return <>{children}</>;
}