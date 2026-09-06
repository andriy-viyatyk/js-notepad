import { pagesModel } from "../api/pages";

/** Resolve the page editor shape expected by the shared renderer script runner. */
export function resolveRendererScriptEditor(pageId?: string) {
    const page = pageId ? pagesModel.findPage(pageId) : pagesModel.activePage;
    // scriptRunner expects a legacy EditorModel; unwrap adapter or pass undefined.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return page?.mainEditor as any ?? undefined;
}
