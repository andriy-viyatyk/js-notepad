import { TComponentState } from "../../core/state/state";
import { ArchiveEditor, getDefaultArchiveEditorState } from "./ArchiveEditor";
import { ArchiveEditorView } from "./ArchiveEditorView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-570 — native Archive editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native ArchiveEditor instance.
 *
 * Archive is NO-HOST (no `CONTENT_HOST_TRAIT`) and sidebar-owning. `Component`
 * is the page-main tree view (`ArchiveEditorView`); the sidebar panel
 * (`ArchiveSecondaryEditor`) stays registered separately in the
 * secondaryEditorRegistry. No `<TextChrome>` wrap.
 */

function ArchiveEditorComponent({ model }: { model: V4EditorModel }) {
    return <ArchiveEditorView model={model as ArchiveEditor} />;
}

export const archiveModule: EditorModule = {
    createEditor: () =>
        new ArchiveEditor(new TComponentState(getDefaultArchiveEditorState())),
    Component: ArchiveEditorComponent,
};

export { ArchiveEditor, getDefaultArchiveEditorState };
export type { ArchiveEditorState } from "./ArchiveEditor";
// Compatibility aliases — retire under US-559 cleanup. Keep
// `ArchiveEditorModel` / `ArchiveEditorModelState` names usable from any stale
// imports outside this folder (mirrors US-569 Image alias pattern).
export { ArchiveEditor as ArchiveEditorModel } from "./ArchiveEditor";
export type { ArchiveEditorState as ArchiveEditorModelState } from "./ArchiveEditor";
// Legacy EditorModule default-export — consumed by the legacy `editorRegistry`
// `loadModule` callback (file-open + `_openZipArchive` + LegacyEditorAdapter
// safety-net path).
export { default } from "./ArchiveEditorView";
