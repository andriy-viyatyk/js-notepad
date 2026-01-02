import { parseObject } from "../common/parseUtils";
import { showPopupMenu } from "../dialogs/poppers/showPopupMenu";
import { api } from "../ipc/renderer/api";
import { filesModel } from "../model/files-model";

export const configureApp = () => {
    document.addEventListener("contextmenu", (e) => {
        showPopupMenu(e.clientX, e.clientY, e.menuItems || []);
        e.preventDefault();
    });

    document.addEventListener("dragover", (e) => {
        const types = e.dataTransfer?.types || [];
        if (types.includes('application/js-notepad-tab')) {
            e.dataTransfer.dropEffect = 'move';
        }
    });

    document.addEventListener("drop", (e) => {
        const dataStr = e.dataTransfer?.getData('application/js-notepad-tab');
        const data = parseObject(dataStr);
        if (data && data.sourceWindowIndex !== undefined && data.sourceWindowIndex !== filesModel.windowIndex) {
            api.addDragEvent({ targetWindowIndex: filesModel.windowIndex });
        }
    });
};
