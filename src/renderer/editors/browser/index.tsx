import { TComponentState } from "../../core/state/state";
import { BrowserEditor } from "./BrowserEditor";
import { getDefaultBrowserPageState } from "./BrowserEditorModel";
import { BrowserEditorView } from "./BrowserView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

/**
 * EPIC-028 / US-558 — native Browser editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorInstance` is a v4-native BrowserEditor instance.
 *
 * Browser is NO-HOST (no `CONTENT_HOST_TRAIT`) — `Component` is the full
 * browser view (URL bar + tabs panel + webview area + bookmarks drawer +
 * find bar). No `<TextChrome>` wrap (text-bearing chrome is irrelevant).
 *
 * `accepts: () => -1` — Browser never opens files; only via explicit user
 * gesture through `PagesLifecycleModel.showBrowserPage`.
 */

function BrowserEditorComponent({ model }: { model: EditorModel }) {
    return <BrowserEditorView model={model as BrowserEditor} />;
}

export const browserModule: EditorModule = {
    createEditor: () =>
        new BrowserEditor(new TComponentState(getDefaultBrowserPageState())),
    Component: BrowserEditorComponent,
};

export { BrowserEditor };
export type { BrowserQueueEvent } from "./BrowserEditor";
export type { BrowserEditorState, BrowserTabData } from "./BrowserEditorModel";
