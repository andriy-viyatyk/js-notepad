import { EditorModel, type EditorStateBase } from "../base/EditorModel";

export const TOOLS_HUB_PAGE_ID = "tools-hub-page";

/** Which content tab the hub shows. Persisted in editor state (survives restart). */
export type HubTab = "builtin" | "boards" | "search" | "tools";
const VALID_HUB_TABS: readonly HubTab[] = ["builtin", "boards", "search", "tools"];

export interface ToolsHubEditorState extends EditorStateBase {
    /** State-type discriminator. */
    type: "toolsHubPage";
    tab: HubTab;
}

export const getDefaultToolsHubEditorState = (): ToolsHubEditorState => ({
    id: TOOLS_HUB_PAGE_ID,
    title: "Tools & Editors",
    modified: false,
    type: "toolsHubPage",
    editor: "tools-hub-view",
    tab: "builtin",
});

/**
 * Tools & Editors hub — a singleton full-page counterpart to the AppBar "Tools & Editors"
 * slide-out panel (EPIC-045 / US-870). Four content tabs (Built-in / Registered boards /
 * Search boards / Tools) + a Pinned rail. Like About/Storybook it is a page-sized
 * `hasContentHost: false` editor reached only via `showToolsHubPage`; the fixed page id makes
 * it a singleton (`addPage` dedupes).
 */
export class ToolsHubEditor extends EditorModel<ToolsHubEditorState> {
    /** Editor identity. Matches `EditorDescriptor.editorId`. */
    readonly editorId = "tools-hub-view";

    noLanguage = true;
    skipSave = true;
    showBackgroundOrnament = true;

    setTab(tab: HubTab): void {
        if (!VALID_HUB_TABS.includes(tab)) {
            throw new Error(`Unknown Tools hub tab ${JSON.stringify(tab)}. Valid tabs: ${VALID_HUB_TABS.join(", ")}.`);
        }
        this.state.update((s) => { s.tab = tab; });
    }

    /** Preserve the title across restore (parity with About). */
    async restore(): Promise<void> {
        await super.restore();
        this.state.update((s) => { s.title = "Tools & Editors"; });
    }
}
