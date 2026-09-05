import type { IPageHost } from "../../api/pages/IPageHost";
import type { EditorModel } from "../../editors/base/EditorModel";
import { parseBoardSecondaryPanelId } from "../../editors/board/board-secondary";
import { createElements } from "./elements";
import { ui } from "../../api/ui";
import { isCompositePanelKey, panelKey } from "../../ui/secondary-views/panel-key";
import { secondaryViewRegistry } from "../../ui/secondary-views/secondary-view-registry";
import type {
    IAiElementDeclaration,
    IAiMember,
    IAiVisible,
    IAiVisionDescriptor,
} from "../../../shared/ai-vision/types";
import type { IPagePanel } from "../../api/types/page-panels";

interface BoardPanelDeclaration {
    id: string;
    title?: string;
}

interface BoardPanelOwnerState {
    secondaryViewDefs?: BoardPanelDeclaration[];
}

const PAGE_PANELS_MEMBERS: readonly IAiMember[] = [
    { name: "items", kind: "property", summary: "Live sidebar panel records in renderer order, including bare id, label, owner identity, and expanded state." },
    { name: "isOpen", kind: "property", summary: "Whether the page sidebar is open; read-only model state, false before the lazy sidebar model exists." },
    { name: "width", kind: "property", summary: "Current sidebar width; read-only and null before the lazy sidebar model exists." },
    { name: "expand", kind: "method", signature: "expand(panelId: string)", summary: "Expand a panel by bare id; duplicate ids resolve to the first rendered owner and composite ids are rejected.", caution: "changes the visible UI" },
    { name: "toggleSidebar", kind: "method", signature: "toggleSidebar()", summary: "Flip the whole sidebar container open or closed; never creates an Explorer. Throws when the page has no panels, and when closing is refused because a non-Explorer panel keeps the sidebar open.", caution: "changes the visible UI" },
];

const SIDEBAR_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "secondary-views-container", purpose: "The page's sidebar panel container; present while the sidebar is open." },
    { name: "secondary-views-stack", purpose: "The collapsible stack of the page's sidebar panels." },
    { name: "secondary-views-splitter", purpose: "Resizes the page's sidebar." },
];

function panelLabel(model: EditorModel, panelId: string): string {
    const boardViewId = parseBoardSecondaryPanelId(panelId);
    if (boardViewId !== null) {
        const state = model.state.get() as BoardPanelOwnerState;
        const declaration = state.secondaryViewDefs?.find((view) => view.id === boardViewId);
        return declaration?.title ?? boardViewId ?? "View";
    }
    return secondaryViewRegistry.get(panelId)?.label ?? panelId;
}

export class PagePanelsNode implements IAiVisible {
    constructor(private readonly hostProvider: () => IPageHost | null) {}

    private projectItems(host: IPageHost): IPagePanel[] {
        const activePanel = host.activePanel;
        const activeIsComposite = isCompositePanelKey(activePanel);
        let bareActiveResolved = false;
        const items: IPagePanel[] = [];

        for (const model of host.panelEditors) {
            const panelIds = (model.state.get() as { secondaryView?: string[] }).secondaryView ?? [];
            for (const panelId of panelIds) {
                if (!secondaryViewRegistry.has(panelId)) continue;
                const expanded = activeIsComposite
                    ? activePanel === panelKey(model.id, panelId)
                    : !bareActiveResolved && panelId === activePanel;
                if (expanded && !activeIsComposite) bareActiveResolved = true;
                items.push({
                    id: panelId,
                    label: panelLabel(model, panelId),
                    editorId: model.id,
                    editorKind: model.editorId,
                    expanded,
                });
            }
        }
        return items;
    }

    get items(): readonly IPagePanel[] {
        const host = this.hostProvider();
        return host ? this.projectItems(host) : [];
    }

    get isOpen(): boolean {
        return this.hostProvider()?.secondaryViewsModel?.state.get().open ?? false;
    }

    get width(): number | null {
        return this.hostProvider()?.secondaryViewsModel?.state.get().width ?? null;
    }

    expand(panelId: string): void {
        if (isCompositePanelKey(panelId)) {
            throw new Error("Page panel expansion accepts bare panel ids, not composite panel keys.");
        }
        const host = this.hostProvider();
        if (!host) throw new Error("Page is no longer attached.");
        host.expandPanel(panelId);
    }

    toggleSidebar(): void {
        const host = this.hostProvider();
        if (!host || this.projectItems(host).length === 0) {
            throw new Error("Page has no sidebar panels to show.");
        }
        // Stay consistent with `isOpen`, which reports false before the lazy model exists. Reading
        // a freshly-ensured model instead would see its `open: true` default and CLOSE the sidebar
        // for an agent that read `isOpen: false` and called this to open it.
        const sidebar = host.secondaryViewsModel;
        const open = sidebar ? sidebar.state.get().open : false;
        // PageModel.setSecondaryViewsState silently rewrites `open: false` to `true` while a
        // non-Explorer panel is present (its "mandatory-open clamp"). Reporting success for a
        // close that cannot happen is the silent failure this surface exists to eliminate — so
        // say why instead. The user cannot close it either; the constraint is real, not ours.
        if (open && host.sidebarMandatory) {
            throw new Error(
                "This page's panels keep the sidebar open — it cannot be closed while they are"
                + " present. Only a page whose sole panel is the file Explorer can be closed.",
            );
        }
        host.setSecondaryViewsState({ open: !open });
    }

    get aiVision(): IAiVisionDescriptor {
        const elements = createElements(SIDEBAR_ELEMENTS, ui.highlightElement.bind(ui));
        return {
            kind: "PagePanels",
            summary: "The page's live sidebar panels, whole-sidebar state, and sidebar controls.",
            members: [...PAGE_PANELS_MEMBERS, ...elements.members],
            provide: elements.provide,
            elements: SIDEBAR_ELEMENTS,
            help: "items is a live renderer-order projection of the page's registered sidebar panels. Each item uses a bare panel id and includes the owning editor's instance editorId and editorKind. expand(panelId) accepts bare ids only; duplicate ids select the first rendered owner, and composite editorId::panelId keys are rejected. isOpen and width are read-only observations from the sidebar model; isOpen is false and width is null until that lazy model exists. toggleSidebar() only flips the whole sidebar container and throws when there are no panels; it never creates an Explorer. To close an individual panel, use that panel's own header close control because the owning editor determines whether closing hides or disposes it.",
            summarize: () => ({
                kind: "PagePanels",
                items: this.items,
                isOpen: this.isOpen,
                width: this.width,
            }),
        };
    }
}
