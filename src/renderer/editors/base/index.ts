export { EditorModel } from "./EditorModel";
export type { EditorStateBase, RestoreData } from "./EditorModel";

import type { EditorModel } from "./EditorModel";
import type { TextFileModel } from "../text/TextEditorModel";

/** Union returned by `PageModel.mainEditor` — either an `EditorModel` (the
 *  common case) or a `TextFileModel` host (when a text-bearing page's host
 *  outlives its editor across switches). */
export type EditorOrHost = EditorModel | TextFileModel;

import type { IEditorState } from "../../../shared/types";

/** Create the base `IEditorState` fields that editor-specific default-state factories extend. */
export function getDefaultEditorModelState(): IEditorState {
    return {
        id: crypto.randomUUID(),
        type: "textFile",
        title: "untitled",
        modified: false,
        language: undefined,
        filePath: undefined,
        editor: undefined,
    };
}

export type { EditorConfig } from './EditorConfig';
export { EMPTY_EDITOR_CONFIG } from './EditorConfig';
export type { IContentHost, IContentHostState } from './IContentHost';
export type { EditorStateStorage } from './EditorStateStorage';
export { CONTENT_HOST_TRAIT } from './editor-traits';
export type { IContentHostTrait } from './editor-traits';
export { editorRegistry } from './editorRegistry';
export type { EditorDefinition, EditorModule, AcceptanceInput } from './editorRegistry';
