import { createElement } from "react";
import { EditorErrorBoundary } from "../../ui/app/EditorErrorBoundary";
import { TComponentState } from "../../core/state/state";
import { FileDiffEditor, defaultFileDiffEditorState } from "./FileDiffEditor";
import { FileDiffBody } from "./FileDiffBody";
import { RevisionPicker } from "./RevisionPicker";
import { TextChromeView } from "../base/TextChromeView";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function FileDiffToolbarBits({ model }: { model: FileDiffEditor }) {
    const { from, to, hasStaged } = model.state.use((s) => ({
        from: s.from,
        to: s.to,
        hasStaged: s.hasStaged,
    }));
    return createElement(
        Panel,
        { align: "center", gap: "xs" },
        createElement(Text, { size: "sm", color: "light" }, "From"),
        createElement(RevisionPicker, {
            side: "from",
            picker: model.fileTree,
            value: from,
            showStaged: hasStaged,
            onPick: model.setFrom,
        }),
        createElement(Text, { size: "sm", color: "light" }, "\u2192"),
        createElement(RevisionPicker, {
            side: "to",
            picker: model.fileTree,
            value: to,
            showStaged: hasStaged,
            onPick: model.setTo,
        }),
    );
}

function requireFileDiffModel(model: EditorModel): FileDiffEditor {
    if (!(model instanceof FileDiffEditor)) throw new Error("File Diff view received an invalid model.");
    return model;
}

export class FileDiffEditorView extends VanillaView<{ model: EditorModel }> {
    private readonly chrome: TextChromeView;

    public constructor(props: { model: EditorModel }) {
        const model = requireFileDiffModel(props.model);
        const chrome = new TextChromeView({
            model: props.model,
            children: createElement(
                EditorErrorBoundary,
                null,
                createElement(FileDiffBody, { model }),
            ),
            toolbarContributions: createElement(
                EditorErrorBoundary,
                null,
                createElement(FileDiffToolbarBits, { model }),
            ),
        });
        super(props, chrome.root);
        this.chrome = this.child(chrome);
    }

    protected onMount(): void {
        this.chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireFileDiffModel(props.model);
        this.chrome.update({
            model: props.model,
            children: createElement(
                EditorErrorBoundary,
                null,
                createElement(FileDiffBody, { model }),
            ),
            toolbarContributions: createElement(
                EditorErrorBoundary,
                null,
                createElement(FileDiffToolbarBits, { model }),
            ),
        });
    }
}

export const fileDiffModule: EditorModule = {
    createEditor: () =>
        new FileDiffEditor(new TComponentState({ ...defaultFileDiffEditorState })),
    View: FileDiffEditorView,
};

export { FileDiffEditor, defaultFileDiffEditorState };
export type { FileDiffEditorState, RevSel } from "./FileDiffEditor";
