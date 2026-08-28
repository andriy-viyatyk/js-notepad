import { TComponentState } from "../../core/state/state";
import { FileDiffEditor, defaultFileDiffEditorState } from "./FileDiffEditor";
import { FileDiffBodyView } from "./FileDiffBodyView";
import { FileDiffToolbarView } from "./FileDiffToolbarView";
import { TextChromeView } from "../base/TextChromeView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function requireFileDiffModel(model: EditorModel): FileDiffEditor {
    if (!(model instanceof FileDiffEditor)) throw new Error("File Diff view received an invalid model.");
    return model;
}

export class FileDiffEditorView extends VanillaView<{ model: EditorModel }> {
    private model: FileDiffEditor | undefined;
    private body: FileDiffBodyView | undefined;
    private toolbar: FileDiffToolbarView | undefined;
    private chrome: TextChromeView | undefined;

    public constructor(props: { model: EditorModel }) {
        super(props, createContentsRoot());
    }

    protected onMount(): void {
        const model = requireFileDiffModel(this.props.model);
        this.model = model;
        const body = this.child(new FileDiffBodyView({ model }));
        const toolbar = this.child(new FileDiffToolbarView({ model }));
        const chrome = this.child(new TextChromeView({
            model: this.props.model,
            children: body.root,
            toolbarContributions: toolbar.root,
        }));
        this.body = body;
        this.toolbar = toolbar;
        this.chrome = chrome;
        this.root.append(body.root, toolbar.root, chrome.root);
        body.mount();
        toolbar.mount();
        chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireFileDiffModel(props.model);
        if (model !== this.model) {
            throw new Error("File Diff view received a different model instance.");
        }
        const body = this.body;
        const toolbar = this.toolbar;
        const chrome = this.chrome;
        if (!body || !toolbar || !chrome) return;
        body.update({ model });
        toolbar.update({ model });
        chrome.update({
            model: props.model,
            children: body.root,
            toolbarContributions: toolbar.root,
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

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}
