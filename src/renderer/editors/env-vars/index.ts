import { createElement } from "react";
import { EditorErrorBoundary } from "../../ui/app/EditorErrorBoundary";
import { TComponentState } from "../../core/state/state";
import { EnvVarsEditor, defaultEnvVarsEditorState } from "./EnvVarsEditor";
import { EnvVarsBody } from "./EnvVarsBody";
import { TextChromeView } from "../base/TextChromeView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function requireEnvVarsModel(model: EditorModel): EnvVarsEditor {
    if (!(model instanceof EnvVarsEditor)) throw new Error("Env Vars view received an invalid model.");
    return model;
}

export class EnvVarsEditorView extends VanillaView<{ model: EditorModel }> {
    private readonly chrome: TextChromeView;

    public constructor(props: { model: EditorModel }) {
        const model = requireEnvVarsModel(props.model);
        const chrome = new TextChromeView({
            model: props.model,
            children: createElement(
                EditorErrorBoundary,
                null,
                createElement(EnvVarsBody, { model }),
            ),
        });
        super(props, chrome.root);
        this.chrome = this.child(chrome);
    }

    protected onMount(): void {
        this.chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireEnvVarsModel(props.model);
        this.chrome.update({
            model: props.model,
            children: createElement(
                EditorErrorBoundary,
                null,
                createElement(EnvVarsBody, { model }),
            ),
        });
    }
}

export const envVarsModule: EditorModule = {
    createEditor: () =>
        new EnvVarsEditor(new TComponentState({ ...defaultEnvVarsEditorState })),
    View: EnvVarsEditorView,
};

export { EnvVarsEditor, defaultEnvVarsEditorState };
export type { EnvVarsEditorState } from "./EnvVarsEditor";
