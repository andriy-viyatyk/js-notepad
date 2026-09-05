import { api } from "../../../ipc/renderer/api";
import { pagesModel } from "../../api/pages";
import { menuFolders, type MenuFolder } from "../../api/menu-folders";
import {
    getMenuBarSourceFolders,
    isBuiltinFolder,
    openTabsId,
    recentFilesId,
    scriptLibraryId,
    toolsEditorsId,
} from "../../api/menu-bar";
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

const isStaticFolder = (folder: MenuFolder): boolean =>
    isBuiltinFolder(folder);

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
    private recentFileListView: RecentFileListView | null = null;
    private treeViewModel: TreeProviderViewModel | null = null;
    private readonly expandStateMap = new Map<string, TreeProviderViewSavedState>();
    private readonly providerMap = new Map<string, FileTreeProvider>();
    private contentWidth = 600;
    private previousOpen: boolean | undefined;

    public constructor(props: MenuBarProps) {
        const holder: { view?: MenuBarView } = {};
        const list = new ListBoxView<FolderItemRecord>({
            name: "menubar-folders",
            items: [],
            selectionStyle: "focus",
            variant: "browse",
            rowHeight: 22,
            isSelected: (folder) => folder.folder.id === holder.view?.selectedFolderId,
            onChange: (record) => holder.view?.setLeftItem(record.folder),
            onItemDoubleClick: (record) => holder.view?.openFolderOnDoubleClick(record.folder),
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

        this.listen(this.root, "click", () => app.window.menuBar.close());
        this.listen(this.content, "click", (event) => event.stopPropagation());
        this.listen(this.content, "keydown", (event) => this.onContentKeyDown(event));
        this.bind(menuFolders.state, (state) => state.folders, () => this.refreshFolders());
        this.bind(app.window.menuBar.state, (state) => state.selectedId, () => {
            this.refreshFolders();
            this.updateRightView();
        });
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
        this.root.classList.toggle("doDisplay", open);
        if (!open) {
            this.root.classList.remove("open");
            return;
        }
        void this.treeViewModel?.buildTree();
        // Flush the display change before adding `open`, or the opening transform can be skipped.
        this.root.getBoundingClientRect();
        this.root.classList.add("open");
        this.content.focus();
    }

    private refreshFolders(): void {
        const folders = getMenuBarSourceFolders();
        const presentIds = new Set(folders.map((folder) => folder.id));
        for (const id of this.folderDragStates.keys()) {
            if (!presentIds.has(id)) this.folderDragStates.delete(id);
        }
        const records = folders.map((folder) => this.folderRecord(folder));
        this.folderList.update(this.folderListProps(records));
    }

    private get selectedFolderId(): string { return app.window.menuBar.selected.id; }

    private folderListProps(items: FolderItemRecord[]): ListBoxProps<FolderItemRecord> {
        return {
            name: "menubar-folders",
            items,
            selectionStyle: "focus",
            variant: "browse",
            rowHeight: 22,
            isSelected: (folder) => folder.folder.id === this.selectedFolderId,
            onChange: (record) => this.setLeftItem(record.folder),
            onItemDoubleClick: (record) => this.openFolderOnDoubleClick(record.folder),
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
            selected: folder.id === this.selectedFolderId,
            icon: this.getFolderIcon(folder),
            label: this.getFolderLabel(folder),
            tooltip: this.getFolderTooltip(folder),
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
        if (nextId === this.selectedFolderId) return;
        app.window.menuBar.open(nextId);
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

    /**
     * Double-click gate for the saved-folder list. `createFolderItemRecord` builds a plain
     * `ListBoxView` record and silently drops `onDoubleClick`; the only listener for it lived in
     * `FolderItemView`, which nothing instantiates. So the gesture never reached
     * `openFolderInTab` -- the `canOpenInTab` check that used to sit beside the discarded prop
     * lives here now, where the event actually arrives.
     */
    private openFolderOnDoubleClick(folder: MenuFolder): void {
        if (!canOpenInTab(folder)) return;
        this.openFolderInTab(folder);
    }

    private openFolderInTab(folder: MenuFolder): void {
        const folderPath = folder.id === scriptLibraryId
            ? settings.get("script-library.path")
            : folder.path;
        this.openFolderPathInTab(folderPath);
    }

    /**
     * Open a folder as an empty page with the Explorer nav panel rooted at it. Shared by the
     * saved-folder list and by a folder double-clicked in the right-hand file tree, so both
     * gestures land on exactly one behaviour.
     */
    private openFolderPathInTab(folderPath: string | undefined): void {
        if (!folderPath) return;
        void pagesModel.addEmptyPageWithNavPanel(folderPath);
        this.props.onClose?.();
    }

    private onLeftPanelContextMenu(event: MouseEvent): void {
        if (event.contextMenuEvent) return;
        const contextEvent = ContextMenuEvent.fromNativeEvent(event, "sidebar-background");
        contextEvent.items.push({
            label: "Add Folder",
            icon: createIconElement("folder-plus"),
            onClick: () => { void this.addFolder(); },
        });
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
        const key = this.selectedFolderId;
        if (this.rightView && this.rightViewKey === key) {
            this.rightView.update(this.rightViewProps(this.rightViewKey));
            return;
        }
        this.recentFileListView = null;
        this.treeViewModel = null;
        this.rightView?.dispose();
        this.rightView?.root.remove();
        this.rightView = undefined;
        this.rightViewKey = key;
        const view = this.createRightView(key);
        if (!view) return;
        this.rightView = view;
        this.contentPanel.append(view.root);
        this.child(view).mount();
        if (view instanceof RecentFileListView) {
            this.recentFileListView = view;
        } else if (view instanceof ScriptLibraryPanelView || view instanceof TreeProviderViewImpl) {
            this.treeViewModel = view.model;
        }
    }

    private createRightView(key: string): VanillaView<unknown> | undefined {
        switch (key) {
            case openTabsId: return new OpenTabsListView({ onClose: this.props.onClose, open: this.props.open });
            case recentFilesId: return new RecentFileListView({
                onClose: this.props.onClose,
            });
            case toolsEditorsId: return new ToolsEditorsPanelView({ onClose: this.props.onClose });
            case scriptLibraryId: return new ScriptLibraryPanelView({
                onClose: this.props.onClose,
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
                    onStateChange: (state) => this.expandStateMap.set(key, state),
                    onItemClick: (item) => {
                        if (!item.isDirectory) {
                            void app.events.openRawLink.sendAsync(createLinkData(item.href));
                            this.props.onClose?.();
                        }
                    },
                    onFolderDoubleClick: (item) => this.openFolderPathInTab(item.href),
                });
            }
        }
    }

    private rightViewProps(key: string): unknown {
        switch (key) {
            case openTabsId: return { onClose: this.props.onClose, open: this.props.open };
            case recentFilesId: return {
                onClose: this.props.onClose,
            };
            case toolsEditorsId: return { onClose: this.props.onClose };
            case scriptLibraryId: return {
                onClose: this.props.onClose,
                expandState: this.expandStateMap.get(scriptLibraryId),
                onExpandStateChange: (state: TreeProviderViewSavedState) => this.expandStateMap.set(scriptLibraryId, state),
            };
            default: {
                const folder = menuFolders.find(key);
                if (!folder?.path) return {};
                return {
                    provider: this.getProvider(key, folder.path),
                    initialState: this.expandStateMap.get(key),
                    onStateChange: (state: TreeProviderViewSavedState) => this.expandStateMap.set(key, state),
                    onItemClick: (item: { isDirectory: boolean; href: string }) => {
                        if (!item.isDirectory) {
                            void app.events.openRawLink.sendAsync(createLinkData(item.href));
                            this.props.onClose?.();
                        }
                    },
                    onFolderDoubleClick: (item: { href: string }) => this.openFolderPathInTab(item.href),
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
        } else if (event.ctrlKey && event.code === "KeyF" && this.selectedFolderId !== openTabsId) {
            event.preventDefault();
            this.treeViewModel?.showSearch();
            this.recentFileListView?.showSearch();
        }
    }
}
