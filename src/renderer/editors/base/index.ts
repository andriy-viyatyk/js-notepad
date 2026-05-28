export { EditorModel } from "./v4/EditorModel";
export type { EditorStateBase, RestoreData } from "./v4/EditorModel";

import type { EditorModel } from "./v4/EditorModel";
import type { TextFileModel } from "../text/TextEditorModel";

/** Union returned by `PageModel.mainEditor` — either an `EditorModel` (the
 *  common case) or a `TextFileModel` host (when a text-bearing page's host
 *  outlives its editor across switches). */
export type EditorOrHost = EditorModel | TextFileModel;

import type { IEditorState } from "../../../shared/types";

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
export {
    EditorStateStorageProvider,
    useEditorStateStorage,
    useObjectStateStorage,
} from './EditorStateStorageContext';
export type { EditorStateStorage } from './EditorStateStorageContext';

export type { IContentHost, IContentHostState } from './IContentHost';
