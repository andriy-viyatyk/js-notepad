import { IPage, PageType } from "../../shared/types";
import { PageModel } from "../editors/base";
import { editorRegistry } from "../editors/registry";

// Default to text editor module for fallback
const getTextEditorModule = async () => {
    const def = editorRegistry.getById("monaco");
    if (!def) throw new Error("Monaco editor not registered");
    return def.loadModule();
};

export async function newPageModel(filePath?: string): Promise<PageModel> {
    // Try to resolve editor by file path
    const editorDef = editorRegistry.resolve(filePath);

    if (editorDef) {
        const module = await editorDef.loadModule();
        return module.newPageModel(filePath);
    }

    // Fallback to text editor
    const module = await getTextEditorModule();
    return module.newPageModel(filePath);
}

export async function newEmptyPageModel(pageType: PageType): Promise<PageModel | null> {
    // Find an editor that handles this page type
    const editors = editorRegistry.getAll();
    const editorDef = editors.find(e => e.pageType === pageType);

    if (editorDef) {
        const module = await editorDef.loadModule();
        return module.newEmptyPageModel(pageType);
    }

    console.warn("Unknown page type:", pageType);
    return null;
}

export async function newPageModelFromState(state: Partial<IPage>): Promise<PageModel> {
    // Find an editor that handles this page type
    const editors = editorRegistry.getAll();
    const editorDef = editors.find(e => e.pageType === state.type);

    if (editorDef) {
        const module = await editorDef.loadModule();
        return module.newPageModelFromState(state);
    }

    // Fallback to text editor
    const module = await getTextEditorModule();
    return module.newPageModelFromState(state);
}
