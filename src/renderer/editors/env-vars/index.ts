import { TComponentState } from "../../core/state/state";
import { EnvVarsEditor, defaultEnvVarsEditorState } from "./EnvVarsEditor";
import { EnvVarsBodyView } from "./EnvVarsBodyView";
import { TextChromeView } from "../base/TextChromeView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function requireEnvVarsModel(model: EditorModel): EnvVarsEditor {
    if (!(model instanceof EnvVarsEditor)) throw new Error("Env Vars view received an invalid model.");
    return model;
}

export class EnvVarsEditorView extends VanillaView<{ model: EditorModel }> {
    private model: EnvVarsEditor | undefined;
    private body: EnvVarsBodyView | undefined;
    private chrome: TextChromeView | undefined;

    public constructor(props: { model: EditorModel }) {
        super(props, createContentsRoot());
    }

    protected onMount(): void {
        const model = requireEnvVarsModel(this.props.model);
        this.model = model;
        const body = this.child(new EnvVarsBodyView({ model }));
        const chrome = this.child(new TextChromeView({
            model: this.props.model,
            children: body.root,
        }));
        this.body = body;
        this.chrome = chrome;
        this.root.append(body.root, chrome.root);
        body.mount();
        chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireEnvVarsModel(props.model);
        if (model !== this.model) {
            throw new Error("Env Vars view received a different model instance.");
        }
        const body = this.body;
        const chrome = this.chrome;
        if (!body || !chrome) return;
        body.update({ model });
        chrome.update({ model: props.model, children: body.root });
    }
}

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

export const envVarsModule: EditorModule = {
    createEditor: () =>
        new EnvVarsEditor(new TComponentState({ ...defaultEnvVarsEditorState })),
    View: EnvVarsEditorView,
};

export { EnvVarsEditor, defaultEnvVarsEditorState };
export type { EnvVarsEditorState } from "./EnvVarsEditor";
