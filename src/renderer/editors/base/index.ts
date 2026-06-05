export { EditorModel } from "./EditorModel";
export type { EditorStateBase, RestoreData } from "./EditorModel";

import type { EditorModel } from "./EditorModel";
import type { TextFileModel } from "../text/TextEditorModel";

/** Union returned by `PageModel.mainEditor` — either an `EditorModel` (the
 *  common case) or a `TextFileModel` host (when a text-bearing page's host
 *  outlives its editor across switches). */
export type EditorOrHost = EditorModel | TextFileModel;

import type { IEditorState } from "../../../shared/types";

/** Default `IEditorState` factory consumed by preserved standalone shim files
 *  for their state defaults. */
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

export { EditorToolbar } from './EditorToolbar';
export type { EditorToolbarProps } from './EditorToolbar';
export { LanguageIcon } from '../../components/icons/LanguageIcon';
export type { LanguageIconProps } from '../../components/icons/LanguageIcon';
export { EditorConfigProvider, useEditorConfig } from './EditorConfigContext';
export type { EditorConfig } from './EditorConfigContext';
export type { IContentHost, IContentHostState } from './IContentHost';
export type { EditorStateStorage } from './EditorStateStorage';
export { CONTENT_HOST_TRAIT } from './editor-traits';
export type { IContentHostTrait } from './editor-traits';
export { editorRegistry } from './editorRegistry';
export type { EditorDefinition, EditorModule, AcceptanceInput } from './editorRegistry';
export { PageToolbar } from './PageToolbar';
export { TextChrome } from './TextChrome';
