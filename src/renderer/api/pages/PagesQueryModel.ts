import type { PagesModel } from "./PagesModel";
import type { PageModel } from "./PageModel";
import type { TextFileModel } from "../../editors/text";

/**
 * PagesQueryModel — Read-only queries on the page collection.
 */
export class PagesQueryModel {
    constructor(private model: PagesModel) {}

    /**
     * Find a page by any associated ID: page ID OR any of its editor IDs.
     * All IDs are unique, so this is safe and prevents page/editor ID confusion bugs.
     */
    findPage = (id?: string): PageModel | undefined => {
        if (!id) return undefined;
        return this.model.state.get().pages.find((p) =>
            p.id === id || p.editors.some((e) => e.id === id),
        );
    };

    /** Find the page whose MAIN editor carries this filePath (the "is this
     *  file already open in a tab?" dedupe used by open/diff flows). */
    findPageByFilePath = (filePath?: string): PageModel | undefined => {
        if (!filePath) return undefined;
        return this.model.state.get().pages.find((p) => {
            const main = p.mainEditor as { filePath?: string } | null;
            return main?.filePath === filePath;
        });
    };

    get activePage(): PageModel | undefined {
        const { ordered } = this.model.state.get();
        return ordered.length ? ordered[ordered.length - 1] : undefined;
    }

    get groupedPage(): PageModel | undefined {
        const activePage = this.activePage;
        if (!activePage) return undefined;
        return this.getGroupedPage(activePage.id);
    }

    getGroupedPage = (withId: string): PageModel | undefined => {
        const state = this.model.state.get();
        const pageId = this.findPage(withId)?.id ?? withId;
        const groupedWithId =
            state.leftRight.get(pageId) || state.rightLeft.get(pageId);
        if (groupedWithId) {
            return this.findPage(groupedWithId);
        }
        return undefined;
    };

    getLeftGroupedPage = (withId: string): PageModel | undefined => {
        const state = this.model.state.get();
        const pageId = this.findPage(withId)?.id ?? withId;
        const groupedWithId = state.rightLeft.get(pageId);
        if (groupedWithId) {
            return this.findPage(groupedWithId);
        }
        return undefined;
    };

    isLastPage = (id?: string): boolean => {
        if (!id) return false;
        const { pages } = this.model.state.get();
        const pageId = this.findPage(id)?.id ?? id;
        return !!(pages.length && pages[pages.length - 1].id === pageId);
    };

    isGrouped = (id: string): boolean => {
        const state = this.model.state.get();
        const pageId = this.findPage(id)?.id ?? id;
        return state.leftRight.has(pageId) || state.rightLeft.has(pageId);
    };

    get pages(): PageModel[] {
        return this.model.state.get().pages;
    }

    // ── Compare-mode helpers (walkthrough 06 / CK3, CK5, GK2) ──────────

    /**
     * Returns the page's TextFileModel host (the actual content-bearing model
     * for text editors), or null. Reads the editor's `contentHost` and
     * returns it when structurally a TextFileModel.
     */
    getTextFileHost = (pageId: string): TextFileModel | null => {
        const page = this.findPage(pageId);
        const main = page?.mainEditorInstance;
        if (!main) return null;
        const host = main.contentHost as unknown as { type?: string } | null;
        if (host && host.type === "textFile") {
            return host as unknown as TextFileModel;
        }
        return null;
    };

    /** True if both pages exist, are grouped together, and both have a TextFileModel host. */
    canCompare = (leftId: string, rightId: string): boolean => {
        const left = this.findPage(leftId);
        const right = this.findPage(rightId);
        if (!left || !right) return false;
        const state = this.model.state.get();
        const groupedRight = state.leftRight.get(left.id);
        if (groupedRight !== right.id) return false;
        return this.getTextFileHost(left.id) !== null
            && this.getTextFileHost(right.id) !== null;
    };

    /**
     * Compare-mode lookup. Accepts either left or right page id; resolves the
     * leftId via leftRight/rightLeft. Returns { active, leftId, rightId } when
     * the pair is in compareGroups; { active: false } otherwise.
     */
    isInCompareMode = (pageId: string): {
        active: boolean;
        leftId?: string;
        rightId?: string;
    } => {
        const state = this.model.state.get();
        const resolvedPageId = this.findPage(pageId)?.id ?? pageId;
        // Is this the left side?
        const right = state.leftRight.get(resolvedPageId);
        if (right && state.compareGroups.has(resolvedPageId)) {
            return { active: true, leftId: resolvedPageId, rightId: right };
        }
        // Is this the right side?
        const left = state.rightLeft.get(resolvedPageId);
        if (left && state.compareGroups.has(left)) {
            return { active: true, leftId: left, rightId: resolvedPageId };
        }
        return { active: false };
    };
}
