import { TComponentState } from "../../core/state/state";
import { VideoEditor, getDefaultVideoEditorState } from "./VideoEditor";
import { VideoView } from "./VideoView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

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
export { VideoEditor as VideoEditorModel } from "./VideoEditor";
export type { VideoEditorState as VideoEditorModelState } from "./VideoEditor";
// Legacy EditorModule default-export — consumed by the legacy `editorRegistry`
// `showVideoPlayerPage`.
export { default as videoEditorModule, default } from "./VideoView";
