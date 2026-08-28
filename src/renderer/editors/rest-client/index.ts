import { TComponentState } from "../../core/state/state";
import { RestClientEditor, defaultRestClientEditorState } from "./RestClientEditor";
import { RestClientBodyView } from "./RestClientBodyView";
import { TextChromeView } from "../base/TextChromeView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function requireRestClientModel(model: EditorModel): RestClientEditor {
    if (!(model instanceof RestClientEditor)) throw new Error("Rest Client view received an invalid model.");
    return model;
}

export class RestClientEditorView extends VanillaView<{ model: EditorModel }> {
    private model: RestClientEditor | undefined;
    private body: RestClientBodyView | undefined;
    private chrome: TextChromeView | undefined;

    public constructor(props: { model: EditorModel }) {
        super(props, createContentsRoot());
    }

    protected onMount(): void {
        const model = requireRestClientModel(this.props.model);
        this.model = model;
        const body = this.child(new RestClientBodyView({ model }));
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
        const model = requireRestClientModel(props.model);
        if (model !== this.model) {
            throw new Error("Rest Client view received a different model instance.");
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

export const restClientModule: EditorModule = {
    createEditor: () =>
        new RestClientEditor(new TComponentState({ ...defaultRestClientEditorState })),
    View: RestClientEditorView,
};

export { RestClientEditor, defaultRestClientEditorState };
export type { RestClientEditorState, RestClientQueueEvent } from "./RestClientEditor";
