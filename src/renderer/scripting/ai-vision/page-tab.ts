import { pagesModel } from "../../api/pages";
import type { IPageHost } from "../../api/pages/IPageHost";
import { ui } from "../../api/ui";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { createElements } from "./elements";
import { pageScopeSelector } from "./page-elements";

const TAB_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "page-tab", purpose: "This page's tab-strip root." },
    { name: "tab-language", purpose: "This page's language/editor-type button; absent for editors without a language control." },
    { name: "tab-close", purpose: "This page's close or ungroup button." },
    { name: "tab-sound", purpose: "This page's mute/unmute button; present only while its sound indicator is shown." },
];

const TAB_MEMBERS: readonly IAiMember[] = [
    { name: "title", kind: "property", summary: "The real page title, including when the pinned tab hides its title text." },
    { name: "modified", kind: "property", summary: "Whether this page has unsaved changes." },
    { name: "pinned", kind: "property", summary: "Whether this page's tab is pinned." },
    { name: "active", kind: "property", summary: "Whether this tab is active, including the grouped partner shown beside the active page." },
    { name: "soundIndicator", kind: "property", summary: "Whether the tab's sound/mute indicator is currently present." },
];

function centerTabElement(selector: string): void {
    const element = document.querySelector<HTMLElement>(selector);
    element?.scrollIntoView({ block: "nearest", inline: "center" });
}

export class PageTabNode implements IAiVisible {
    constructor(private readonly hostProvider: () => IPageHost | null) {}

    private get page() {
        const host = this.hostProvider();
        return host ? pagesModel.findPage(host.id) : undefined;
    }

    get title(): string {
        return this.page?.title ?? "";
    }

    get modified(): boolean {
        return this.page?.modified ?? false;
    }

    get pinned(): boolean {
        return this.page?.pinned ?? false;
    }

    get active(): boolean {
        const page = this.page;
        if (!page) return false;
        const state = pagesModel.state.get();
        const activeId = state.ordered[state.ordered.length - 1]?.id;
        const groupedId = activeId
            ? state.leftRight.get(activeId) ?? state.rightLeft.get(activeId)
            : undefined;
        return page.id === activeId || page.id === groupedId;
    }

    get soundIndicator(): boolean {
        const editor = this.page?.mainEditor;
        const state = editor?.state.get() as { _anyTabAudible?: boolean; pageMuted?: boolean } | undefined;
        const toggleMuteAll = (editor as { toggleMuteAll?: () => void } | null)?.toggleMuteAll;
        return Boolean(state?._anyTabAudible || state?.pageMuted || toggleMuteAll);
    }

    get aiVision(): IAiVisionDescriptor {
        const host = this.hostProvider();
        const elements = createElements(TAB_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: host ? pageScopeSelector(host.id) : undefined,
            scopeRootNames: ["page-tab"],
            beforeHighlight: centerTabElement,
            highlightOptions: { scroll: false },
        });
        return {
            kind: "PageTab",
            summary: "This page's tab-strip entry, presentation state, and visible controls.",
            members: [...TAB_MEMBERS, ...elements.members],
            provide: elements.provide,
            elements: TAB_ELEMENTS,
            help: "title is the real page title even when a pinned tab hides its title text on screen. modified, pinned, active, and soundIndicator mirror the live tab presentation; active includes the grouped partner shown beside the active page. Use elements and highlight(name) for the tab root and its conditional controls. Reading or highlighting this node never activates the page. Tab actions are on the pages node: use pages.showPage, closePage, pinTab, unpinTab, and moveTab.",
            summarize: () => ({
                kind: "PageTab",
                title: this.title,
                modified: this.modified,
                pinned: this.pinned,
                active: this.active,
                soundIndicator: this.soundIndicator,
            }),
        };
    }
}
