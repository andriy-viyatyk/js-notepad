import { IState } from "../../core/state/state";
import { EditorView } from "../../../shared/types";
import { EditorStateStorage } from "./EditorStateStorageContext";

/**
 * Minimal state shape required by content view models.
 * Both TextFileEditorModelState and NoteItemEditModel's state extend this.
 */
export interface IContentHostState {
    content: string;
    language?: string;
    editor?: EditorView;
}

/**
 * Shared interface for anything that hosts editable text content.
 *
 * Implemented by:
 * - `TextFileModel` (standalone page tab)
 * - `NoteItemEditModel` (notebook note — embedded editor)
 *
 * EPIC-028 / US-559 — the legacy `acquireViewModel` / `releaseViewModel` /
 * `acquireViewModelSync` / `prepareViewModel` methods retired with the
 * content-view subsystem. v4 editors own their view-model lifecycle directly.
 */
export interface IContentHost {
    /** Unique identifier for state persistence (page ID or note ID). */
    readonly id: string;

    /** Reactive state containing at least content, language, and editor type. */
    readonly state: IState<IContentHostState>;

    /** Update the text content. */
    changeContent(content: string, byUser?: boolean): void;

    /** Change the active editor type. */
    changeEditor(editor: EditorView): void;

    /** Change the language. */
    changeLanguage(language: string | undefined): void;

    /** State storage for persisting editor-specific state (column widths, filters, etc.). */
    readonly stateStorage: EditorStateStorage;
}
