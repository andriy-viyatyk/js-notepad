import styled from "@emotion/styled";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TComponentModel, useComponentModel } from "../../core/state/model";
import { Button } from "../../components/basic/Button";
import { List, ListOptionRenderer } from "../../components/form/List";
import { api } from "../../../ipc/renderer/api";
import { pagesModel, menuFolders, recentFiles, showAboutPage, showSettingsPage } from "../../store";
import type { MenuFolder } from "../../store";
import color from "../../theme/color";
import {
    ArrowRightIcon,
    ClearListIcon,
    EmptyIcon,
    FolderOpenIcon,
    FolderPlusIcon,
    InfoIcon,
    NewWindowIcon,
    OpenFileIcon,
    RemoveIcon,
    SettingsIcon,
} from "../../theme/icons";
import { OpenTabsList } from "./OpenTabsList";
import { FlexSpace } from "../../components/layout/Elements";
import { RecentFileList } from "./RecentFileList";
import { FileExplorer, FileExplorerRef, FileExplorerSavedState } from "../../components/file-explorer";
import { FileListRef } from "./FileList";
import { MenuItem } from "../../components/overlay/PopupMenu";
import { FolderIcon } from "./FileIcon";
import { Splitter } from "../../components/layout/Splitter";
import { FolderItem } from "./FolderItem";
const path = require("path");

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
        "& .menu-bar-header": {
            display: "flex",
            alignItems: "center",
            columnGap: 4,
            marginBottom: 4,
        },
        "& .menu-bar-panel": {
            flex: "1 1 auto",
            display: "flex",
            flexDirection: "column",
            padding: 2,
        },
        "& .menu-bar-left": {
            borderRight: `1px solid ${color.border.light}`,
            width: 40,
            flex: "1 1 40%",
            "& .list-item": {
                "&:hover": {
                    backgroundColor: color.background.default,
                },
                "& .selected-icon": {
                    color: color.text.light,
                },
            },
            "& .list-item.selected": {
                backgroundColor: color.background.default,
            },
            "& .add-folder-button": {
                fontSize: 13,
                color: color.text.light,
                "&:hover": {
                    color: color.text.default,
                },
            },
        },
        "& .menu-bar-right": {
            paddingRight: 3,
            width: 60,
            flex: "1 1 60%",
        },
        "& .content-splitter": {
            flexShrink: 0,
            flexGrow: 0,
            width: 6,
        },
    },
    "&.open .menu-bar-content": {
        transform: "translateX(0)", // Slide in when open
    },
    "& button svg": {
        width: 20,
        height: 20,
    },
});

interface MenuBarProps {
    open?: boolean;
    onClose?: () => void;
}

const openTabsId = "open-tabs";
const recentFilesId = "recent-files";
const staticFolders: MenuFolder[] = [
    { id: openTabsId, name: "Open Tabs" },
    { id: recentFilesId, name: "Recent Files" },
];

const isStaticFolder = (folder: MenuFolder) => {
    return Boolean(staticFolders.find((f) => f.id === folder.id));
};

const defaultMenuBarState = {
    leftItemId: openTabsId,
    contentWidth: 600,
};

type MenuBarState = typeof defaultMenuBarState;

class MenuBarModel extends TComponentModel<MenuBarState, MenuBarProps> {
    private initialized = false;

    init = () => {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
    };

    contentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    contentKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            this.props.onClose?.();
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
        showSettingsPage();
        this.props.onClose?.();
    };

    openAbout = () => {
        this.props.onClose?.();
        showAboutPage();
    };

    setLeftItem = (item: MenuFolder) => {
        this.state.update((s) => {
            s.leftItemId = item.id;
        });
    };

    getLeftItemsHovered = (item: MenuFolder) => {
        return item.id === this.state.get().leftItemId;
    };

    getFolderLabel = (folder: MenuFolder) => {
        return folder.name;
    };

    getFolderIcon = (folder: MenuFolder) => {
        switch (folder.id) {
            case openTabsId:
                return "🗔";
            case recentFilesId:
                return "🕘";
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
        return undefined;
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
                        await recentFiles.clear();
                    },
                },
            ];
        }

        const menuItems: MenuItem[] = [
            {
                label: "Remove Folder",
                icon: <RemoveIcon />,
                onClick: () => {
                    menuFolders.deleteFolder(folder.id);
                },
            },
            {
                label: "Open Folder in Explorer",
                icon: <FolderOpenIcon />,
                onClick: () => {
                    if (folder.path) {
                        api.showFolder(folder.path);
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
            const name = path.basename(folderPath[0]);
            menuFolders.addFolder({ name, path: folderPath[0] });
        }
    };

    onLeftPanelContextMenu = (e: React.MouseEvent) => {
        if (e.nativeEvent.menuItems === undefined) {
            e.nativeEvent.menuItems = [
                {
                    label: "Add Folder",
                    icon: <FolderPlusIcon />,
                    onClick: () => {
                        this.addFolder();
                    },
                },
            ];
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
    const state = model.state.use();
    const [isAnimating, setIsAnimating] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const fileListRef = useRef<FileListRef>(null);
    const fileExplorerRef = useRef<FileExplorerRef>(null);
    const expandStateMap = useRef(new Map<string, FileExplorerSavedState>());
    const fileFolders = menuFolders.state.use((s) => s.folders);

    const allFolders = useMemo(() => {
        return [...staticFolders, ...fileFolders];
    }, [fileFolders]);

    useEffect(() => {
        const selected = model.state.get().leftItemId;
        if (!allFolders.find((f) => f.id === selected)) {
            model.setLeftItem(staticFolders[0]);
        }
    }, [allFolders]);

    const handleContentKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            props.onClose?.();
        } else if (e.ctrlKey && e.code === "KeyF") {
            if (state.leftItemId !== openTabsId) {
                e.preventDefault();
                fileExplorerRef.current?.showSearch();
                fileListRef.current?.showSearch();
            }
        }
    }, [props.onClose, state.leftItemId]);

    useEffect(() => {
        if (props.open) {
            model.init();
            fileExplorerRef.current?.refresh();
            const timer = setTimeout(() => setIsAnimating(true), 10);
            contentRef.current?.focus();
            return () => clearTimeout(timer);
        } else {
            setIsAnimating(false);
        }
    }, [props.open]);

    const folderRowRenderer: ListOptionRenderer<MenuFolder> = useCallback(
        ({ row, index, style, onClick, selected, selectedIcon, itemMarginY, getTooltip, getContextMenu }) => {
            return (
                <FolderItem
                    key={row.id}
                    folder={row}
                    index={index}
                    style={style}
                    selected={selected}
                    onClick={onClick}
                    icon={model.getFolderIcon(row)}
                    label={model.getFolderLabel(row)}
                    selectedIcon={selectedIcon}
                    itemMarginY={itemMarginY}
                    getTooltip={getTooltip}
                    getContextMenu={getContextMenu}
                    canDrag={!isStaticFolder(row)}
                    canDrop={!isStaticFolder(row)}
                />
            );
        },
        [model]
    );

    const renderRightList = useCallback(() => {
        switch (state.leftItemId) {
            case openTabsId:
                return (
                    <OpenTabsList onClose={props.onClose} open={props.open} />
                );
            case recentFilesId:
                return <RecentFileList ref={fileListRef} onClose={props.onClose} />;
            default: {
                const folder = menuFolders.find(state.leftItemId);
                if (folder?.path) {
                    return (
                        <FileExplorer
                            ref={fileExplorerRef}
                            key={folder.id}
                            id={`sidebar-${folder.id}`}
                            rootPath={folder.path}
                            enableFileOperations
                            showOpenInNewTab={false}
                            initialState={expandStateMap.current.get(folder.id!)}
                            onStateChange={(s) => expandStateMap.current.set(folder.id!, s)}
                            onFileClick={(filePath) => {
                                pagesModel.openFile(filePath);
                                props.onClose?.();
                            }}
                        />
                    );
                }
                return null;
            }
        }
    }, [state.leftItemId, props.onClose, props.open]);

    return (
        <MenuBarRoot
            key="menu-bar-root"
            className={clsx("menu-bar-backdrop", {
                open: isAnimating,
                doDisplay: props.open,
            })}
            onClick={props.onClose}
        >
            <div
                ref={contentRef}
                className="menu-bar-content"
                onClick={model.contentClick}
                onKeyDown={handleContentKeyDown}
                tabIndex={0}
                style={{ width: state.contentWidth }}
            >
                <div className="menu-bar-panel menu-bar-left">
                    <div className="menu-bar-header">
                        <Button
                            size="medium"
                            type="icon"
                            background="dark"
                            onClick={model.openFile}
                            title="Open File (Ctrl+O)"
                        >
                            <OpenFileIcon />
                        </Button>
                        <Button
                            size="medium"
                            type="icon"
                            background="dark"
                            onClick={model.newWindow}
                            title="New Window (Ctrl+Shift+N)"
                        >
                            <NewWindowIcon />
                        </Button>
                        <FlexSpace />
                        <Button
                            size="medium"
                            type="icon"
                            background="dark"
                            onClick={model.openAbout}
                            title="About"
                        >
                            <InfoIcon />
                        </Button>
                        <Button
                            size="medium"
                            type="icon"
                            background="dark"
                            onClick={model.openSettings}
                            title="Settings"
                        >
                            <SettingsIcon />
                        </Button>
                    </div>
                    <List
                        options={allFolders}
                        getLabel={model.getFolderLabel}
                        getSelected={model.getLeftItemsHovered}
                        onClick={model.setLeftItem}
                        getIcon={model.getFolderIcon}
                        selectedIcon={
                            <ArrowRightIcon className="selected-icon" />
                        }
                        rowHeight={22}
                        getContextMenu={model.getMenuFolderContextMenu}
                        onContextMenu={model.onLeftPanelContextMenu}
                        getTooltip={model.getFolderTooltip}
                        rowRenderer={folderRowRenderer}
                    />
                </div>
                <div className="menu-bar-panel menu-bar-right">
                    {renderRightList()}
                </div>
                <Splitter
                    initialWidth={state.contentWidth}
                    onChangeWidth={model.setContentWidth}
                    type="vertical"
                    borderSized="right"
                    className="content-splitter"
                />
            </div>
        </MenuBarRoot>
    );
}
