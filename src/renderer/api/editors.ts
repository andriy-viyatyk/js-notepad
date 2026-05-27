import { editorRegistry } from "../editors/base/v4/editorRegistry";
import type { IEditorInfo, IEditorRegistry, ISwitchOptions } from "./types/editors";

// EPIC-028 / US-581 — `app.editors` sources from the native v4 registry.
// `category` was dropped (redundant with the registry's internal
// `hasContentHost`; see US-581 C581-4), so `IEditorInfo` is now `{ id, name }`.
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
