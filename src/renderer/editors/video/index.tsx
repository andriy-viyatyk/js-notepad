import { TComponentState } from "../../core/state/state";
import { VideoEditor, getDefaultVideoEditorState } from "./VideoEditor";
import { VideoView } from "./VideoView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-571 — native Video editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorInstance` is a v4-native VideoEditor instance.
 *
 * Video is NO-HOST (no `CONTENT_HOST_TRAIT`) — `Component` is the full player
 * (PageToolbar + VPlayer). No `<TextChrome>` wrap.
 */

function VideoEditorComponent({ model }: { model: EditorModel }) {
    return <VideoView model={model as VideoEditor} />;
}

export const videoModule: EditorModule = {
    createEditor: () =>
        new VideoEditor(new TComponentState(getDefaultVideoEditorState())),
    Component: VideoEditorComponent,
};

export { VideoEditor, getDefaultVideoEditorState };
export type { VideoEditorState } from "./VideoEditor";
// Compatibility aliases — retire under US-559. Keep the legacy
// `VideoEditorModel` / `VideoEditorModelState` names usable from any stale
// imports (mirrors US-568/569).
export { VideoEditor as VideoEditorModel } from "./VideoEditor";
export type { VideoEditorState as VideoEditorModelState } from "./VideoEditor";
// Legacy EditorModule default-export — consumed by the legacy `editorRegistry`
// `loadModule` callback (file-open + LegacyEditorAdapter safety-net) AND by
// `showVideoPlayerPage`.
export { default as videoEditorModule, default } from "./VideoView";
