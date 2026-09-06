import type { IComparePair } from "../../api/types/compare";
import type { PagesModel } from "../../api/pages/PagesModel";
import { ui } from "../../api/ui";
import { createElements } from "./elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "./page-elements";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const COMPARE_ELEMENTS = [
    { name: "compare-root", purpose: "The mounted compare surface containing the side-by-side diff and toolbar." },
    { name: "compare-exit", purpose: "Leave compare mode for the active page pair." },
] as const;

const COMPARE_MEMBERS: readonly IAiMember[] = [
    { name: "pairs", kind: "property", summary: "Active compare pairs with explicit left/right page ids, titles, and file paths." },
    { name: "enter", kind: "method", signature: "enter(pageId: string): void", summary: "Enter compare mode for the grouped pair containing either page id; throws when grouping or comparability is missing.", caution: "changes page layout and compare mode" },
    { name: "exit", kind: "method", signature: "exit(pageId: string): void", summary: "Leave compare mode for the pair containing either page id; throws when the pair is missing or inactive.", caution: "changes page layout and compare mode" },
];

interface ComparePairIds {
    readonly resolvedPageId: string;
    readonly leftPageId?: string;
    readonly rightPageId?: string;
}

export class CompareModeNode implements IAiVisible {
    constructor(private readonly pagesModel: PagesModel) {}

    get pairs(): readonly IComparePair[] {
        const state = this.pagesModel.state.get();
        const pairs: IComparePair[] = [];
        for (const leftPageId of state.compareGroups) {
            const rightPageId = state.leftRight.get(leftPageId);
            const leftPage = this.pagesModel.findPage(leftPageId);
            const rightPage = rightPageId ? this.pagesModel.findPage(rightPageId) : undefined;
            if (!leftPage || !rightPage || !rightPageId) continue;
            const leftFilePath = leftPage.mainEditor?.filePath;
            const rightFilePath = rightPage.mainEditor?.filePath;
            pairs.push({
                leftPageId,
                rightPageId,
                leftTitle: leftPage.title,
                rightTitle: rightPage.title,
                ...(leftFilePath ? { leftFilePath } : {}),
                ...(rightFilePath ? { rightFilePath } : {}),
            });
        }
        return pairs;
    }

    enter(pageId: string): void {
        const pair = this.resolvePair(pageId);
        if (!pair.leftPageId || !pair.rightPageId) {
            throw new Error(
                `Cannot enter compare mode for requested page ${JSON.stringify(pageId)} `
                + `resolved as ${JSON.stringify(pair.resolvedPageId)}: no grouped pair exists.`,
            );
        }
        if (!this.pagesModel.query.canCompare(pair.leftPageId, pair.rightPageId)) {
            throw new Error(
                `Cannot enter compare mode for pages ${JSON.stringify(pair.leftPageId)} and `
                + `${JSON.stringify(pair.rightPageId)}: the grouped pair is not comparable.`,
            );
        }
        if (!this.pagesModel.enterCompareMode(pageId)) {
            throw new Error(
                `Cannot enter compare mode for pages ${JSON.stringify(pair.leftPageId)} and `
                + `${JSON.stringify(pair.rightPageId)}: compare entry failed after preflight.`,
            );
        }
    }

    exit(pageId: string): void {
        const pair = this.resolvePair(pageId);
        if (!pair.leftPageId || !pair.rightPageId) {
            throw new Error(
                `Cannot exit compare mode for requested page ${JSON.stringify(pageId)} `
                + `resolved as ${JSON.stringify(pair.resolvedPageId)}: no grouped pair exists.`,
            );
        }
        if (!this.pagesModel.query.isInCompareMode(pair.resolvedPageId).active) {
            throw new Error(
                `Cannot exit compare mode for pages ${JSON.stringify(pair.leftPageId)} and `
                + `${JSON.stringify(pair.rightPageId)}: compare mode is inactive.`,
            );
        }
        this.pagesModel.exitCompareMode(pageId);
    }

    get aiVision(): IAiVisionDescriptor {
        const activePair = this.activePair();
        const scopePageId = activePair?.leftPageId ?? "__no_active_compare_pair__";
        const elements = createElements(COMPARE_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageScopeSelector(scopePageId),
            beforeHighlight: activePair
                ? () => activatePageAndWaitForLayout(activePair.leftPageId)
                : undefined,
        });
        return {
            kind: "CompareMode",
            summary: "Compare mode for active grouped page pairs.",
            members: [...COMPARE_MEMBERS, ...elements.members],
            help: "pairs lists active compare pairs with explicit left/right page ids, titles, and available file paths. enter(pageId) and exit(pageId) accept either member of a grouped pair; both throw a diagnostic naming the resolved ids when the pair is missing, not comparable, or inactive. elements contains only compare-root and compare-exit, scoped to the active pair's left page slot. Highlighting activates that left slot and waits for layout; the right slot never owns or scopes the compare surface.",
            elements: COMPARE_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({ kind: "CompareMode", pairs: this.pairs }),
        };
    }

    private resolvePair(pageId: string): ComparePairIds {
        const state = this.pagesModel.state.get();
        const resolvedPageId = this.pagesModel.query.findPage(pageId)?.id ?? pageId;
        const rightPageId = state.leftRight.get(resolvedPageId);
        if (rightPageId) return { resolvedPageId, leftPageId: resolvedPageId, rightPageId };
        const leftPageId = state.rightLeft.get(resolvedPageId);
        if (leftPageId) return { resolvedPageId, leftPageId, rightPageId: resolvedPageId };
        return { resolvedPageId };
    }

    private activePair(): { leftPageId: string; rightPageId: string } | undefined {
        const activePageId = this.pagesModel.activePage?.id;
        if (!activePageId) return undefined;
        const state = this.pagesModel.state.get();
        if (state.compareGroups.has(activePageId)) {
            const rightPageId = state.leftRight.get(activePageId);
            if (rightPageId) return { leftPageId: activePageId, rightPageId };
        }
        const leftPageId = state.rightLeft.get(activePageId);
        if (leftPageId && state.compareGroups.has(leftPageId)) {
            return { leftPageId, rightPageId: activePageId };
        }
        return undefined;
    }
}
