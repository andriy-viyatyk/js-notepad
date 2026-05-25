import { TComponentState } from "../../core/state/state";
import { ImageEditor, getDefaultImageEditorState } from "./ImageEditor";
import { ImageView } from "./ImageView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-569 — native Image editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor`
 * when the page's `mainEditorV4` is a v4-native ImageEditor instance.
 *
 * Image is NO-HOST (no `CONTENT_HOST_TRAIT`) — `Component` is the full
 * Image viewer (toolbar + BaseImageView zoom/pan host). No `<TextChrome>`
 * wrap (text-bearing chrome is irrelevant).
 */

function ImageEditorComponent({ model }: { model: V4EditorModel }) {
    return <ImageView model={model as ImageEditor} />;
}

export const imageModule: EditorModule = {
    createEditor: () =>
        new ImageEditor(new TComponentState(getDefaultImageEditorState())),
    Component: ImageEditorComponent,
};

export { ImageEditor, getDefaultImageEditorState };
export type { ImageEditorState } from "./ImageEditor";
// Compatibility aliases — retire under US-559 cleanup. Keep
// `ImageEditorModel` / `ImageEditorModelState` names usable from any stale
// imports outside this folder (mirrors US-568 Pdf migration's alias
// pattern). The `openImageInNewTab` caller in PagesLifecycleModel.ts
// consumes the `ImageEditorModel` alias via this index.
export { ImageEditor as ImageEditorModel } from "./ImageEditor";
export type { ImageEditorState as ImageEditorModelState } from "./ImageEditor";
// Legacy EditorModule default-export — consumed by the legacy
// `editorRegistry` `loadModule` callback (file-open + LegacyEditorAdapter
// safety-net path) AND by `openImageInNewTab` for the blob-URL flow.
// Re-exported as BOTH the named `imageEditorModule` (for direct callers)
// AND as `default` (for the legacy `imgModule.default` consumption in
// `PagesLifecycleModel.openImageInNewTab`).
export { default as imageEditorModule, default } from "./ImageView";
