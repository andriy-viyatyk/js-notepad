import type { IEditorRegistry } from "../../../api/types/editors";
import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const EDITOR_REGISTRY_MEMBERS: readonly IAiMember[] = [
    { name: "getAll", kind: "method", signature: "getAll()", summary: "Return all registered editors." },
    { name: "getById", kind: "method", signature: "getById(id: EditorView)", summary: "Find editor information by id." },
    { name: "resolve", kind: "method", signature: "resolve(filePath: string)", summary: "Resolve the best editor for a file path." },
    { name: "resolveId", kind: "method", signature: "resolveId(filePath: string)", summary: "Resolve only the best editor id for a file path." },
    { name: "getSwitchOptions", kind: "method", signature: "getSwitchOptions(languageId: string, filePath?: string)", summary: "Return compatible editor-switch options for a language/path." },
];

export function describeEditorRegistry(instance: unknown): IAiVisionDescriptor {
    const editors = instance as IEditorRegistry;
    return {
        kind: "EditorRegistry",
        summary: "The registry of available editors and their file-language matches.",
        members: EDITOR_REGISTRY_MEMBERS,
        help: "Use getAll, getById, resolve, and getSwitchOptions to inspect editor capabilities without opening or changing a page.",
        summarize: () => ({ kind: "EditorRegistry", editorCount: editors.getAll().length }),
    };
}
