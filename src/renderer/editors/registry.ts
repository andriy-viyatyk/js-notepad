import { PageEditor } from "../../shared/types";
import { EditorDefinition } from "./types";

/**
 * Options for the editor switch UI component.
 */
export interface SwitchOptions {
    options: PageEditor[];
    getOptionLabel: (option: PageEditor) => string;
}

/**
 * Central registry for all editors in the application.
 * Provides methods for registering, resolving, and querying editors.
 */
class EditorRegistry {
    private editors = new Map<PageEditor, EditorDefinition>();

    /**
     * Register an editor definition.
     */
    register(definition: EditorDefinition): void {
        if (this.editors.has(definition.id)) {
            console.warn(`Editor "${definition.id}" is already registered. Overwriting.`);
        }
        this.editors.set(definition.id, definition);
    }

    /**
     * Get an editor definition by ID.
     */
    getById(id: PageEditor): EditorDefinition | undefined {
        return this.editors.get(id);
    }

    /**
     * Get all registered editor definitions.
     */
    getAll(): EditorDefinition[] {
        return Array.from(this.editors.values());
    }

    /**
     * Resolve the best matching editor for a file path.
     * Returns the full EditorDefinition or undefined if no match.
     */
    resolve(filePath?: string): EditorDefinition | undefined {
        if (!filePath) {
            return undefined;
        }

        const lowerPath = filePath.toLowerCase();
        let bestMatch: EditorDefinition | undefined;
        let bestPriority = -1;

        for (const editor of this.editors.values()) {
            // Check filename patterns first (most specific)
            if (editor.filenamePatterns) {
                for (const pattern of editor.filenamePatterns) {
                    if (pattern.test(lowerPath)) {
                        if (editor.priority > bestPriority) {
                            bestMatch = editor;
                            bestPriority = editor.priority;
                        }
                    }
                }
            }

            // Check extensions
            if (editor.extensions) {
                for (const ext of editor.extensions) {
                    if (ext === "*" || lowerPath.endsWith(ext.toLowerCase())) {
                        if (editor.priority > bestPriority) {
                            bestMatch = editor;
                            bestPriority = editor.priority;
                        }
                    }
                }
            }
        }

        return bestMatch;
    }

    /**
     * Resolve the editor ID for a file path.
     * Convenience method that returns just the ID instead of the full definition.
     */
    resolveId(filePath?: string): PageEditor | undefined {
        return this.resolve(filePath)?.id;
    }

    /**
     * Resolve the best matching editor for a language ID.
     */
    resolveByLanguage(languageId: string): EditorDefinition | undefined {
        let bestMatch: EditorDefinition | undefined;
        let bestPriority = -1;

        for (const editor of this.editors.values()) {
            if (editor.languageIds?.includes(languageId)) {
                if (editor.priority > bestPriority) {
                    bestMatch = editor;
                    bestPriority = editor.priority;
                }
            }
        }

        return bestMatch;
    }

    /**
     * Get all editors that support a given language ID.
     * Returns editors sorted by priority (lowest first).
     */
    getAlternatives(languageId: string): EditorDefinition[] {
        const alternatives: EditorDefinition[] = [];

        for (const editor of this.editors.values()) {
            if (editor.languageIds?.includes(languageId)) {
                alternatives.push(editor);
            }
        }

        // Sort by priority (lower priority first, so monaco comes first as the default)
        return alternatives.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Validate that an editor is compatible with a language.
     * Returns "monaco" if the editor doesn't support the language.
     */
    validateForLanguage(editor: PageEditor | undefined, languageId: string): PageEditor {
        if (!editor || editor === "monaco") {
            return editor;
        }

        const editorDef = this.getById(editor);
        if (editorDef?.languageIds && !editorDef.languageIds.includes(languageId)) {
            return "monaco";
        }

        return editor;
    }

    /**
     * Get available editor switch options for a language (used in UI).
     * Returns an empty options array if only one editor is available.
     * Optionally accepts filePath to also include extension-based alternatives.
     */
    getSwitchOptions(languageId: string, filePath?: string): SwitchOptions {
        const alternatives = this.getAlternatives(languageId);
        const options: PageEditor[] = alternatives.map(e => e.id);

        // Also include editors that match by file extension (for content-views like svg-view)
        if (filePath) {
            const lowerPath = filePath.toLowerCase();
            for (const editor of this.editors.values()) {
                // Only include content-view editors (not page-editors)
                if (editor.category !== "content-view") continue;
                if (options.includes(editor.id)) continue;

                // Check if this editor matches by extension
                if (editor.extensions) {
                    for (const ext of editor.extensions) {
                        if (ext !== "*" && lowerPath.endsWith(ext.toLowerCase())) {
                            options.push(editor.id);
                            break;
                        }
                    }
                }
            }
        }

        // Ensure monaco is always first if not present
        if (!options.includes("monaco")) {
            options.unshift("monaco");
        }

        // Sort so monaco comes first
        options.sort((a, b) => {
            if (a === "monaco") return -1;
            if (b === "monaco") return 1;
            return 0;
        });

        const getOptionLabel = (option: PageEditor) => {
            if (!option || option === "monaco") {
                return languageId.toUpperCase();
            }
            const editorDef = this.getById(option);
            return editorDef?.name ?? languageId.toUpperCase();
        };

        return {
            options: options.length > 1 ? options : [],
            getOptionLabel,
        };
    }
}

export const editorRegistry = new EditorRegistry();
