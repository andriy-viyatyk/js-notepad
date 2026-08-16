import styled from "@emotion/styled";
import { clsx } from "clsx";
import { useCallback, useEffect, useMemo } from "react";
import { TComponentModel, useComponentModel } from "../../core/state/model";
import {
    ListBox,
    LIST_ITEM_KEY,
    IconButton,
    Button,
    Spacer,
    Splitter,
    Panel,
} from "../../uikit";
import type { ListItemRenderContext } from "../../uikit/ListBox";
import type { MenuItem } from "../../uikit/Menu";
import { TraitSet, traited } from "../../core/traits/traits";
import { api } from "../../../ipc/renderer/api";
import { pagesModel } from "../../api/pages";
import { menuFolders } from "../../api/menu-folders";
import { recent } from "../../api/recent";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import type { MenuFolder } from "../../api/menu-folders";
import color from "../../theme/color";
import {
    ClearListIcon,
    EmptyIcon,
    FolderOpenIcon,
    FolderPlusIcon,
    InfoIcon,
    NewWindowIcon,
    OpenFileIcon,
    RemoveIcon,
    ScriptLibraryIcon,
    SettingsIcon,
    TerminalIcon,
} from "../../theme/icons";
import { OpenTabsList } from "./OpenTabsList";
import { RecentFileList } from "./RecentFileList";
import {
    TreeProviderView,
    type TreeProviderViewSavedState,
} from "../../components/tree-provider";
import { FileTreeProvider } from "../../content/tree-providers/FileTreeProvider";
import { FileListModel } from "../../components/file-list";
import type { TreeProviderViewModel } from "../../components/tree-provider/TreeProviderViewModel";
import { ContextMenuEvent } from "../../api/events/events";
import { FolderIcon } from "../../components/icons/FileIcon";
import { FolderItem } from "./FolderItem";
import { ScriptLibraryPanel } from "./ScriptLibraryPanel";
import { ToolsEditorsPanel } from "./ToolsEditorsPanel";
import { settings } from "../../api/settings";
import { fpBasename } from "../../core/utils/file-path";

const MenuBarRoot = styled("div")({
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    zIndex: 6,
    display: "none",
    "&.doDisplay": {
        display: "block",
    },
    "& .menu-bar-content": {
        height: "100%",
        display: "flex",
        flexDirection: "row",
        maxWidth: "90%",
        borderRight: `1px solid ${color.border.default}`,
        borderTopRightRadius: 4,
        borderBottomRightRadius: 4,
        overflow: "hidden",
        backgroundColor: color.background.dark,
        transform: "translateX(-100%)",
        transition: "transform 50ms ease-in-out",
    },
    "&.open .menu-bar-content": {
        transform: "translateX(0)", // Slide in when open
    },
});

interface MenuBarProps {
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

const isStaticFolder = (folder: MenuFolder) => {
    return Boolean(staticFolders.find((f) => f.id === folder.id));
};

const folderItemTraits = new TraitSet().add(LIST_ITEM_KEY, {
    value: (item: unknown) => (item as MenuFolder).id ?? "",
    label: (item: unknown) => (item as MenuFolder).name,
});

/** Static folders that support "open in tab" (double-click / selected icon click). */
const canOpenInTab = (folder: MenuFolder) => {
    return !isStaticFolder(folder) || folder.id === scriptLibraryId;
};

const defaultMenuBarState = {
    leftItemId: openTabsId,
    contentWidth: 600,
    isAnimating: false,
};

type MenuBarState = typeof defaultMenuBarState;

class MenuBarModel extends TComponentModel<MenuBarState, MenuBarProps> {
    contentRef: HTMLDivElement | null = null;
    fileListModel: FileListModel | null = null;
    treeViewModel: TreeProviderViewModel | null = null;
    expandStateMap = new Map<string, TreeProviderViewSavedState>();
    providerMap = new Map<string, FileTreeProvider>();

    setContentRef = (ref: HTMLDivElement | null) => { this.contentRef = ref; };
    setFileListModel = (model: FileListModel | null) => { this.fileListModel = model; };
    setTreeViewModel = (model: TreeProviderViewModel | null) => { this.treeViewModel = model; };

    getProvider = (folderId: string, folderPath: string): FileTreeProvider => {
        let provider = this.providerMap.get(folderId);
        if (!provider || provider.sourceUrl !== folderPath) {
            provider = new FileTreeProvider(folderPath);
            this.providerMap.set(folderId, provider);
        }
        return provider;
    };

    allFolders = this.memo(
        () => [...staticFolders, ...menuFolders.state.get().folders],
        () => [menuFolders.state.get().folders]
    );

    init() {
        this.effect(() => {
            if (this.props.open) {
                void this.treeViewModel?.buildTree();
                const timer = setTimeout(() => {
                    this.state.update((s) => { s.isAnimating = true; });
                }, 10);
                this.contentRef?.focus();
                return () => clearTimeout(timer);
            } else {
                this.state.update((s) => { s.isAnimating = false; });
            }
        }, () => [this.props.open]);

        // React to openMenuBar(panelId) calls
        this.effect(() => {
            const panelId = app.window.state.get().menuBarPanelId;
            if (panelId) {
                const folder = this.allFolders.value.find((f) => f.id === panelId);
                if (folder) {
                    this.setLeftItem(folder);
                }
                app.window.consumeMenuBarPanelId();
            }
        }, () => [app.window.state.get().menuBarPanelId]);
    }

    contentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    handleContentKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            this.props.onClose?.();
        } else if (e.ctrlKey && e.code === "KeyF") {
            if (this.state.get().leftItemId !== openTabsId) {
                e.preventDefault();
                this.treeViewModel?.showSearch();
                this.fileListModel?.showSearch();
            }
        }
    };

    openFile = async () => {
        this.props.onClose?.();
        pagesModel.openFileWithDialog();
    };

    newWindow = async () => {
        this.props.onClose?.();
        api.openNewWindow();
    };

    openSettings = () => {
        pagesModel.showSettingsPage();
        this.props.onClose?.();
    };

    openAbout = () => {
        this.props.onClose?.();
        pagesModel.showAboutPage();
    };

    setLeftItem = (item: MenuFolder) => {
        this.state.update((s) => {
            s.leftItemId = item.id;
        });
    };

    getFolderLabel = (folder: MenuFolder) => {
        return folder.name;
    };

    getFolderIcon = (folder: MenuFolder) => {
        switch (folder.id) {
            case openTabsId:
                return "tabs";
            case recentFilesId:
                return "history";
            case toolsEditorsId:
                return "tools";
            case scriptLibraryId:
                return <ScriptLibraryIcon />;
            default:
                return folder.path ? <FolderIcon /> : <EmptyIcon />;
        }
    };

    getFolderTooltip = (folder: MenuFolder) => {
        if (folder.path) {
            return folder.path;
        }
        if (folder.id === openTabsId) {
            return "Currently opened tabs";
        }
        if (folder.id === recentFilesId) {
            return "Recently opened files";
        }
        if (folder.id === scriptLibraryId) {
            const libPath = settings.get("script-library.path");
            return libPath || "Script library folder";
        }
        return undefined;
    };

    changeLibraryFolder = async () => {
        const result = await api.showOpenFolderDialog({
            title: "Select Script Library Folder",
        });
        if (result && result.length > 0) {
            settings.set("script-library.path", result[0]);
        }
    };

    unlinkLibraryFolder = () => {
        settings.set("script-library.path", "");
    };

    getMenuFolderContextMenu = (folder: MenuFolder) => {
        if (folder.id === openTabsId) {
            return [];
        }
        if (folder.id === recentFilesId) {
            return [
                {
                    label: "Clear Recent Files",
                    icon: <ClearListIcon />,
                    onClick: async () => {
                        await recent.clear();
                    },
                },
            ];
        }
        if (folder.id === scriptLibraryId) {
            const libPath = settings.get("script-library.path");
            const items: MenuItem[] = [
                {
                    label: "Change Library Folder",
                    icon: <FolderOpenIcon />,
                    onClick: this.changeLibraryFolder,
                },
            ];
            if (libPath) {
                items.push(
                    {
                        label: "Open in Explorer",
                        icon: <FolderOpenIcon />,
                        onClick: () => { api.showFolder(libPath); },
                    },
                    {
                        label: "Unlink Library",
                        icon: <RemoveIcon />,
                        onClick: this.unlinkLibraryFolder,
                    },
                );
            }
            return items;
        }

        const menuItems: MenuItem[] = [
            {
                label: "Open in New Tab",
                icon: <OpenFileIcon />,
                onClick: () => {
                    this.openFolderInTab(folder);
                },
            },
            {
                label: "Remove Folder",
                icon: <RemoveIcon />,
                onClick: () => {
                    menuFolders.remove(folder.id);
                },
            },
            {
                label: "Show in File Explorer",
                icon: <FolderOpenIcon />,
                onClick: () => {
                    if (folder.path) {
                        api.showFolder(folder.path);
                    }
                },
            },
            {
                label: "Open Terminal here",
                icon: <TerminalIcon />,
                onClick: async () => {
                    if (folder.path) {
                        const { openTerminalAt } = await import("../../api/terminal");
                        openTerminalAt(folder.path);
                    }
                },
            },
        ];
        return menuItems;
    };

    addFolder = async () => {
        const folderPath = await api.showOpenFolderDialog({
            title: "Select Folder to Add",
        });
        if (folderPath && folderPath.length > 0) {
            const name = fpBasename(folderPath[0]);
            menuFolders.add({ name, path: folderPath[0] });
        }
    };

    openFolderInTab = (folder: MenuFolder) => {
        const folderPath = folder.id === scriptLibraryId
            ? settings.get("script-library.path")
            : folder.path;
        if (folderPath) {
            pagesModel.addEmptyPageWithNavPanel(folderPath);
            this.props.onClose?.();
        }
    };

    onLeftPanelContextMenu = (e: React.MouseEvent) => {
        if (!e.nativeEvent.contextMenuEvent) {
            const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "sidebar-background");
            ctxEvent.items.push({
                label: "Add Folder",
                icon: <FolderPlusIcon />,
                onClick: () => {
                    this.addFolder();
                },
            });
        }
    };

    setContentWidth = (width: number) => {
        this.state.update((s) => {
            s.contentWidth = width;
        });
    };
}

export function MenuBar(props: MenuBarProps) {
    const model = useComponentModel(props, MenuBarModel, defaultMenuBarState);
    // Destructure named props referenced inside hook bodies (renderRightList, JSX
    // attributes) so exhaustive-deps can statically verify them.
    const { onClose, open } = props;
    const state = model.state.use();
    const { folders } = menuFolders.state.use();
    const allFolders = useMemo(() => [...staticFolders, ...folders], [folders]);

    // If the selected folder was removed, fall back to the first static folder
    useEffect(() => {
        if (!allFolders.find((f) => f.id === state.leftItemId)) {
            model.setLeftItem(staticFolders[0]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-validate only when the folder list changes; leftItemId is set via the validated setLeftItem path, so transient leftItemId changes don't need re-validation. `allFolders` is derived from `folders` (already in deps); `model` is stable.
    }, [folders]);

    const tFolders = useMemo(
        () => traited(allFolders, folderItemTraits),
        [allFolders]
    );

    const folderRenderItem = useCallback(
        (ctx: ListItemRenderContext<MenuFolder>) => (
            <FolderItem
                folder={ctx.source}
                selected={ctx.selected}
                icon={model.getFolderIcon(ctx.source)}
                label={model.getFolderLabel(ctx.source)}
                tooltip={model.getFolderTooltip(ctx.source)}
                onDoubleClick={canOpenInTab(ctx.source) ? model.openFolderInTab : undefined}
                onSelectedIconClick={canOpenInTab(ctx.source) ? model.openFolderInTab : undefined}
                canDrag={!isStaticFolder(ctx.source)}
                canDrop={!isStaticFolder(ctx.source)}
            />
        ),
        [model]
    );

    const renderRightList = useCallback(() => {
        switch (state.leftItemId) {
            case openTabsId:
                return (
                    <OpenTabsList onClose={onClose} open={open} />
                );
            case recentFilesId:
                return <RecentFileList onModel={model.setFileListModel} onClose={onClose} />;
            case toolsEditorsId:
                return <ToolsEditorsPanel onClose={onClose} />;
            case scriptLibraryId:
                return (
                    <ScriptLibraryPanel
                        onClose={onClose}
                        explorerModel={model.setTreeViewModel}
                        expandState={model.expandStateMap.get(scriptLibraryId)}
                        onExpandStateChange={(s) => model.expandStateMap.set(scriptLibraryId, s)}
                    />
                );
            default: {
                const folder = menuFolders.find(state.leftItemId);
                if (folder?.path) {
                    return (
                        <TreeProviderView
                            onModel={model.setTreeViewModel}
                            key={folder.id}
                            provider={model.getProvider(folder.id, folder.path)}
                            initialState={model.expandStateMap.get(folder.id)}
                            onStateChange={(s) => model.expandStateMap.set(folder.id, s)}
                            onItemClick={(item) => {
                                if (!item.isDirectory) {
                                    app.events.openRawLink.sendAsync(createLinkData(item.href));
                                    onClose?.();
                                }
                            }}
                        />
                    );
                }
                return null;
            }
        }
    }, [state.leftItemId, onClose, open, model]);

    return (
        <MenuBarRoot
            key="menu-bar-root"
            data-name="menu-bar"
            className={clsx("menu-bar-backdrop", {
                open: state.isAnimating,
                doDisplay: open,
            })}
            onClick={onClose}
        >
            <div
                ref={model.setContentRef}
                className="menu-bar-content"
                data-name="menu-bar-content"
                onClick={model.contentClick}
                onKeyDown={model.handleContentKeyDown}
                tabIndex={0}
                style={{ width: state.contentWidth }}
            >
                <Panel
                    name="menubar-categories"
                    direction="column"
                    flex={"1 1 40%"}
                    minWidth={0}
                    padding="xs"
                    borderRight
                >
                    <Panel
                        name="menubar-toolbar"
                        direction="row"
                        align="center"
                        gap="sm"
                        paddingBottom="sm"
                    >
                        <IconButton
                            name="menubar-open-file"
                            size="md"
                            icon={<OpenFileIcon />}
                            title="Open File (Ctrl+O)"
                            onClick={model.openFile}
                        />
                        <IconButton
                            name="menubar-new-window"
                            size="md"
                            icon={<NewWindowIcon />}
                            title="New Window (Ctrl+Shift+N)"
                            onClick={model.newWindow}
                        />
                        <Spacer />
                        <IconButton
                            name="menubar-about"
                            size="md"
                            icon={<InfoIcon />}
                            title="About"
                            onClick={model.openAbout}
                        />
                        <IconButton
                            name="menubar-settings"
                            size="md"
                            icon={<SettingsIcon />}
                            title="Settings"
                            onClick={model.openSettings}
                        />
                    </Panel>
                    <ListBox<MenuFolder>
                        name="menubar-folders"
                        items={tFolders}
                        selectionStyle="focus"
                        rowHeight={22}
                        isSelected={(folder) => folder.id === state.leftItemId}
                        onChange={model.setLeftItem}
                        getContextMenu={(folder) => {
                            model.setLeftItem(folder);
                            return model.getMenuFolderContextMenu(folder);
                        }}
                        onContextMenu={model.onLeftPanelContextMenu}
                        renderItem={folderRenderItem}
                    />
                    <Panel name="menubar-add-folder" justify="center" paddingTop="sm">
                        <Button
                            name="menubar-add-folder-button"
                            icon={<FolderPlusIcon />}
                            title="Add a folder to the sidebar"
                            size="sm"
                            onClick={model.addFolder}
                        >
                            Add Folder
                        </Button>
                    </Panel>
                </Panel>
                <Panel
                    name="menubar-content"
                    direction="column"
                    flex={"1 1 60%"}
                    minWidth={0}
                    paddingRight="xs"
                >
                    {renderRightList()}
                </Panel>
                <Splitter
                    name="menubar-splitter"
                    orientation="vertical"
                    side="before"
                    value={state.contentWidth}
                    onChange={model.setContentWidth}
                    border="none"
                    background="dark"
                    hoverBackground="default"
                />
            </div>
        </MenuBarRoot>
    );
}
