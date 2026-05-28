import type { PagesModel } from "./PagesModel";

export class PagesLayoutModel {
    constructor(private model: PagesModel) {}

    moveTab = (fromId: string, toId: string) => {
        const { pages } = this.model.state.get();
        const fromIndex = pages.findIndex((p) => p.id === fromId);
        const toIndex = pages.findIndex((p) => p.id === toId);
        this.moveTabByIndex(fromIndex, toIndex);
    };

    moveTabByIndex = (fromIndex: number, toIndex: number) => {
        if (fromIndex === -1 || toIndex === -1) return;
        const { pages } = this.model.state.get();
        const fromPinned = pages[fromIndex].pinned;
        const toPinned = pages[toIndex].pinned;
        if (fromPinned !== toPinned) return;
        const newPages = [...pages];
        const [movedPage] = newPages.splice(fromIndex, 1);
        newPages.splice(toIndex, 0, movedPage);
        this.model.state.update((s) => {
            s.pages = newPages;
        });
        this.fixGrouping();
        this.model.persistence.saveStateDebounced();
        this.model.onFocus.send(movedPage);
    };

    pinTab = (pageId: string) => {
        const { pages } = this.model.state.get();
        const pageIndex = pages.findIndex((p) => p.id === pageId);
        if (pageIndex === -1) return;
        const page = pages[pageIndex];
        if (page.pinned) return;

        const pinnedCount = pages.filter((p) => p.pinned).length;

        page.pinned = true;

        if (pageIndex !== pinnedCount) {
            const newPages = [...pages];
            const [movedPage] = newPages.splice(pageIndex, 1);
            newPages.splice(pinnedCount, 0, movedPage);
            this.model.state.update((s) => {
                s.pages = newPages;
            });
        }

        this.model.persistence.saveStateDebounced();
    };

    unpinTab = (pageId: string) => {
        const { pages } = this.model.state.get();
        const pageIndex = pages.findIndex((p) => p.id === pageId);
        if (pageIndex === -1) return;
        const page = pages[pageIndex];
        if (!page.pinned) return;

        const remainingPinned = pages.filter(
            (p) => p.pinned && p !== page
        ).length;

        page.pinned = false;

        if (pageIndex !== remainingPinned) {
            const newPages = [...pages];
            const [movedPage] = newPages.splice(pageIndex, 1);
            newPages.splice(remainingPinned, 0, movedPage);
            this.model.state.update((s) => {
                s.pages = newPages;
            });
        }

        this.model.persistence.saveStateDebounced();
    };

    group = (leftPageId: string, rightPageId: string) => {
        this.ungroup(leftPageId);
        this.ungroup(rightPageId);
        const state = this.model.state.get();
        const newLeftRight = new Map(state.leftRight);
        const newRightLeft = new Map(state.rightLeft);
        newLeftRight.set(leftPageId, rightPageId);
        newRightLeft.set(rightPageId, leftPageId);
        this.model.state.update((s) => {
            s.leftRight = newLeftRight;
            s.rightLeft = newRightLeft;
        });
        this.model.persistence.saveStateDebounced();
    };

    /**
     * Ungroup the pair containing `pageId`. Walkthrough 06 / CK7: also drops
     * any `compareGroups` entry for the pair so compare-mode exits when the
     * grouping ends.
     */
    ungroup = (pageId: string) => {
        const state = this.model.state.get();
        if (!state.leftRight.has(pageId) && !state.rightLeft.has(pageId)) return;

        const newLeftRight = new Map(state.leftRight);
        const newRightLeft = new Map(state.rightLeft);
        const rightId = newLeftRight.get(pageId);
        const leftId = newRightLeft.get(pageId);
        newLeftRight.delete(pageId);
        newRightLeft.delete(pageId);
        if (leftId) {
            newLeftRight.delete(leftId);
        }
        if (rightId) {
            newRightLeft.delete(rightId);
        }
        // Identify the leftId of the pair (whichever direction `pageId` was in).
        const pairLeftId = state.leftRight.has(pageId) ? pageId : leftId;
        const nextCompareGroups = new Set(state.compareGroups);
        if (pairLeftId) nextCompareGroups.delete(pairLeftId);

        this.model.state.update((s) => {
            s.leftRight = newLeftRight;
            s.rightLeft = newRightLeft;
            s.compareGroups = nextCompareGroups;
        });
        this.model.persistence.saveStateDebounced();
    };

    groupTabs = (
        id1: string,
        id2: string,
        enforceAdjacency = false
    ) => {
        const state = this.model.state.get();
        const pageId1 = this.model.query.findPage(id1)?.id ?? id1;
        const pageId2 = this.model.query.findPage(id2)?.id ?? id2;
        const idx1 = state.pages.findIndex((p) => p.id === pageId1);
        const idx2 = state.pages.findIndex((p) => p.id === pageId2);
        if (idx1 === -1 || idx2 === -1 || idx1 === idx2) {
            return;
        }

        const isPinned1 = state.pages[idx1].pinned;
        const isPinned2 = state.pages[idx2].pinned;

        if (enforceAdjacency && !isPinned1 && !isPinned2) {
            const doMove = Math.abs(idx1 - idx2) !== 1;
            if (idx1 < idx2) {
                doMove && this.moveTabByIndex(idx2, idx1 + 1);
                this.group(pageId1, pageId2);
            } else {
                doMove && this.moveTabByIndex(idx2, idx1 - 1);
                this.group(pageId2, pageId1);
            }
        } else {
            if (idx1 < idx2) {
                this.group(pageId1, pageId2);
            } else {
                this.group(pageId2, pageId1);
            }
        }
    };

    /**
     * Sanity sweep — fix swapped pairs and drop dangling groups. Called from
     * `removePage` and `moveTabByIndex`.
     *
     * Walkthrough 07 / GK3: kept as single sweep. CK7: no trailing
     * `fixCompareMode()` call — `ungroup`'s own compareGroups cleanup covers it.
     */
    fixGrouping = () => {
        const state = this.model.state.get();
        const toSwap: Array<[string, string]> = [];
        const toRemove = new Set<string>();
        const allIds = new Set<string>(state.pages.map((p) => p.id));

        for (let i = 0; i < state.pages.length - 1; i++) {
            const leftPageId = state.pages[i].id;
            const rightPageId = state.pages[i + 1].id;
            const groupedSwap = state.rightLeft.get(leftPageId);
            if (rightPageId === groupedSwap) {
                toSwap.push([leftPageId, rightPageId]);
            }
        }

        for (const leftId of state.leftRight.keys()) {
            if (!allIds.has(leftId)) {
                toRemove.add(leftId);
            }
        }
        for (const rightId of state.rightLeft.keys()) {
            if (!allIds.has(rightId)) {
                toRemove.add(rightId);
            }
        }

        [...toRemove].forEach((pageId) => {
            this.ungroup(pageId);
        });
        toSwap.forEach(([leftPageId, rightPageId]) => {
            this.ungroup(leftPageId);
            this.ungroup(rightPageId);
            this.group(leftPageId, rightPageId);
        });
    };

    // ── Compare mode (walkthrough 06 / CK4) ────────────────────────────

    /**
     * Activate compare mode for the pair containing `pageId`. Accepts either
     * the left or right page id; resolves the leftId via `leftRight`/`rightLeft`.
     * Returns true if compare mode was entered (precondition satisfied),
     * false otherwise.
     */
    enterCompareMode = (pageId: string): boolean => {
        const state = this.model.state.get();
        const resolvedPageId = this.model.query.findPage(pageId)?.id ?? pageId;

        // Resolve leftId.
        let leftId: string | undefined;
        let rightId: string | undefined;
        if (state.leftRight.has(resolvedPageId)) {
            leftId = resolvedPageId;
            rightId = state.leftRight.get(resolvedPageId);
        } else if (state.rightLeft.has(resolvedPageId)) {
            leftId = state.rightLeft.get(resolvedPageId);
            rightId = resolvedPageId;
        }

        if (!leftId || !rightId) return false;
        if (!this.model.query.canCompare(leftId, rightId)) return false;

        const nextCompareGroups = new Set(state.compareGroups);
        nextCompareGroups.add(leftId);
        this.model.state.update((s) => { s.compareGroups = nextCompareGroups; });
        return true;
    };

    /**
     * Exit compare mode for the pair containing `pageId`. Accepts either side.
     */
    exitCompareMode = (pageId: string): void => {
        const state = this.model.state.get();
        const resolvedPageId = this.model.query.findPage(pageId)?.id ?? pageId;
        let leftId: string | undefined;
        if (state.leftRight.has(resolvedPageId)) {
            leftId = resolvedPageId;
        } else if (state.rightLeft.has(resolvedPageId)) {
            leftId = state.rightLeft.get(resolvedPageId);
        }
        if (!leftId) return;
        if (!state.compareGroups.has(leftId)) return;
        const nextCompareGroups = new Set(state.compareGroups);
        nextCompareGroups.delete(leftId);
        this.model.state.update((s) => { s.compareGroups = nextCompareGroups; });
    };
}
