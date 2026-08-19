import { BaseEvent } from "./BaseEvent";
export { ContextMenuEvent, type ContextMenuTargetKind } from "../../core/events/context-menu";

/** Bookmark event — fired before the Add/Edit Bookmark dialog opens. */
export class BookmarkEvent extends BaseEvent {
    constructor(
        public title: string,
        public href: string,
        public discoveredImages: string[],
        public imgSrc: string,
        public category: string,
        public tags: string[],
        public readonly isEdit: boolean,
    ) {
        super();
    }
}
