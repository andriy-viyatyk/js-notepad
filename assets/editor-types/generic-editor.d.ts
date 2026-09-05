import type { IGenericEditorId } from "./page";

/** Identity-only facade for a registered editor without scripting operations yet. */
export interface IGenericEditor {
    readonly kind: "Editor";
    readonly id: IGenericEditorId;
    readonly name: string;
}
