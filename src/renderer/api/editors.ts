import { editorRegistry } from "../editors/base/editorRegistry";
import type { IEditorInfo, IEditorRegistry, ISwitchOptions } from "./types/editors";

function toEditorInfo(def: { id: string; name: string }): IEditorInfo {
    return { id: def.id, name: def.name };
}

class Editors implements IEditorRegistry {
    getAll(): IEditorInfo[] {
        return editorRegistry.getAll().map(toEditorInfo);
    }

    getById(id: string): IEditorInfo | undefined {
        const def = editorRegistry.getById(id);
        return def ? toEditorInfo(def) : undefined;
    }

    resolve(filePath: string): IEditorInfo | undefined {
        const def = editorRegistry.resolve(filePath);
        return def ? toEditorInfo(def) : undefined;
    }

    resolveId(filePath: string): string | undefined {
        return editorRegistry.resolveId(filePath);
    }

    getSwitchOptions(languageId: string, filePath?: string): ISwitchOptions {
        return editorRegistry.getSwitchOptions(languageId, filePath);
    }
}

export const editors = new Editors();
