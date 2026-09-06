export type HubTab = "builtin" | "boards" | "search" | "tools";

/** The model-backed facade for the Tools & Editors hub page. */
export interface IToolsHubEditor {
    readonly id: "tools-hub-view";
    readonly name: string;
    readonly activeTab: HubTab | undefined;
    setTab(tab: HubTab): void;
}
