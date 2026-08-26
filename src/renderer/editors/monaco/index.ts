import { createElement } from "react";
import { EditorErrorBoundary } from "../../ui/app/EditorErrorBoundary";
import { TComponentState } from "../../core/state/state";
import { MonacoEditor, defaultMonacoEditorState } from "./MonacoEditor";
import { MonacoBody } from "./MonacoBody";
import { TextChromeView } from "../base/TextChromeView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function requireMonacoModel(model: EditorModel): MonacoEditor {
    if (!(model instanceof MonacoEditor)) throw new Error("Monaco view received an invalid model.");
    return model;
}

export class MonacoEditorView extends VanillaView<{ model: EditorModel }> {
    private readonly chrome: TextChromeView;

    public constructor(props: { model: EditorModel }) {
        const model = requireMonacoModel(props.model);
        const chrome = new TextChromeView({
            model: props.model,
            children: createElement(
                EditorErrorBoundary,
                null,
                createElement(MonacoBody, { model }),
            ),
        });
        super(props, chrome.root);
        this.chrome = this.child(chrome);
    }

    protected onMount(): void {
        this.chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireMonacoModel(props.model);
        this.chrome.update({
            model: props.model,
            children: createElement(
                EditorErrorBoundary,
                null,
                createElement(MonacoBody, { model }),
            ),
        });
    }
}

export const monacoModule: EditorModule = {
    createEditor: () =>
        new MonacoEditor(new TComponentState({ ...defaultMonacoEditorState })),
    View: MonacoEditorView,
};

export { MonacoEditor, defaultMonacoEditorState };
export type {
    MonacoEditorState,
    MonacoQueueEvent,
    MonacoQueueRequest,
} from "./MonacoEditor";
