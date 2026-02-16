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
     * Queries each editor's acceptFile() and returns the one with highest priority.
     */
    resolve(filePath?: string): EditorDefinition | undefined {
        if (!filePath) {
            return undefined;
        }

        let bestMatch: EditorDefinition | undefined;
        let bestPriority = -1;

        for (const editor of this.editors.values()) {
            const priority = editor.acceptFile?.(filePath) ?? -1;
            if (priority > bestPriority) {
                bestMatch = editor;
                bestPriority = priority;
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
     * Validate that an editor is compatible with a language.
     * Returns "monaco" if the editor doesn't support the language.
     */
    validateForLanguage(editor: PageEditor | undefined, languageId: string): PageEditor {
        if (!editor || editor === "monaco") {
            return editor;
        }

        const editorDef = this.getById(editor);
        if (editorDef?.validForLanguage?.(languageId) === false) {
            return "monaco";
        }

        return editor;
    }

    /**
     * Get the preferred preview editor for a file in navigation context.
     * Like getSwitchOptions but skips editors whose acceptFile() returns -1
     * (e.g., grid-json for non-.grid.json files).
     * Returns undefined if no preview editor should be auto-selected.
     */
    getPreviewEditor(languageId: string, filePath: string): PageEditor | undefined {
        const results: { id: PageEditor; priority: number }[] = [];

        for (const editor of this.editors.values()) {
            if (editor.id === "monaco") continue;
            const priority = editor.switchOption?.(languageId, filePath) ?? -1;
            if (priority < 0) continue;
            // Skip if acceptFile explicitly rejects this file
            if (editor.acceptFile && editor.acceptFile(filePath) < 0) continue;
            results.push({ id: editor.id, priority });
        }

        if (results.length === 0) return undefined;
        results.sort((a, b) => a.priority - b.priority);
        return results[results.length - 1].id;
    }

    /**
     * Get available editor switch options for a language (used in UI).
     * Queries each editor's switchOption() and returns sorted list.
     * Returns an empty options array if only one editor is available.
     */
    getSwitchOptions(languageId: string, filePath?: string): SwitchOptions {
        const results: { id: PageEditor; priority: number }[] = [];

        for (const editor of this.editors.values()) {
            const priority = editor.switchOption?.(languageId, filePath) ?? -1;
            if (priority >= 0) {
                results.push({ id: editor.id, priority });
            }
        }

        // Sort by priority (lower first, so monaco at 0 comes first)
        results.sort((a, b) => a.priority - b.priority);

        const options = results.map((r) => r.id);

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
