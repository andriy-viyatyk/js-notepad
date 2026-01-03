import { Subscription } from "../common/classes/events";
import { TModel } from "../common/classes/model";
import { TGlobalState } from "../common/classes/state";
import { parseObject } from "../common/parseUtils";
import { api } from "../ipc/renderer/api";
import rendererEvents from "../ipc/renderer/renderer-events";
import {
    newTextFileModel,
    newTextFileModelFromState,
    TextFileModel,
} from "../pages/text-file-page/TextFilePage.model";
import { openFilesNameTemplate } from "../shared/constants";
import { IPage, WindowState } from "../shared/types";
import { filesModel } from "./files-model";
import { PageModel } from "./page-model";

const defaultOpenFilesState = {
    pages: [] as PageModel[],
    ordered: [] as PageModel[],
    leftRight: new Map<string, string>(),
    rightLeft: new Map<string, string>(),
};

type OpenFilesState = typeof defaultOpenFilesState;

export class PagesModel extends TModel<OpenFilesState> {
    onShow = new Subscription<PageModel>();
    onFocus = new Subscription<PageModel>();

    addPage = (page: PageModel): PageModel => {
        const pageId = page.state.get().id;
        const existingPage = this.findPage(pageId);
        if (existingPage) {
            this.showPage(pageId);
            return existingPage;
        }

        this.initPage(page);

        this.state.update((s) => {
            s.pages.push(page);
            s.ordered.push(page);
        });
        this.saveState();

        return page;
    };

    private initPage = (page: PageModel) => {
        const res = new Promise((resolve) => {
            page.onClose = (res) => {
                const isActivePage = this.activePage === page;
                this.state.update((s) => {
                    s.pages = s.pages.filter((p) => p !== page);
                    s.ordered = s.ordered.filter((p) => p !== page);
                });
                this.fixGrouping();
                this.saveState();
                resolve(res);
                if (isActivePage) {
                    const ordered = this.state.get().ordered;
                    if (ordered.length) {
                        this.onShow.send(ordered[ordered.length - 1]);
                        this.onFocus.send(ordered[ordered.length - 1]);
                    }
                }
            };
        });

        res.then(() => {
            this.checkEmptyPage();
        });

        return res;
    };

    showPage = (pageId?: string) => {
        if (!pageId) return;
        const { ordered } = this.state.get();
        const page = ordered.find((p) => p.state.get().id === pageId);
        if (page && page !== ordered[ordered.length - 1]) {
            this.state.update((s) => {
                s.ordered = [...s.ordered.filter((p) => p !== page), page];
            });
            this.onShow.send(page);
            this.onFocus.send(page);
        }
    };

    closePage = (pageId: string) => {
        const page = this.state
            .get()
            .pages.find((p) => p.state.get().id === pageId);
        page?.close(undefined);
    };

    closeToTheRight = async (pageId: string) => {
        const { pages } = this.state.get();
        const pagesToClose = [];
        for (let i = pages.length - 1; i >= 0; i--) {
            if (pages[i].state.get().id === pageId) {
                break;
            }
            pagesToClose.push(pages[i]);
        }
        for (const page of pagesToClose) {
            const closed = await page.close(undefined);
            if (!closed) {
                break;
            }
        }
    };

    closeOtherPages = async (pageId: string) => {
        const { pages } = this.state.get();
        const pagesToClose = [];
        for (let i = pages.length - 1; i >= 0; i--) {
            if (pages[i].state.get().id !== pageId) {
                pagesToClose.push(pages[i]);
            }
        }
        for (const page of pagesToClose) {
            const closed = await page.close(undefined);
            if (!closed) {
                break;
            }
        }
    };

    findPage = (pageId?: string) => {
        return pageId
            ? this.state.get().pages.find((p) => p.state.get().id === pageId)
            : undefined;
    };

    get activePage() {
        const { ordered } = this.state.get();
        return ordered.length ? ordered[ordered.length - 1] : undefined;
    }

    get groupedPage() {
        const activePage = this.activePage;
        if (!activePage) {
            return undefined;
        }
        return this.getGroupedPage(activePage.state.get().id);
    }

    isLastPage = (pageId?: string) => {
        const { pages } = this.state.get();
        return (
            pages.length && pages[pages.length - 1].state.get().id === pageId
        );
    };

    addEmptyPage = (): PageModel => {
        const emptyFile = newTextFileModel("");
        return this.addPage(emptyFile as unknown as PageModel);
    };

    checkEmptyPage = () => {
        setTimeout(() => {
            if (this.state.get().pages.length === 0) {
                this.addEmptyPage();
            }
        }, 0);
    };

    init = async () => {
        rendererEvents.eBeforeQuit.subscribe(this.onAppQuit);
        await this.restoreState();
        const fileToOpen = await api.getFileToOpen();
        if (fileToOpen) {
            await this.openFile(fileToOpen);
        }
        this.checkEmptyPage();

        rendererEvents.eOpenFile.subscribe(this.openFile);
        rendererEvents.eShowPage.subscribe(this.showPage);
        rendererEvents.eMovePageIn.subscribe(this.movePageIn);
        rendererEvents.eMovePageOut.subscribe(this.movePageOut);

        setTimeout(() => {
            api.windowReady();
        }, 0);
    };

    onAppQuit = async () => {
        await Promise.all(
            this.state.get().pages.map((model) => model.saveState())
        );
        await this.saveState();
        api.setCanQuit(true);
    };

    restoreModel = (data: Partial<IPage>): PageModel | null => {
        let model: PageModel | null = null;
        switch (data.type) {
            case "textFile":
                model = newTextFileModel("") as unknown as PageModel;
                break;
            default:
                console.warn("Unknown page type:", data.type);
                return null;
        }
        if (model) {
            model.applyRestoreData(data);
        }
        return model;
    };

    saveState = async (): Promise<void> => {
        const activePagesData = this.state
            .get()
            .pages.map((model) => model.getRestoreData());

        const activePageId = this.activePage?.state.get().id;
        const storedState: WindowState = {
            pages: activePagesData,
            activePageId,
        };

        await filesModel.saveDataFile(
            openFilesNameTemplate,
            JSON.stringify(storedState, null, 4)
        );
    };

    restoreState = async () => {
        const data = parseObject(
            await filesModel.getDataFile(openFilesNameTemplate)
        );
        if (!data || !data.pages || !Array.isArray(data.pages)) {
            return;
        }

        const models = (data.pages as Partial<IPage>[])
            .map((pageData) => this.restoreModel(pageData))
            .filter((model) => model) as PageModel[];

        models.forEach((model) => this.initPage(model));
        const activeModel = models.find(
            (m) => m.state.get().id === data.activePageId
        );
        const orderedModels = activeModel
            ? [...models.filter((m) => m !== activeModel), activeModel]
            : models;

        this.state.update((s) => {
            s.pages = models;
            s.ordered = orderedModels;
        });
    };

    moveTab = (fromId: string, toId: string) => {
        const { pages } = this.state.get();
        const fromIndex = pages.findIndex((p) => p.state.get().id === fromId);
        const toIndex = pages.findIndex((p) => p.state.get().id === toId);
        this.moveTabByIndex(fromIndex, toIndex);
    };

    moveTabByIndex = (fromIndex: number, toIndex: number) => {
        if (fromIndex === -1 || toIndex === -1) return;
        const { pages } = this.state.get();
        const newPages = [...pages];
        const [movedPage] = newPages.splice(fromIndex, 1);
        newPages.splice(toIndex, 0, movedPage);
        this.state.update((s) => {
            s.pages = newPages;
        });
        this.fixGrouping();
        this.saveState();
        this.onFocus.send(movedPage);
    };

    showNext = () => {
        const pages = this.state.get().pages;
        if (!pages.length) return;
        const activePage = this.activePage;
        let nextIndex = pages.findIndex((p) => p === activePage) + 1;
        if (nextIndex >= pages.length) {
            nextIndex = 0;
        }
        this.showPage(pages[nextIndex].state.get().id);
    };

    showPrevious = () => {
        const pages = this.state.get().pages;
        if (!pages.length) return;
        const activePage = this.activePage;
        let prevIndex = pages.findIndex((p) => p === activePage) - 1;
        if (prevIndex < 0) {
            prevIndex = pages.length - 1;
        }
        this.showPage(pages[prevIndex].state.get().id);
    };

    focusPage = (page: PageModel) => {
        this.onFocus.send(page);
    };

    openFile = async (filePath?: string) => {
        if (!filePath) return;
        const existingPage = this.state.get().pages.find((p) => {
            const pState = p.state.get();
            return (
                pState.type === "textFile" &&
                (pState as any).filePath === filePath
            );
        });
        if (existingPage) {
            this.showPage(existingPage.state.get().id);
            return;
        }

        const pageModel = newTextFileModel(filePath);
        pageModel.state.update((s) => {
            s.language = "";
        });
        await pageModel.restore();
        this.addPage(pageModel as unknown as PageModel);
    };

    openFileWithDialog = async () => {
        const filePaths = await api.showOpenFileDialog({
            title: "Open File",
            multiSelections: false,
        });
        if (filePaths && filePaths.length > 0) {
            await this.openFile(filePaths[0]);
        }
    };

    movePageIn = async (data?: {
        page: Partial<IPage>;
        targetPageId: string | undefined;
    }) => {
        if (!data || !data.page) {
            return;
        }
        const pageModel = newTextFileModelFromState(data.page);
        await pageModel.restore();
        const targetIndex = data.targetPageId
            ? this.state
                  .get()
                  .pages.findIndex(
                      (p) => p.state.get().id === data.targetPageId
                  )
            : -1;
        if (targetIndex === -1) {
            this.addPage(pageModel);
            const pages = this.state.get().pages;
            if (pages.length === 2) {
                const firstPage = pages[0];
                const firstPageState = firstPage.state.get();
                if (
                    !firstPageState.modified &&
                    !(firstPageState as any).content &&
                    !firstPageState.filePath
                ) {
                    firstPage.close(undefined);
                }
            }
        } else {
            this.initPage(pageModel);
            this.state.update((s) => {
                s.pages.splice(targetIndex, 0, pageModel);
                s.ordered.push(pageModel);
            });
            this.fixGrouping();
            this.saveState();
        }
    };

    movePageOut = async (pageId?: string) => {
        const page = this.findPage(pageId);
        if (!page) {
            return;
        }
        await page.saveState();
        const closeWindow = this.state.get().pages.length === 1;
        page.skipSave = true;
        if (closeWindow) {
            this.state.update((s) => {
                s.pages = s.pages.filter((p) => p !== page);
                s.ordered = s.ordered.filter((p) => p !== page);
            });
            this.saveState();
            api.closeWindow();
        } else {
            page.close(undefined);
        }
    };

    ungroup = (pageId: string) => {
        const state = this.state.get();
        if (state.leftRight.has(pageId) || state.rightLeft.has(pageId)) {
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
            this.state.update((s) => {
                s.leftRight = newLeftRight;
                s.rightLeft = newRightLeft;
            });
        }
    };

    group = (leftPageId: string, rightPageId: string) => {
        this.ungroup(leftPageId);
        this.ungroup(rightPageId);
        const state = this.state.get();
        const newLeftRight = new Map(state.leftRight);
        const newRightLeft = new Map(state.rightLeft);
        newLeftRight.set(leftPageId, rightPageId);
        newRightLeft.set(rightPageId, leftPageId);
        this.state.update((s) => {
            s.leftRight = newLeftRight;
            s.rightLeft = newRightLeft;
        });
    };

    isGrouped = (pageId: string) => {
        const state = this.state.get();
        return state.leftRight.has(pageId) || state.rightLeft.has(pageId);
    };

    fixGrouping = () => {
        const state = this.state.get();
        const toSwap: Array<[string, string]> = [];
        const toRemove = new Set<string>();
        const allIds = new Set<string>();
        for (let i = 0; i < state.pages.length - 1; i++) {
            const leftPageId = state.pages[i].id;
            allIds.add(leftPageId);
            const rightPageId = state.pages[i + 1].id;
            const groupedWith = state.leftRight.get(leftPageId);
            const groupedSwap = state.rightLeft.get(leftPageId);
            if (rightPageId === groupedSwap) {
                toSwap.push([leftPageId, rightPageId]);
            } else if (groupedWith && groupedWith !== rightPageId) {
                toRemove.add(leftPageId);
            }
        }
        const lastPageId = state.pages[state.pages.length - 1]?.id;
        Boolean(lastPageId) && allIds.add(lastPageId);

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

    groupWithLeft = (rightPageId: string) => {
        const pageIndex = this.state
            .get()
            .pages.findIndex((p) => p.id === rightPageId);
        if (pageIndex > 0) {
            const leftPageId = this.state.get().pages[pageIndex - 1].id;
            this.group(leftPageId, rightPageId);
        }
    };

    groupWithRight = (leftPageId: string) => {
        const state = this.state.get();
        const pageIndex = state.pages.findIndex((p) => p.id === leftPageId);
        if (pageIndex >= 0 && pageIndex < state.pages.length - 1) {
            const rightPageId = state.pages[pageIndex + 1].id;
            this.group(leftPageId, rightPageId);
        }
    };

    canGroupWithLeft = (rightPageId: string) => {
        const pageIndex = this.state
            .get()
            .pages.findIndex((p) => p.id === rightPageId);
        return pageIndex > 0;
    };

    canGroupWithRight = (leftPageId: string) => {
        const state = this.state.get();
        const pageIndex = state.pages.findIndex((p) => p.id === leftPageId);
        return pageIndex >= 0 && pageIndex < state.pages.length - 1;
    };

    getGroupedPage = (withPageId: string) => {
        const state = this.state.get();
        const groupedWithId =
            state.leftRight.get(withPageId) || state.rightLeft.get(withPageId);
        if (groupedWithId) {
            return this.findPage(groupedWithId);
        }
        return undefined;
    };

    groupTabs = (pageId1: string, pageId2: string) => {
        const state = this.state.get();
        const idx1 = state.pages.findIndex((p) => p.id === pageId1);
        const idx2 = state.pages.findIndex((p) => p.id === pageId2);
        if (idx1 === -1 || idx2 === -1 || idx1 === idx2) {
            return;
        }
        const doMove = Math.abs(idx1 - idx2) !== 1;
        if (idx1 < idx2) {
            doMove && this.moveTabByIndex(idx2, idx1 + 1);
            this.group(pageId1, pageId2);
        } else {
            doMove && this.moveTabByIndex(idx2, idx1 - 1);
            this.group(pageId2, pageId1);
        }
    };

    requireGroupedText = (pageId: string) => {
        let groupedPage = this.getGroupedPage(pageId);
        if (groupedPage && !(groupedPage.state.get().type === "textFile")) {
            this.ungroup(pageId);
            groupedPage = undefined;
        }

        if (!groupedPage) {
            groupedPage = this.addEmptyPage() as unknown as PageModel;
            this.groupTabs(pageId, groupedPage.state.get().id);
        }

        return groupedPage as unknown as TextFileModel;
    }
}

export const pagesModel = new PagesModel(
    new TGlobalState(defaultOpenFilesState)
);
pagesModel.init();
