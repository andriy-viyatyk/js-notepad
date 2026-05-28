import { IEditorState, EditorView, EditorType } from "../../shared/types";
import { EditorModel } from "./base";
import type { IContentHost } from "./base/IContentHost";

export type FileEditorComponent<T extends EditorModel | IContentHost = EditorModel | IContentHost> = React.ComponentType<{
    model: T;
}>;

export interface EditorModelCreations {
    newEditorModel(filePath?: string): Promise<EditorModel>;
    newEmptyEditorModel(editorType: EditorType): Promise<EditorModel | null>;
    newEditorModelFromState(state: Partial<IEditorState>): Promise<EditorModel>;
}

export interface EditorViewModule {
    Editor: FileEditorComponent;
}

export type EditorModule = EditorViewModule & EditorModelCreations;

/**
 * Editor category — preserved on legacy `EditorDefinition` for the strangler
 * period. Post-US-559 the v4 registry's `hasContentHost` flag replaces this.
 * Phase 5 deletes the legacy `EditorDefinition` along with this type.
 */
export type EditorCategory = "standalone" | "content-view";

export interface EditorDefinition {
    id: EditorView;
    name: string;
    editorType: EditorType;
    /** Distinguishes standalone page editors from content views (legacy). */
    category: EditorCategory;

    /**
     * Determines if this editor can open a file.
     * @param fileName - The file path/name to check
     * @returns Priority (>= 0) if editor accepts this file, -1 if not applicable.
     *          Higher priority wins when multiple editors match.
     */
    acceptFile?(fileName: string): number;

    /**
     * Checks if this editor is valid for a given language.
     */
    validForLanguage?(languageId: string): boolean;

    /**
     * Determines if this editor should appear in the view switch dropdown.
     */
    switchOption?(languageId: string, fileName?: string): number;

    /**
     * Detects if file content belongs to this editor based on a `type` property
     * embedded in the content.
     */
    isEditorContent?(languageId: string, content: string): boolean;

    loadModule: () => Promise<EditorModule>;
}
