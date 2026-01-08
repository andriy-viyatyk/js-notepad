import styled from "@emotion/styled";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TComponentModel, useComponentModel } from "../../common/classes/model";
import { Button } from "../../controls/Button";
import { List } from "../../controls/List";
import { api } from "../../../ipc/renderer/api";
import { pagesModel } from "../../model/pages-model";
import color from "../../theme/color";
import { ArrowRightIcon, EmptyIcon, NewWindowIcon, OpenFileIcon, PlusIcon, SettingsIcon } from "../../theme/icons";
import { OpenTabsList } from "./OpenTabsList";
import { FlexSpace } from "../../controls/Elements";
import { appSettings } from "../../model/appSettings";
import { RecentFileList } from "./RecentFileList";
import { MenuFolder, menuFolders } from "../../model/menuFolders";
import { FileExplorer } from "./FileExplorer";
import { Menu } from "electron";
import { MenuItem } from "../../controls/PopupMenu";
import { recentFiles } from "../../model/recentFiles";
const path = require("path");

const MenuBarRoot = styled("div")({
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    zIndex: 6,
    "& .menu-bar-content": {
        height: "100%",
        display: "flex",
        flexDirection: "column",
        width: 600,
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
        },
        "& .menu-bar-splitter": {
            height: 400,
            flex: "1 1 auto",
            display: "flex",
            flexDirection: "row",
            "& .menu-bar-panel": {
                flex: "1 1 auto",
                width: "50%",
                display: "flex",
                flexDirection: "column",
                padding: 2,
            },
            "& .menu-bar-left": {
                borderRight: `1px solid ${color.border.light}`,
                width: "40%",
                "& .list-item": {
                    boxSizing: "border-box",
                    borderRadius: 4,
                    border: `1px solid transparent`,
                    "&:hover": {
                        backgroundColor: color.background.dark,
                        borderColor: color.border.default,
                    },
                    "& .selected-icon": {
                        color: color.text.light,
                    },
                },
                "& .list-item.selected": {
                    backgroundColor: color.background.default,
                    borderColor: color.border.default,
                },
                "& .add-folder-button": {
                    fontSize: 13,
                    color: color.text.light,
                    "&:hover": {
                        color: color.text.default,
                    }
                }
            },
            "& .menu-bar-right": {
                paddingRight: 3,
            }
        },
    },
    "&.open .menu-bar-content": {
        transform: "translateX(0)", // Slide in when open
    },
    "& button svg": {
        width: 20,
        height: 20,
    }
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

const defaultMenuBarState = {
    leftItemId: openTabsId,
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
        const filePath = appSettings.settingsFilePath;
        if (filePath) {
            pagesModel.openFile(filePath);
            this.props.onClose?.();
        }
    }

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
                return folder.path ? "📁" : <EmptyIcon />;
        }
    }

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
    }

    getMenuFolderContextMenu = (folder: MenuFolder) => {
        if (folder.id === openTabsId) {
            return [];
        }
        if (folder.id === recentFilesId) {
            return [{
                label: "Clear Recent Files",
                onClick: async () => {
                    await recentFiles.clear();
                }
            }];
        }

        const menuItems: MenuItem[] = [
            {
                label: "Remove Folder",
                onClick: () => {
                    menuFolders.deleteFolder(folder.id);
                }
            },
            {
                label: "Open Folder in Explorer",
                onClick: () => {
                    if (folder.path) {
                        api.showFolder(folder.path);
                    }
                }
            }
        ]
        return menuItems;
    }

    addFolder = async () => {
        const folderPath = await api.showOpenFolderDialog({
            title: "Select Folder to Add",
        });
        if (folderPath && folderPath.length > 0) {
            const name = path.basename(folderPath[0]);
            menuFolders.addFolder({ name, path: folderPath[0] });
        }
    }

    onLeftPanelContextMenu = (e: React.MouseEvent) => {
        if (e.nativeEvent.menuItems === undefined) {
            e.nativeEvent.menuItems = [{
                label: "Add Folder",
                onClick: () => {
                    this.addFolder();
                }
            }];
        }
    }
}

export function MenuBar(props: MenuBarProps) {
    const model = useComponentModel(props, MenuBarModel, defaultMenuBarState);
    const state = model.state.use();
    const [isAnimating, setIsAnimating] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const fileFolders = menuFolders.state.use(s => s.folders);

    const allFolders = useMemo(() => {
        return [...staticFolders, ...fileFolders];
    }, [fileFolders]);

    useEffect(() => {
        const selected = model.state.get().leftItemId;
        if (!allFolders.find(f => f.id === selected)) {
            model.setLeftItem(staticFolders[0]);
        }
    }, [allFolders]);

    useEffect(() => {
        if (props.open) {
            model.init();
            const timer = setTimeout(() => setIsAnimating(true), 10);
            contentRef.current?.focus();
            return () => clearTimeout(timer);
        } else {
            setIsAnimating(false);
        }
    }, [props.open]);

    const renderRightList = useCallback(() => {
        switch (state.leftItemId) {
            case openTabsId:
                return <OpenTabsList onClose={props.onClose} />;
            case recentFilesId:
                return <RecentFileList onClose={props.onClose} />;
            default: {
                const folder = menuFolders.find(state.leftItemId);
                if (folder?.path) {
                    return <FileExplorer key={folder.id} basePath={folder.path} onClose={props.onClose} />;
                }
                return null;
            }
        }
    }, [state.leftItemId]);

    if (!props.open) {
        return null;
    }

    return (
        <MenuBarRoot
            className={clsx("menu-bar-backdrop", { open: isAnimating })}
            onClick={props.onClose}
        >
            <div
                ref={contentRef}
                className="menu-bar-content"
                onClick={model.contentClick}
                onKeyDown={model.contentKeyDown}
                tabIndex={0}
            >
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
                        onClick={model.openSettings}
                        title="Settings"
                    >
                        <SettingsIcon />
                    </Button>
                </div>
                <div className="menu-bar-splitter">
                    <div className="menu-bar-panel menu-bar-left">
                        <List
                            options={allFolders}
                            getLabel={model.getFolderLabel}
                            getSelected={model.getLeftItemsHovered}
                            onClick={model.setLeftItem}
                            getIcon={model.getFolderIcon}
                            selectedIcon={<ArrowRightIcon className="selected-icon"/>}
                            rowHeight={28}
                            itemMarginY={1}
                            getContextMenu={model.getMenuFolderContextMenu}
                            onContextMenu={model.onLeftPanelContextMenu}
                            getTooltip={model.getFolderTooltip}
                        />
                        <Button
                            size="small"
                            type="icon"
                            onClick={model.addFolder}
                            className="add-folder-button"
                        >
                            <PlusIcon /> Add Folder
                        </Button>
                    </div>
                    <div className="menu-bar-panel menu-bar-right">
                        {renderRightList()}
                    </div>
                </div>
            </div>
        </MenuBarRoot>
    );
}
