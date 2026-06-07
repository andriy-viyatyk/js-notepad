import { DiffEditor } from "@monaco-editor/react";

import { useComponentModel } from "../../core/state/model";
import { useOptionalState, type TOneState } from "../../core/state/state";
import type { TextFileEditorModelState } from "../text/TextEditorModel";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Button } from "../../uikit/Button";
import { FileDiffBodyModel, defaultFileDiffBodyState } from "./FileDiffBodyModel";
import type { FileDiffEditor } from "./FileDiffEditor";

export function FileDiffBody({ model }: { model: FileDiffEditor }) {
    const bodyModel = useComponentModel({ model }, FileDiffBodyModel, defaultFileDiffBodyState);
    const { fromText, toText } = bodyModel.state.use((s) => ({
        fromText: s.fromText,
        toText: s.toText,
    }));
    const to = model.state.use((s) => s.to);

    // Subscribe to host fields → re-render drives the body model's effects and
    // the readOnly / error decision. (`content` sub keeps the Unstaged side live.)
    // host.state is typed `IState` but is a concrete TOneState at runtime.
    const hostState = model.host?.state as
        | TOneState<TextFileEditorModelState>
        | undefined;
    const gitRepo = useOptionalState(hostState, (s) => s.gitRepo, undefined);
    const language = useOptionalState(hostState, (s) => s.language, undefined);
    const filePath = useOptionalState(hostState, (s) => s.filePath, undefined);

    // Nothing to compare — not in a repo / no file / git unavailable (Concern 4).
    // The "Switch to Text Editor" button is the escape hatch: the switch widget
    // hides itself here (file-diff.accepts() → -1 when gitRepo is null).
    if (!gitRepo || !filePath) {
        return (
            <Panel
                name="file-diff-empty"
                direction="column"
                flex={1}
                align="center"
                justify="center"
                gap="md"
                padding="xl"
            >
                <Text color="light">
                    Nothing to compare — this file isn't in a git repository, or git is
                    unavailable.
                </Text>
                <Button onClick={() => void model.page?.switchMainEditor?.("monaco")}>
                    Switch to Text Editor
                </Button>
            </Panel>
        );
    }

    return (
        <Panel name="file-diff-body" direction="column" flex={1} overflow="hidden">
            <DiffEditor
                language={language}
                original={fromText}
                modified={toText}
                onMount={bodyModel.onDiffMount}
                // The body model disposes the models itself (after the widget) to
                // avoid monaco's "TextModel got disposed before DiffEditorWidget
                // model got reset" on unmount.
                keepCurrentOriginalModel
                keepCurrentModifiedModel
                options={{
                    // Right/modified side editable only when comparing to the
                    // working tree (Unstaged); left is never editable (Concern 3).
                    readOnly: to.kind !== "unstaged",
                    originalEditable: false,
                    renderSideBySide: true,
                    automaticLayout: true,
                }}
                theme="custom-dark"
            />
        </Panel>
    );
}
