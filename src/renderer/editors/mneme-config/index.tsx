import { TComponentState } from "../../core/state/state";
import {
    MnemeConfigEditorModel,
    getDefaultMnemeConfigEditorState,
} from "./MnemeConfigEditorModel";
import { MnemeConfigEditorComponent } from "./MnemeConfigView";
import type { EditorModule } from "../base/editorRegistry";

/** Fixed page id — makes the Mneme config page a singleton (see
 *  `PagesLifecycleModel.showMnemeConfigPage`). */
export const MNEME_CONFIG_PAGE_ID = "mneme-config-page";

export const mnemeConfigModule: EditorModule = {
    createEditor: () =>
        new MnemeConfigEditorModel(new TComponentState(getDefaultMnemeConfigEditorState())),
    Component: MnemeConfigEditorComponent,
};

export { MnemeConfigEditorModel, getDefaultMnemeConfigEditorState } from "./MnemeConfigEditorModel";
export type { MnemeConfigEditorState } from "./MnemeConfigEditorModel";
