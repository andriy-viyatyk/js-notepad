import { PageDragData } from "../shared/types";
import { openWindows } from "./open-windows";

class DragModel {
    dragEvents: PageDragData[] = [];
    timer: any = null;

    addDragEvent = async (event: PageDragData) => {
        this.dragEvents.push(event);
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(this.processedEvents, 100);
    }

    private processedEvents = () => {
        const sourceWindowIndex = this.dragEvents.find(e => e.sourceWindowIndex !== undefined)?.sourceWindowIndex;
        const targetWindowIndex = this.dragEvents.find(e => e.targetWindowIndex !== undefined)?.targetWindowIndex;
        const page = this.dragEvents.find(e => e.sourceWindowIndex !== undefined)?.page;
        const dropPosition = this.dragEvents.find(e => e.dropPosition !== undefined)?.dropPosition;
        const targetPageId = this.dragEvents.find(e => e.targetWindowIndex !== undefined)?.page?.id;

        if (sourceWindowIndex !== undefined && page) {
            openWindows.movePageToWindow(
                sourceWindowIndex,
                targetWindowIndex,
                page,
                targetPageId,
                dropPosition,
            );
        }

        this.dragEvents = [];
    }
}

export const dragModel = new DragModel();