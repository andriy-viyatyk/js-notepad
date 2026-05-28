// EPIC-028 / US-559 / C559-2 Option B — the legacy `EditorModel` base + its
// `getDefaultEditorModelState` factory were folded into `TextFileModel`
// (its only subclass) and the file deleted. v4 editors extend
// `editors/base/v4/EditorModel`.
//
// `EditorModel` is preserved as a **type alias** for backwards-compatible
// barrel imports: callers used to receive either a v4 editor or a
// `TextFileModel` host via this symbol; post-strangler the same union is
// the natural shape. No runtime class is re-exported under this name —
// consumers that need the v4 class for `instanceof` checks import from
// `editors/base/v4` directly.
import type { EditorModel as V4EditorModelType } from "./v4/EditorModel";
import type { TextFileModel as TextFileModelType } from "../text/TextEditorModel";

export type EditorModel = V4EditorModelType | TextFileModelType;

/**
 * Default IEditorState shape — small back-compat factory consumed by
 * `BrowserEditorModel` and possibly other preserved standalone shim files
 * for their state defaults. Used to live on `editors/base/EditorModel.ts`
 * (deleted by US-559 / C559-2 Option B).
 */
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

// EPIC-028 / US-559 — legacy `IContentHost` is preserved (TextFileModel still
// implements its shape). The content-view subsystem (`ContentViewModel`,
// `ContentViewModelHost`, `useContentViewModel`) was deleted with the
// strangler retirement; consumers route through v4 editors directly.
export type { IContentHost, IContentHostState } from './IContentHost';
