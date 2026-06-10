import { TComponentState } from "../../core/state/state";
import { FileDiffEditor, defaultFileDiffEditorState } from "./FileDiffEditor";
import { FileDiffBody } from "./FileDiffBody";
import { RevisionPicker } from "./RevisionPicker";
import { TextChrome } from "../base/TextChrome";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function FileDiffToolbarBits({ model }: { model: FileDiffEditor }) {
    const { from, to, hasStaged } = model.state.use((s) => ({
        from: s.from,
        to: s.to,
        hasStaged: s.hasStaged,
    }));
    return (
        <Panel align="center" gap="xs">
            <Text size="sm" color="light">From</Text>
            <RevisionPicker side="from" picker={model.fileTree} value={from} showStaged={hasStaged} onPick={model.setFrom} />
            <Text size="sm" color="light">→</Text>
            <RevisionPicker side="to" picker={model.fileTree} value={to} showStaged={hasStaged} onPick={model.setTo} />
        </Panel>
    );
}

function FileDiffEditorView({ model }: { model: EditorModel }) {
    const fd = model as FileDiffEditor;
    return (
        <TextChrome model={model} toolbarContributions={<FileDiffToolbarBits model={fd} />}>
            <FileDiffBody model={fd} />
        </TextChrome>
    );
}

export const fileDiffModule: EditorModule = {
    createEditor: () =>
        new FileDiffEditor(new TComponentState({ ...defaultFileDiffEditorState })),
    Component: FileDiffEditorView,
};

export { FileDiffEditor, defaultFileDiffEditorState };
export type { FileDiffEditorState, RevSel } from "./FileDiffEditor";
