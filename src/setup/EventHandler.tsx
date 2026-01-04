import { useEffect } from "react";
import { TModel, useModel } from "../common/classes/model";
import { TComponentState } from "../common/classes/state";
import { showPopupMenu } from "../dialogs/poppers/showPopupMenu";
import { parseObject } from "../common/parseUtils";
import { filesModel } from "../model/files-model";
import { api } from "../ipc/renderer/api";
import { alertError } from "../dialogs/alerts/AlertsBar";

class EventHandlerModel extends TModel<null> {
    init = () => {
        document.addEventListener("contextmenu", this.handleContextMenu);
        document.addEventListener("dragover", this.handleDragOver);
        document.addEventListener("drop", this.handleDrop);
        window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
    }

    dispose = () => {
        document.removeEventListener("contextmenu", this.handleContextMenu);
        document.removeEventListener("dragover", this.handleDragOver);
        document.removeEventListener("drop", this.handleDrop);
        window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
    }

    private handleContextMenu = (e: PointerEvent) => {
        showPopupMenu(e.clientX, e.clientY, e.menuItems || []);
        e.preventDefault();
    }

    private handleDragOver = (e: DragEvent) => {
        const types = e.dataTransfer?.types || [];
        if (types.includes('application/js-notepad-tab')) {
            e.dataTransfer.dropEffect = 'move';
        }
    }

    private handleDrop = (e: DragEvent) => {
        const dataStr = e.dataTransfer?.getData('application/js-notepad-tab');
        const data = parseObject(dataStr);
        if (data && data.sourceWindowIndex !== undefined && data.sourceWindowIndex !== filesModel.windowIndex) {
            api.addDragEvent({ targetWindowIndex: filesModel.windowIndex });
        }
    }

    private handleUnhandledRejection = (e: PromiseRejectionEvent) => {
        alertError(`'Unhandled promise rejection:', ${e.reason}`);
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