import type { HubTab, IToolsHubEditor } from "../../api/types/tools-hub-editor";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import type { ToolsHubEditor } from "../../editors/tools-hub/ToolsHubEditor";

const VALID_HUB_TABS: readonly HubTab[] = ["builtin", "boards", "search", "tools"];

const TOOLS_HUB_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "tools-hub-tabs", purpose: "Locate the hub's Built-in, Boards, Search, and Tools tab switcher." },
    { name: "search-boards-filter", purpose: "Locate the Search boards query field." },
    { name: "search-boards-refresh", purpose: "Locate the Search boards catalog refresh control." },
];

const TOOLS_HUB_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete editor id: tools-hub-view." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "activeTab", kind: "property", summary: "The model-backed active tab, or undefined for absent or invalid persisted state." },
    { name: "setTab", kind: "method", signature: "setTab(tab: HubTab): void", summary: "Select builtin, boards, search, or tools." },
];

const TOOLS_HUB_HELP = `Access via pages[i].editor after narrowing editor.id to "tools-hub-view".
The model-backed activeTab is one of "builtin", "boards", "search", or "tools"; setTab() accepts
only those four values and rejects guesses. The Tools tab's canonical data path is
tools.toolsets[...], not a projection of the hub's visual tree. Explorer/sidebar tool trees belong
to page.panels.

No facade member registers, trusts, or untrusts a toolset, accepts a trust decision, or accepts or
returns a secret. Values from .env never appear; env is names only in the canonical tools path.
The existing RegisterToolsetDialog consent path remains the only registration route.

elements is the curated, page-scoped list of the tab switcher and Search boards controls; repeated
matches use { all: true }. Search controls may be invisible when another tab is active. Structural
roots, repeated rows, sidebar trees, pinned rails, menus, and overlays are not part of this editor
list.`;

export class ToolsHubEditorFacade implements IAiVisible, IToolsHubEditor {
    constructor(
        private readonly editor: ToolsHubEditor,
        readonly id: "tools-hub-view",
        readonly name: string,
    ) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(TOOLS_HUB_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
            highlightOptions: { all: true },
        });
        return {
            kind: "ToolsHubEditor",
            summary: "Model-backed Tools & Editors hub tab state and curated controls.",
            members: [...TOOLS_HUB_MEMBERS, ...elements.members],
            help: TOOLS_HUB_HELP,
            elements: TOOLS_HUB_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "ToolsHubEditor",
                id: this.id,
                name: this.name,
                ...(this.activeTab !== undefined ? { activeTab: this.activeTab } : {}),
            }),
        };
    }

    get activeTab(): HubTab | undefined {
        const tab = (this.editor.state.get() as { tab?: unknown }).tab;
        return isHubTab(tab) ? tab : undefined;
    }

    setTab(tab: HubTab): void {
        if (!isHubTab(tab)) {
            throw new Error(`Unknown Tools hub tab ${JSON.stringify(tab)}. Valid tabs: ${VALID_HUB_TABS.join(", ")}.`);
        }
        this.editor.setTab(tab);
    }
}

function isHubTab(value: unknown): value is HubTab {
    return typeof value === "string" && VALID_HUB_TABS.includes(value as HubTab);
}
