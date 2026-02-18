import { Subscription } from "../core/state/events";
import { TModel } from "../core/state/model";
import { TGlobalState } from "../core/state/state";
import { parseObject } from "../core/utils/parse-utils";
import { api } from "../../ipc/renderer/api";
import rendererEvents from "../../ipc/renderer/renderer-events";
import {
    isTextFileModel,
    newTextFileModel,
    TextFileModel,
} from "../editors/text";
import { openFilesNameTemplate } from "../../shared/constants";
import { IPage, PageEditor, WindowState } from "../../shared/types";
import { filesModel } from "./files-store";
import { PageModel } from "../editors/base";
import { recentFiles } from "./recent-files";
import { debounce } from "../../shared/utils";
import { newEmptyPageModel, newPageModel, newPageModelFromState } from "./page-factory";
import { uuid } from "../core/utils/node-utils";
import { alertError } from "../features/dialogs/alerts/AlertsBar";
import { editorRegistry } from "../editors/registry";
import { getLanguageByExtension } from "./language-mapping";
import { NavPanelModel } from "../features/navigation/nav-panel-store";

const path = require("path");
const fs = require("fs");

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
    private pageSubscriptions = new Map<string, () => void>();

    addPage = (page: PageModel): PageModel => {
        const pageId = page.state.get().id;
        const existingPage = this.findPage(pageId);
        if (existingPage) {
            this.showPage(pageId);
            return existingPage;
        }

        this.attachPage(page);

        this.state.update((s) => {
            s.pages.push(page);
            s.ordered.push(page);
        });
        this.saveState();

        return page;
    };

    attachPage = (page: PageModel) => {
        const pageId = page.id;
        const unsubscribe = page.state.subscribe(() => {
            this.saveStateDebounced();
        });
        this.pageSubscriptions.set(pageId, unsubscribe);
        page.onClose = () => {
            this.detachPage(page);
            this.removePage(page);
        };
    };

    detachPage = (page: PageModel) => {
        const pageId = page.id;
        const unsubscribe = this.pageSubscriptions.get(pageId);
        if (unsubscribe) {
            unsubscribe();
            this.pageSubscriptions.delete(pageId);
        }
        page.onClose = undefined;
    };

    removePage = (page: PageModel) => {
        const isActivePage = this.activePage === page;
        this.state.update((s) => {
            s.pages = s.pages.filter((p) => p !== page);
            s.ordered = s.ordered.filter((p) => p !== page);
        });
        this.fixGrouping();
        this.saveState();
        if (isActivePage) {
            const ordered = this.state.get().ordered;
            if (ordered.length) {
                this.onShow.send(ordered[ordered.length - 1]);
                this.onFocus.send(ordered[ordered.length - 1]);
            }
        }
        this.checkEmptyPage();
    };

    createPageFromFile = async (filePath: string): Promise<PageModel> => {
        const pageModel = await newPageModel(filePath);
        pageModel.state.update((s) => {
            s.language = "";
        });
        await pageModel.restore();
        return pageModel;
    };

    replacePage = (oldModel: PageModel, newModel: PageModel) => {
        const state = this.state.get();
        const rightId = state.leftRight.get(oldModel.id);
        const leftId = state.rightLeft.get(oldModel.id);

        this.state.update((s) => {
            const pIdx = s.pages.indexOf(oldModel);
            if (pIdx !== -1) s.pages[pIdx] = newModel;
            const oIdx = s.ordered.indexOf(oldModel);
            if (oIdx !== -1) s.ordered[oIdx] = newModel;
        });

        if (rightId) {
            this.ungroup(oldModel.id);
            this.group(newModel.id, rightId);
        } else if (leftId) {
            this.ungroup(oldModel.id);
            this.group(leftId, newModel.id);
        }

        this.saveState();
    };

    navigatePageTo = async (pageId: string, newFilePath: string): Promise<boolean> => {
        const oldModel = this.findPage(pageId);
        if (!oldModel) return false;

        const released = await oldModel.confirmRelease();
        if (!released) return false;

        // Preserve pinned state and NavPanel across navigation
        const wasPinned = oldModel.state.get().pinned;
        const navPanel = oldModel.navPanel;
        oldModel.navPanel = null;

        await oldModel.dispose();
        this.detachPage(oldModel);

        let newModel: PageModel;
        if (!fs.existsSync(newFilePath)) {
            alertError(`File not found: ${path.basename(newFilePath)}`);
            newModel = newTextFileModel("");
            newModel.state.update((s) => {
                s.title = path.basename(newFilePath);
            });
            await newModel.restore();
        } else {
            try {
                newModel = await this.createPageFromFile(newFilePath);
            } catch (err) {
                alertError(`Failed to open ${path.basename(newFilePath)}: ${(err as Error).message}`);
                newModel = newTextFileModel("");
                await newModel.restore();
            }
        }

        // Auto-select preview editor for navigated files
        if (newModel.state.get().type === "textFile") {
            const ext = path.extname(newFilePath).toLowerCase();
            const lang = getLanguageByExtension(ext);
            const languageId = lang?.id || "plaintext";
            const previewEditor = editorRegistry.getPreviewEditor(languageId, newFilePath);
            if (previewEditor) {
                newModel.state.update((s) => {
                    s.editor = previewEditor;
                });
            }
        }

        // Restore pinned state on the new model
        if (wasPinned) {
            newModel.state.update((s) => {
                s.pinned = true;
            });
        }

        this.attachPage(newModel);
        this.replacePage(oldModel, newModel);
        this.onShow.send(newModel);
        this.onFocus.send(newModel);

        // Transfer NavPanel from old page to new page
        if (navPanel) {
            newModel.navPanel = navPanel;
            newModel.state.update((s) => {
                s.hasNavPanel = true;
            });
            navPanel.setCurrentFilePath(newFilePath);
            navPanel.updateId(newModel.id);
        }

        return true;
    };

    showPage = (pageId?: string) => {
        if (!pageId) return;
        const { ordered } = this.state.get();
        const page = ordered.find((p) => p.state.get().id === pageId);
        if (page && page !== ordered[ordered.length - 1]) {
            this.state.update((s) => {
                s.ordered = [...s.ordered.filter((p) => p !== page), page];
            });
            this.saveStateDebounced();
            this.onShow.send(page);
            this.onFocus.send(page);
        }
    };

    closeToTheRight = async (pageId: string) => {
        const { pages } = this.state.get();
        const pagesToClose = [];
        for (let i = pages.length - 1; i >= 0; i--) {
            if (pages[i].state.get().id === pageId) {
                break;
            }
            if (!pages[i].state.get().pinned) {
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

    closeOtherPages = async (pageId: string) => {
        const { pages } = this.state.get();
        const pagesToClose = [];
        for (let i = pages.length - 1; i >= 0; i--) {
            if (pages[i].state.get().id !== pageId && !pages[i].state.get().pinned) {
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
        emptyFile.restore();
        return this.addPage(emptyFile as unknown as PageModel);
    };

    addEmptyPageWithNavPanel = (folderPath: string): PageModel => {
        const page = this.addEmptyPage();
        const navPanel = new NavPanelModel(folderPath);
        navPanel.id = page.state.get().id;
        navPanel.flushSave();
        page.navPanel = navPanel;
        page.state.update((s) => {
            s.hasNavPanel = true;
        });
        return page;
    };

    addEditorPage = (editor: PageEditor, language: string, title: string): PageModel => {
        const page = newTextFileModel("");
        page.state.update((s) => {
            s.title = title;
            s.language = language;
            s.editor = editor;
        });
        page.restore();
        return this.addPage(page as unknown as PageModel);
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
        rendererEvents.eOpenDiff.subscribe(this.openDiff);
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

    restoreModel = async (data: Partial<IPage>): Promise<PageModel | null> => {
        const model: PageModel | null = await newEmptyPageModel(data.type);
        if (model) {
            model.applyRestoreData(data);
            await model.restore();
        }
        return model;
    };

    saveState = async (): Promise<void> => {
        const { pages, leftRight } = this.state.get();
        const activePagesData = pages.map((model) => model.getRestoreData());
        const groupings = Array.from(leftRight.entries());

        const activePageId = this.activePage?.state.get().id;
        const storedState: WindowState = {
            pages: activePagesData,
            groupings: groupings,
            activePageId,
        };

        await filesModel.saveDataFile(
            openFilesNameTemplate,
            JSON.stringify(storedState, null, 4)
        );
    };

    saveStateDebounced = debounce(this.saveState, 500);

    restoreState = async () => {
        const data = parseObject(
            await filesModel.getDataFile(openFilesNameTemplate)
        );
        if (!data || !data.pages || !Array.isArray(data.pages)) {
            return;
        }

        const modelsPromise = (data.pages as Partial<IPage>[])
            .map((pageData) => this.restoreModel(pageData));
        const models = (await Promise.all(modelsPromise))
            .filter((model) => model) as PageModel[];

        models.forEach((model) => this.attachPage(model));
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

        if (data.groupings && Array.isArray(data.groupings)) {
            data.groupings.forEach((el: any) => {
                if (Array.isArray(el) && el.length === 2) {
                    this.group(el[0], el[1]);
                }
            });
            this.fixGrouping();
        }
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
        // Enforce pinned/unpinned boundary — cannot drag across sections
        const fromPinned = pages[fromIndex].state.get().pinned;
        const toPinned = pages[toIndex].state.get().pinned;
        if (fromPinned !== toPinned) return;
        const newPages = [...pages];
        const [movedPage] = newPages.splice(fromIndex, 1);
        newPages.splice(toIndex, 0, movedPage);
        this.state.update((s) => {
            s.pages = newPages;
        });
        this.fixGrouping();
        this.saveStateDebounced();
        this.onFocus.send(movedPage);
    };

    pinTab = (pageId: string) => {
        const { pages } = this.state.get();
        const pageIndex = pages.findIndex((p) => p.id === pageId);
        if (pageIndex === -1) return;
        const page = pages[pageIndex];
        if (page.state.get().pinned) return;

        // Calculate target BEFORE changing state (insert after existing pinned tabs)
        const pinnedCount = pages.filter((p) => p.state.get().pinned).length;

        page.state.update((s) => {
            s.pinned = true;
        });

        if (pageIndex !== pinnedCount) {
            const newPages = [...pages];
            const [movedPage] = newPages.splice(pageIndex, 1);
            newPages.splice(pinnedCount, 0, movedPage);
            this.state.update((s) => {
                s.pages = newPages;
            });
        }

        // Note: No need to call fixGrouping() - grouping is position-independent
        this.saveStateDebounced();
    };

    unpinTab = (pageId: string) => {
        const { pages } = this.state.get();
        const pageIndex = pages.findIndex((p) => p.id === pageId);
        if (pageIndex === -1) return;
        const page = pages[pageIndex];
        if (!page.state.get().pinned) return;

        // Calculate target BEFORE changing state (insert after remaining pinned tabs)
        const remainingPinned = pages.filter(
            (p) => p.state.get().pinned && p !== page
        ).length;

        page.state.update((s) => {
            s.pinned = false;
        });

        if (pageIndex !== remainingPinned) {
            const newPages = [...pages];
            const [movedPage] = newPages.splice(pageIndex, 1);
            newPages.splice(remainingPinned, 0, movedPage);
            this.state.update((s) => {
                s.pages = newPages;
            });
        }

        this.saveStateDebounced();
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
        const existingPage = this.state.get().pages.find((p) => p.state.get().filePath === filePath);
        if (existingPage) {
            this.showPage(existingPage.state.get().id);
            return;
        }

        const pageModel = await this.createPageFromFile(filePath);
        this.addPage(pageModel);
        recentFiles.add(filePath);

        this.closeFirstPageIfEmpty();
    };

    openDiff = async (params: { firstPath: string; secondPath: string } | undefined) => {
        if (!params) return;
        const { firstPath, secondPath } = params;
        if (!firstPath || !secondPath) return;
        let existingFirst = this.state.get().pages.find((p) => p.state.get().filePath === firstPath);
        let existingSecond = this.state.get().pages.find((p) => p.state.get().filePath === secondPath);

        if (!existingFirst) {
            existingFirst = await this.createPageFromFile(firstPath);
            this.addPage(existingFirst);
        }
        if (!existingSecond) {
            existingSecond = await this.createPageFromFile(secondPath);
            this.addPage(existingSecond);
        }

        this.groupTabs(existingFirst.id, existingSecond.id, true);
        this.fixCompareMode();
        if (isTextFileModel(existingFirst) && isTextFileModel(existingSecond)) {
            existingFirst.state.update((s) => {
                s.compareMode = true;
            });
            existingSecond.state.update((s) => {
                s.compareMode = true;
            });
        }
        this.showPage(existingFirst.id);
    }

    openFileWithDialog = async () => {
        const filePaths = await api.showOpenFileDialog({
            title: "Open File",
            multiSelections: false,
        });
        if (filePaths && filePaths.length > 0) {
            await this.openFile(filePaths[0]);
        }
    };

    closeFirstPageIfEmpty = () => {
        const pages = this.state.get().pages;
        if (pages.length === 2) {
            const firstPage = pages[0];
            const firstPageState = firstPage.state.get();
            if (
                !firstPageState.pinned &&
                !firstPageState.modified &&
                !(firstPageState as any).content &&
                !firstPageState.filePath &&
                firstPageState.type === "textFile"
            ) {
                firstPage.close(undefined);
            }
        }
    }

    movePageIn = async (data?: {
        page: Partial<IPage>;
        targetPageId: string | undefined;
    }) => {
        if (!data || !data.page) {
            return;
        }
        const pageModel = await newPageModelFromState(data.page);
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
            this.closeFirstPageIfEmpty();
        } else {
            this.attachPage(pageModel);
            this.state.update((s) => {
                s.pages.splice(targetIndex, 0, pageModel);
                s.ordered.push(pageModel);
            });
            this.fixGrouping();
            this.saveStateDebounced();
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
            this.saveStateDebounced();
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
            this.saveStateDebounced();
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
        this.saveStateDebounced();
    };

    isGrouped = (pageId: string) => {
        const state = this.state.get();
        return state.leftRight.has(pageId) || state.rightLeft.has(pageId);
    };

    fixGrouping = () => {
        const state = this.state.get();
        const toSwap: Array<[string, string]> = [];
        const toRemove = new Set<string>();
        const allIds = new Set<string>(state.pages.map(p => p.id));

        // Check for swapped adjacent pairs (left/right reversed)
        for (let i = 0; i < state.pages.length - 1; i++) {
            const leftPageId = state.pages[i].id;
            const rightPageId = state.pages[i + 1].id;
            const groupedSwap = state.rightLeft.get(leftPageId);
            if (rightPageId === groupedSwap) {
                toSwap.push([leftPageId, rightPageId]);
            }
        }

        // Remove groupings where one or both pages no longer exist
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

        this.fixCompareMode();
    };

    fixCompareMode = () => {
        const textPages = this.state.get().pages.filter(
            p => isTextFileModel(p)
        ) as unknown as TextFileModel[];
        textPages.forEach(page => {
            if (page.state.get().compareMode && !this.isGrouped(page.id)) {
                page.setCompareMode(false);
            }
        });
    }

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

    getLeftGroupedPage = (withPageId: string) => {
        const state = this.state.get();
        const groupedWithId = state.rightLeft.get(withPageId);
        if (groupedWithId) {
            return this.findPage(groupedWithId);
        }
        return undefined;
    }

    getGroupedPage = (withPageId: string) => {
        const state = this.state.get();
        const groupedWithId =
            state.leftRight.get(withPageId) || state.rightLeft.get(withPageId);
        if (groupedWithId) {
            return this.findPage(groupedWithId);
        }
        return undefined;
    };

    groupTabs = (pageId1: string, pageId2: string, enforceAdjacency = false) => {
        const state = this.state.get();
        const idx1 = state.pages.findIndex((p) => p.id === pageId1);
        const idx2 = state.pages.findIndex((p) => p.id === pageId2);
        if (idx1 === -1 || idx2 === -1 || idx1 === idx2) {
            return;
        }

        const isPinned1 = state.pages[idx1].state.get().pinned;
        const isPinned2 = state.pages[idx2].state.get().pinned;

        // Only enforce adjacency for unpinned-unpinned if explicitly requested
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
            // Non-adjacent grouping: just create the relationship
            if (idx1 < idx2) {
                this.group(pageId1, pageId2);
            } else {
                this.group(pageId2, pageId1);
            }
        }
    };

    requireGroupedText = (pageId: string, suggestedLanguage?: string) => {
        let groupedPage = this.getGroupedPage(pageId);
        if (groupedPage && !(groupedPage.state.get().type === "textFile")) {
            this.ungroup(pageId);
            groupedPage = undefined;
        }

        if (!groupedPage) {
            groupedPage = this.addEmptyPage() as unknown as PageModel;
            this.groupTabs(pageId, groupedPage.state.get().id, false);
            groupedPage.changeLanguage(suggestedLanguage);
        }

        return groupedPage as unknown as TextFileModel;
    }

    openPathInNewWindow = (filePath: string) => {
        if (!filePath) {
            return;
        }

        api.openNewWindow(filePath);
    }

    duplicatePage = async (pageId: string) => {
        const page = this.findPage(pageId);
        if (!page) {
            return;
        }

        const pageData: Partial<IPage> = page.getRestoreData();
        pageData.id = uuid();
        pageData.hasNavPanel = false;
        pageData.pinned = false;
        const newPage = await this.restoreModel(pageData);
        if (newPage) {
            this.addPage(newPage);
        }
        this.groupTabs(pageId, pageData.id, false);
    };
}

export const pagesModel = new PagesModel(
    new TGlobalState(defaultOpenFilesState)
);
pagesModel.init();
