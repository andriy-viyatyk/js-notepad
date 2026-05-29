import { editorRegistry } from "../editors/base/editorRegistry";
import type { EditorView } from "../../shared/types";
import type { IEditorInfo, IEditorRegistry, ISwitchOptions } from "./types/editors";

function toEditorInfo(def: { id: string; name: string; hasContentHost: boolean }): IEditorInfo {
    return {
        id: def.id as EditorView,
        name: def.name,
        hasContentHost: def.hasContentHost,
    };
}

class Editors implements IEditorRegistry {
    getAll(): IEditorInfo[] {
        return editorRegistry.getAll().map(toEditorInfo);
    }

    getById(id: EditorView): IEditorInfo | undefined {
        const def = editorRegistry.getById(id);
        return def ? toEditorInfo(def) : undefined;
    }

    resolve(filePath: string): IEditorInfo | undefined {
        const def = editorRegistry.resolve(filePath);
        return def ? toEditorInfo(def) : undefined;
    }

    resolveId(filePath: string): EditorView | undefined {
        return editorRegistry.resolveId(filePath) as EditorView | undefined;
    }

    getSwitchOptions(languageId: string, filePath?: string): ISwitchOptions {
        return editorRegistry.getSwitchOptions(languageId, filePath) as ISwitchOptions;
    }
}

export const editors = new Editors();
