import { TComponentState } from "../../core/state/state";
import { VideoEditor, getDefaultVideoEditorState } from "./VideoEditor";
import { VideoView } from "./VideoView";
import { detectVideoFormat } from "./video-types";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function VideoEditorComponent({ model }: { model: EditorModel }) {
    return <VideoView model={model as VideoEditor} />;
}

export const videoModule: EditorModule = {
    createEditor: () =>
        new VideoEditor(new TComponentState(getDefaultVideoEditorState())),
    Component: VideoEditorComponent,
    newEditorModel: async (filePath?: string) => {
        const initialState = getDefaultVideoEditorState();
        if (filePath) {
            initialState.filePath = filePath;
            initialState.inputText = filePath;
            initialState.url = filePath;
            initialState.format = detectVideoFormat(filePath);
            initialState.playerState = "loading";
        }
        return new VideoEditor(
            new TComponentState(initialState),
        ) as unknown as EditorModel;
    },
};

export { VideoEditor, getDefaultVideoEditorState };
export type { VideoEditorState } from "./VideoEditor";
export { VideoEditor as VideoEditorModel } from "./VideoEditor";
export type { VideoEditorState as VideoEditorModelState } from "./VideoEditor";
