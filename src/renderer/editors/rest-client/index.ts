import { createElement } from "react";
import { EditorErrorBoundary } from "../../ui/app/EditorErrorBoundary";
import { TComponentState } from "../../core/state/state";
import { RestClientEditor, defaultRestClientEditorState } from "./RestClientEditor";
import { RestClientBody } from "./RestClientBody";
import { TextChromeView } from "../base/TextChromeView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function requireRestClientModel(model: EditorModel): RestClientEditor {
    if (!(model instanceof RestClientEditor)) throw new Error("Rest Client view received an invalid model.");
    return model;
}

export class RestClientEditorView extends VanillaView<{ model: EditorModel }> {
    private readonly chrome: TextChromeView;

    public constructor(props: { model: EditorModel }) {
        const model = requireRestClientModel(props.model);
        const chrome = new TextChromeView({
            model: props.model,
            children: createElement(
                EditorErrorBoundary,
                null,
                createElement(RestClientBody, { model }),
            ),
        });
        super(props, chrome.root);
        this.chrome = this.child(chrome);
    }

    protected onMount(): void {
        this.chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireRestClientModel(props.model);
        this.chrome.update({
            model: props.model,
            children: createElement(
                EditorErrorBoundary,
                null,
                createElement(RestClientBody, { model }),
            ),
        });
    }
}

export const restClientModule: EditorModule = {
    createEditor: () =>
        new RestClientEditor(new TComponentState({ ...defaultRestClientEditorState })),
    View: RestClientEditorView,
};

export { RestClientEditor, defaultRestClientEditorState };
export type { RestClientEditorState, RestClientQueueEvent } from "./RestClientEditor";
