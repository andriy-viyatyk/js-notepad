import { TComponentState } from "../../core/state/state";
import { RestClientEditor, defaultRestClientEditorState } from "./RestClientEditor";
import { RestClientBody } from "./RestClientBody";
import { TextChrome } from "../base/v4/TextChrome";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-563 — native Rest Client editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native RestClientEditor instance.
 *
 * NO toolbar/footer contributions (RC17 — per-request toolbar lives inline in
 * SplitDetailPanel; predates the portal toolbar pattern). The simplest
 * `index.tsx` of all Tier-5 modules.
 */

function RestClientEditorView({ model }: { model: V4EditorModel }) {
    const restClient = model as RestClientEditor;
    return (
        <TextChrome model={model}>
            <RestClientBody model={restClient} />
        </TextChrome>
    );
}

export const restClientModule: EditorModule = {
    createEditor: () =>
        new RestClientEditor(new TComponentState({ ...defaultRestClientEditorState })),
    Component: RestClientEditorView,
};

export { RestClientEditor, defaultRestClientEditorState };
export type { RestClientEditorState, RestClientQueueEvent } from "./RestClientEditor";
