import React from "react";
import { api } from "../../../ipc/renderer/api";
import { pagesModel } from "../../api/pages";
import { menuFolders, type MenuFolder } from "../../api/menu-folders";
import { recent } from "../../api/recent";
import { app } from "../../api/app";
import { settings } from "../../api/settings";
import { createLinkData } from "../../../shared/link-data";
import { fpBasename } from "../../core/utils/file-path";
import { ContextMenuEvent } from "../../api/events/events";
import { FileTreeProvider } from "../../content/tree-providers/FileTreeProvider";
import { TreeProviderViewImpl } from "../../components/tree-provider/TreeProviderViewImpl";
import type {
    TreeProviderViewModel,
    TreeProviderViewSavedState,
} from "../../components/tree-provider";
import { FileListModel } from "../../components/file-list/FileList";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { SplitterView } from "../../uikit/Splitter/SplitterView";
import { ListBoxView } from "../../uikit/ListBox/ListBoxView";
import type { ListBoxProps } from "../../uikit/ListBox/types";
import type { IconRef } from "../../uikit/shared/slots";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createFolderIconElement } from "../../components/icons/icon-elements";
import {
    createFolderItemRecord,
    type FolderItemRecord,
} from "./FolderItemView";
import { OpenTabsListView } from "./OpenTabsListView";
import { RecentFileListView } from "./RecentFileListView";
import { ScriptLibraryPanelView } from "./ScriptLibraryPanelView";
import { ToolsEditorsPanelView } from "./ToolsEditorsPanelView";
import "../../uikit/Button/Button.css";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Spacer/Spacer.css";
import "./MenuBar.css";
import "./FolderItem.css";

export interface MenuBarProps {
    open?: boolean;
    onClose?: () => void;
}

const openTabsId = "open-tabs";
const recentFilesId = "recent-files";
const toolsEditorsId = "tools-editors";
const scriptLibraryId = "script-library";
const staticFolders: MenuFolder[] = [
    { id: openTabsId, name: "Open Tabs" },
    { id: recentFilesId, name: "Recent Files" },
    { id: toolsEditorsId, name: "Tools & Editors" },
    { id: scriptLibraryId, name: "Script Library" },
];

const isStaticFolder = (folder: MenuFolder): boolean =>
    staticFolders.some((candidate) => candidate.id === folder.id);

const canOpenInTab = (folder: MenuFolder): boolean =>
    !isStaticFolder(folder) || folder.id === scriptLibraryId;

export class MenuBarView extends VanillaView<MenuBarProps> {
    private readonly content = document.createElement("div");
    private readonly categories = createPanelElement({
        name: "menubar-categories",
        direction: "column",
        flex: "1 1 40%",
        minWidth: 0,
        padding: "xs",
        borderRight: true,
    });
    private readonly toolbar = createPanelElement({
        name: "menubar-toolbar",
        direction: "row",
        align: "center",
        gap: "sm",
        paddingBottom: "sm",
    });
    private readonly addFolderPanel = createPanelElement({
        name: "menubar-add-folder",
        justify: "center",
        paddingTop: "sm",
    });
    private readonly contentPanel = createPanelElement({
        name: "menubar-content",
        direction: "column",
        flex: "1 1 60%",
        minWidth: 0,
        paddingRight: "xs",
    });
    private readonly openFileButton = new IconButtonView({
        name: "menubar-open-file",
        size: "md",
        icon: "open-file",
        title: "Open File (Ctrl+O)",
        onClick: () => { void this.openFile(); },
    });
    private readonly newWindowButton = new IconButtonView({
        name: "menubar-new-window",
        size: "md",
        icon: "new-window",
        title: "New Window (Ctrl+Shift+N)",
        onClick: () => { void this.newWindow(); },
    });
    private readonly spacer = new SpacerView({});
    private readonly aboutButton = new IconButtonView({
        name: "menubar-about",
        size: "md",
        icon: "info",
        title: "About",
        onClick: () => this.openAbout(),
    });
    private readonly settingsButton = new IconButtonView({
        name: "menubar-settings",
        size: "md",
        icon: "settings",
        title: "Settings",
        onClick: () => this.openSettings(),
    });
    private readonly addFolderButton = new ButtonView({
        name: "menubar-add-folder-button",
        icon: "folder-plus",
        title: "Add a folder to the sidebar",
        size: "sm",
        onClick: () => { void this.addFolder(); },
        children: "Add Folder",
    });
    private readonly folderList: ListBoxView<FolderItemRecord>;
    private readonly splitter = new SplitterView({
        name: "menubar-splitter",
        orientation: "vertical",
        side: "before",
        value: 600,
        onChange: (width) => this.setContentWidth(width),
        border: "none",
        background: "dark",
        hoverBackground: "default",
    });
    private readonly folderDragStates = new Map<string, { dragEnterCount: number }>();
    private rightView: VanillaView<unknown> | undefined;
    private rightViewKey = "";
    private fileListModel: FileListModel | null = null;
    private treeViewModel: TreeProviderViewModel | null = null;
    private readonly expandStateMap = new Map<string, TreeProviderViewSavedState>();
    private readonly providerMap = new Map<string, FileTreeProvider>();
    private leftItemId = openTabsId;
    private contentWidth = 600;
    private animationTimer: number | undefined;
    private previousOpen: boolean | undefined;
    private live = true;

    public constructor(props: MenuBarProps) {
        const holder: { view?: MenuBarView } = {};
        const list = new ListBoxView<FolderItemRecord>({
            name: "menubar-folders",
            items: [],
            selectionStyle: "focus",
            variant: "browse",
            rowHeight: 22,
            isSelected: (folder) => folder.folder.id === holder.view?.leftItemId,
            onChange: (record) => holder.view?.setLeftItem(record.folder),
            getContextMenu: (record) => {
                const folder = record.folder;
                holder.view?.setLeftItem(folder);
                return holder.view?.getMenuFolderContextMenu(folder) ?? [];
            },
            onContextMenu: (event) => holder.view?.onLeftPanelContextMenu(event),
        });
        super(props);
        holder.view = this;
        this.folderList = list;
    }

    protected onMount(): void {
        this.root.className = "menu-bar-backdrop";
        this.root.dataset.name = "menu-bar";
        this.content.className = "menu-bar-content";
        this.content.dataset.name = "menu-bar-content";
        this.content.tabIndex = 0;
        this.content.style.width = `${this.contentWidth}px`;
        this.root.append(this.content);
        this.content.append(this.categories, this.contentPanel, this.splitter.root);
        this.toolbar.append(
            this.openFileButton.root,
            this.newWindowButton.root,
            this.spacer.root,
            this.aboutButton.root,
            this.settingsButton.root,
        );
        this.addFolderPanel.append(this.addFolderButton.root);
        this.categories.append(this.toolbar, this.folderList.root, this.addFolderPanel);

        this.child(this.openFileButton).mount();
        this.child(this.newWindowButton).mount();
        this.child(this.spacer).mount();
        this.child(this.aboutButton).mount();
        this.child(this.settingsButton).mount();
        this.child(this.addFolderButton).mount();
        this.child(this.folderList).mount();
        this.child(this.splitter).mount();

        this.listen(this.root, "click", () => this.props.onClose?.());
        this.listen(this.content, "click", (event) => event.stopPropagation());
        this.listen(this.content, "keydown", (event) => this.onContentKeyDown(event));
        this.bind(menuFolders.state, (state) => state.folders, () => this.refreshFolders());
        this.bind(app.window.state, (state) => state.menuBarPanelId, (panelId) => {
            this.consumePanelId(panelId);
        });
        this.own(() => {
            this.live = false;
            if (this.animationTimer !== undefined) window.clearTimeout(this.animationTimer);
        });
        this.refreshFolders();
        this.updateRightView();
        this.updateOpenState();
    }

    protected onUpdate(_props: MenuBarProps): void {
        this.updateOpenState();
        this.refreshFolders();
        this.updateRightView();
    }

    private applyRootState(): void {
        this.root.classList.toggle("doDisplay", Boolean(this.props.open));
        this.content.style.width = `${this.contentWidth}px`;
    }

    private updateOpenState(): void {
        const open = Boolean(this.props.open);
        const changed = open !== this.previousOpen;
        this.previousOpen = open;
        this.applyRootState();
        if (!changed) return;
        if (this.animationTimer !== undefined) window.clearTimeout(this.animationTimer);
        this.animationTimer = undefined;
        this.root.classList.toggle("doDisplay", open);
        if (!open) {
            this.root.classList.remove("open");
            return;
        }
        void this.treeViewModel?.buildTree();
        this.animationTimer = window.setTimeout(() => {
            this.animationTimer = undefined;
            if (!this.live) return;
            this.root.classList.add("open");
        }, 10);
        this.content.focus();
    }

    private refreshFolders(): void {
        const folders = [...staticFolders, ...menuFolders.state.get().folders];
        const presentIds = new Set(folders.map((folder) => folder.id));
        for (const id of this.folderDragStates.keys()) {
            if (!presentIds.has(id)) this.folderDragStates.delete(id);
        }
        const records = folders.map((folder) => this.folderRecord(folder));
        this.folderList.update(this.folderListProps(records));
        if (!presentIds.has(this.leftItemId)) {
            queueMicrotask(() => {
                if (!this.live) return;
                const current = [...staticFolders, ...menuFolders.state.get().folders];
                if (!current.some((folder) => folder.id === this.leftItemId)) {
                    this.setLeftItem(staticFolders[0]);
                }
            });
        }
    }

    private folderListProps(items: FolderItemRecord[]): ListBoxProps<FolderItemRecord> {
        return {
            name: "menubar-folders",
            items,
            selectionStyle: "focus",
            variant: "browse",
            rowHeight: 22,
            isSelected: (folder) => folder.folder.id === this.leftItemId,
            onChange: (record) => this.setLeftItem(record.folder),
            getTooltip: (record) => record.tooltip,
            getContextMenu: (record) => {
                const folder = record.folder;
                this.setLeftItem(folder);
                return this.getMenuFolderContextMenu(folder);
            },
            onContextMenu: (event) => this.onLeftPanelContextMenu(event),
        };
    }

    private folderRecord(folder: MenuFolder): FolderItemRecord {
        const id = folder.id ?? "";
        let dragState = this.folderDragStates.get(id);
        if (!dragState) {
            dragState = { dragEnterCount: 0 };
            this.folderDragStates.set(id, dragState);
        }
        const props = {
            folder,
            selected: folder.id === this.leftItemId,
            icon: this.getFolderIcon(folder),
            label: this.getFolderLabel(folder),
            tooltip: this.getFolderTooltip(folder),
            onDoubleClick: canOpenInTab(folder) ? (value: MenuFolder) => this.openFolderInTab(value) : undefined,
            onSelectedIconClick: canOpenInTab(folder)
                ? (value: MenuFolder) => this.openFolderInTab(value)
                : undefined,
            canDrag: !isStaticFolder(folder),
            canDrop: !isStaticFolder(folder),
        };
        return createFolderItemRecord(props, dragState);
    }

    private setLeftItem(folder: MenuFolder): void {
        const nextId = folder.id ?? "";
        if (nextId === this.leftItemId) return;
        this.leftItemId = nextId;
        this.refreshFolders();
        this.updateRightView();
    }

    private getFolderLabel(folder: MenuFolder): string { return folder.name; }

    private getFolderIcon(folder: MenuFolder): IconRef {
        switch (folder.id) {
            case openTabsId: return "tabs";
            case recentFilesId: return "history";
            case toolsEditorsId: return "tools";
            case scriptLibraryId: return createIconElement("script-library");
            default: return folder.path
                ? createFolderIconElement()
                : createIconElement("empty");
        }
    }

    private getFolderTooltip(folder: MenuFolder): string | undefined {
        if (folder.path) return folder.path;
        if (folder.id === openTabsId) return "Currently opened tabs";
        if (folder.id === recentFilesId) return "Recently opened files";
        if (folder.id === scriptLibraryId) return settings.get("script-library.path") || "Script library folder";
        return undefined;
    }

    private async changeLibraryFolder(): Promise<void> {
        const result = await api.showOpenFolderDialog({ title: "Select Script Library Folder" });
        if (result && result.length > 0) settings.set("script-library.path", result[0]);
    }

    private unlinkLibraryFolder(): void { settings.set("script-library.path", ""); }

    private async clearRecentFiles(): Promise<void> {
        await recent.clear();
        if (this.rightView instanceof RecentFileListView) {
            await this.rightView.reload();
        }
    }

    private getMenuFolderContextMenu(folder: MenuFolder) {
        if (folder.id === openTabsId) return [];
        if (folder.id === recentFilesId) {
            return [{
                label: "Clear Recent Files",
                icon: createIconElement("clear-list"),
                onClick: () => { void this.clearRecentFiles(); },
            }];
        }
        if (folder.id === scriptLibraryId) {
            const libraryPath = settings.get("script-library.path");
            const items = [{
                label: "Change Library Folder",
                icon: createIconElement("folder-open"),
                onClick: () => { void this.changeLibraryFolder(); },
            }];
            if (libraryPath) {
                items.push(
                    {
                        label: "Open in Explorer",
                        icon: createIconElement("folder-open"),
                        onClick: () => { api.showFolder(libraryPath); },
                    },
                    {
                        label: "Unlink Library",
                        icon: createIconElement("remove"),
                        onClick: () => this.unlinkLibraryFolder(),
                    },
                );
            }
            return items;
        }
        return [
            {
                label: "Open in New Tab",
                icon: createIconElement("open-file"),
                onClick: () => this.openFolderInTab(folder),
            },
            {
                label: "Remove Folder",
                icon: createIconElement("remove"),
                onClick: () => {
                    const folderId = folder.id;
                    if (folderId) menuFolders.remove(folderId);
                },
            },
            {
                label: "Show in File Explorer",
                icon: createIconElement("folder-open"),
                onClick: () => { if (folder.path) api.showFolder(folder.path); },
            },
            {
                label: "Open Terminal here",
                icon: createIconElement("terminal"),
                onClick: async () => {
                    const folderPath = folder.path;
                    if (!folderPath) return;
                    const { openTerminalAt } = await import("../../api/terminal");
                    openTerminalAt(folderPath);
                },
            },
        ];
    }

    private async addFolder(): Promise<void> {
        const result = await api.showOpenFolderDialog({ title: "Select Folder to Add" });
        if (result && result.length > 0) {
            const folderPath = result[0];
            menuFolders.add({ name: fpBasename(folderPath), path: folderPath });
        }
    }

    private openFolderInTab(folder: MenuFolder): void {
        const folderPath = folder.id === scriptLibraryId
            ? settings.get("script-library.path")
            : folder.path;
        if (!folderPath) return;
        pagesModel.addEmptyPageWithNavPanel(folderPath);
        this.props.onClose?.();
    }

    private onLeftPanelContextMenu(event: React.MouseEvent<HTMLDivElement>): void {
        if (event.nativeEvent.contextMenuEvent) return;
        const contextEvent = ContextMenuEvent.fromNativeEvent(event, "sidebar-background");
        contextEvent.items.push({
            label: "Add Folder",
            icon: createIconElement("folder-plus"),
            onClick: () => { void this.addFolder(); },
        });
    }

    private consumePanelId(panelId: string): void {
        if (!panelId) return;
        const folder = [...staticFolders, ...menuFolders.state.get().folders]
            .find((candidate) => candidate.id === panelId);
        if (folder) this.setLeftItem(folder);
        app.window.consumeMenuBarPanelId();
    }

    private setContentWidth(width: number): void {
        this.contentWidth = width;
        this.content.style.width = `${width}px`;
        this.splitter.update({
            name: "menubar-splitter",
            orientation: "vertical",
            side: "before",
            value: width,
            onChange: (next) => this.setContentWidth(next),
            border: "none",
            background: "dark",
            hoverBackground: "default",
        });
    }

    private updateRightView(): void {
        const key = this.leftItemId;
        if (this.rightView && this.rightViewKey === key) {
            this.rightView.update(this.rightViewProps(this.rightViewKey));
            return;
        }
        this.rightView?.dispose();
        this.rightView?.root.remove();
        this.rightView = undefined;
        this.rightViewKey = key;
        const view = this.createRightView(key);
        if (!view) return;
        this.rightView = view;
        this.contentPanel.append(view.root);
        this.child(view).mount();
    }

    private createRightView(key: string): VanillaView<unknown> | undefined {
        switch (key) {
            case openTabsId: return new OpenTabsListView({ onClose: this.props.onClose, open: this.props.open });
            case recentFilesId: return new RecentFileListView({
                onClose: this.props.onClose,
                onModel: (model) => { this.fileListModel = model; },
            });
            case toolsEditorsId: return new ToolsEditorsPanelView({ onClose: this.props.onClose });
            case scriptLibraryId: return new ScriptLibraryPanelView({
                onClose: this.props.onClose,
                explorerModel: (model) => { this.treeViewModel = model; },
                expandState: this.expandStateMap.get(scriptLibraryId),
                onExpandStateChange: (state) => this.expandStateMap.set(scriptLibraryId, state),
            });
            default: {
                const folder = menuFolders.find(key);
                if (!folder?.path) return undefined;
                const provider = this.getProvider(key, folder.path);
                return new TreeProviderViewImpl({
                    provider,
                    initialState: this.expandStateMap.get(key),
                    onModel: (model) => { this.treeViewModel = model; },
                    onStateChange: (state) => this.expandStateMap.set(key, state),
                    onItemClick: (item) => {
                        if (!item.isDirectory) {
                            void app.events.openRawLink.sendAsync(createLinkData(item.href));
                            this.props.onClose?.();
                        }
                    },
                });
            }
        }
    }

    private rightViewProps(key: string): unknown {
        switch (key) {
            case openTabsId: return { onClose: this.props.onClose, open: this.props.open };
            case recentFilesId: return {
                onClose: this.props.onClose,
                onModel: (model: FileListModel | null) => { this.fileListModel = model; },
            };
            case toolsEditorsId: return { onClose: this.props.onClose };
            case scriptLibraryId: return {
                onClose: this.props.onClose,
                explorerModel: (model: TreeProviderViewModel | null) => { this.treeViewModel = model; },
                expandState: this.expandStateMap.get(scriptLibraryId),
                onExpandStateChange: (state: TreeProviderViewSavedState) => this.expandStateMap.set(scriptLibraryId, state),
            };
            default: {
                const folder = menuFolders.find(key);
                if (!folder?.path) return {};
                return {
                    provider: this.getProvider(key, folder.path),
                    initialState: this.expandStateMap.get(key),
                    onModel: (model: TreeProviderViewModel | null) => { this.treeViewModel = model; },
                    onStateChange: (state: TreeProviderViewSavedState) => this.expandStateMap.set(key, state),
                    onItemClick: (item: { isDirectory: boolean; href: string }) => {
                        if (!item.isDirectory) {
                            void app.events.openRawLink.sendAsync(createLinkData(item.href));
                            this.props.onClose?.();
                        }
                    },
                };
            }
        }
    }

    private getProvider(folderId: string, folderPath: string): FileTreeProvider {
        let provider = this.providerMap.get(folderId);
        if (!provider || provider.sourceUrl !== folderPath) {
            provider = new FileTreeProvider(folderPath);
            this.providerMap.set(folderId, provider);
        }
        return provider;
    }

    private async openFile(): Promise<void> {
        this.props.onClose?.();
        pagesModel.openFileWithDialog();
    }

    private async newWindow(): Promise<void> {
        this.props.onClose?.();
        api.openNewWindow();
    }

    private openSettings(): void {
        pagesModel.showSettingsPage();
        this.props.onClose?.();
    }

    private openAbout(): void {
        this.props.onClose?.();
        pagesModel.showAboutPage();
    }

    private onContentKeyDown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            this.props.onClose?.();
        } else if (event.ctrlKey && event.code === "KeyF" && this.leftItemId !== openTabsId) {
            event.preventDefault();
            this.treeViewModel?.showSearch();
            this.fileListModel?.showSearch();
        }
    }
}
