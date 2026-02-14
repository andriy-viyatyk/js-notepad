import { useCallback } from "react";
import styled from "@emotion/styled";
import { NavPanelModel } from "./nav-panel-store";
import { NavTreeItem } from "../../core/utils/nav-tree";
import { TreeView } from "../../components/TreeView/TreeView";
import { FileTypeIcon } from "../../editors/base/LanguageIcon";
import { Button } from "../../components/basic/Button";
import { CloseIcon, CopyIcon, FolderOpenIcon, OpenFileIcon, RefreshIcon } from "../../theme/icons";
import { FolderIcon } from "../sidebar/FileIcon";
import color from "../../theme/color";
import { pagesModel } from "../../store";
import { api } from "../../../ipc/renderer/api";

const path = require("path");

const NavigationPanelRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    backgroundColor: color.background.default,

    "& .nav-header": {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        padding: "4px 4px 4px 8px",
        borderBottom: `1px solid ${color.border.light}`,
        flexShrink: 0,
    },

    "& .nav-header-title": {
        flex: "1 1 auto",
        fontSize: 12,
        fontWeight: 600,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: color.text.light,
    },

    "& .nav-tree": {
        flex: "1 1 auto",
        overflow: "hidden",
    },

    "& .nav-item-missing": {
        opacity: 0.4,
    },

    "& .nav-item-label": {
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontSize: 13,
    },
});

interface NavigationPanelProps {
    model: NavPanelModel;
    pageId: string;
}

export function NavigationPanel({ model, pageId }: NavigationPanelProps) {
    const { tree, currentFilePath } = model.state.use();

    const handleItemClick = useCallback((item: NavTreeItem) => {
        if (item.isFolder) return;
        if (!item.exists) return;
        if (item.filePath.toLowerCase() === currentFilePath?.toLowerCase()) return;

        pagesModel.navigatePageTo(pageId, item.filePath);
    }, [pageId, currentFilePath]);

    const handleItemContextMenu = useCallback((item: NavTreeItem, e: React.MouseEvent) => {
        if (!e.nativeEvent.menuItems) {
            e.nativeEvent.menuItems = [];
        }
        e.nativeEvent.menuItems.push(
            {
                label: "Open in New Tab",
                icon: <OpenFileIcon />,
                onClick: () => pagesModel.openFile(item.filePath),
                disabled: !item.exists,
                invisible: item.isFolder,
            },
            {
                label: "Show in File Explorer",
                icon: <FolderOpenIcon />,
                onClick: () => {
                    if (item.isFolder) {
                        api.showFolder(item.filePath);
                    } else {
                        api.showItemInFolder(item.filePath);
                    }
                },
            },
            {
                label: "Copy File Path",
                icon: <CopyIcon />,
                onClick: () => navigator.clipboard.writeText(item.filePath),
            },
        );
    }, []);

    if (!tree) return null;

    return (
        <NavigationPanelRoot>
            <div className="nav-header">
                <span className="nav-header-title" title={tree.filePath}>
                    {tree.label}
                </span>
                <Button
                    type="icon"
                    size="small"
                    title="Refresh"
                    onClick={model.buildTree}
                >
                    <RefreshIcon width={14} height={14} />
                </Button>
                <Button
                    type="icon"
                    size="small"
                    title="Close Panel"
                    onClick={model.close}
                >
                    <CloseIcon width={14} height={14} />
                </Button>
            </div>
            <div className="nav-tree">
                <TreeView<NavTreeItem>
                    root={tree}
                    getId={getItemId}
                    getLabel={(item) => (
                        <span
                            className={item.exists || item.isFolder ? "nav-item-label" : "nav-item-label nav-item-missing"}
                            title={item.filePath}
                        >
                            {item.label}
                        </span>
                    )}
                    getIcon={(item) => (
                        item.isFolder ? <FolderIcon /> : (
                            <FileTypeIcon
                                fileName={path.basename(item.filePath)}
                                width={16}
                                height={16}
                            />
                        )
                    )}
                    getSelected={(item) =>
                        item.filePath.toLowerCase() === currentFilePath?.toLowerCase()
                    }
                    onItemClick={handleItemClick}
                    onItemContextMenu={handleItemContextMenu}
                    rootCollapsible={false}
                    defaultExpandAll
                    refreshKey={currentFilePath}
                />
            </div>
        </NavigationPanelRoot>
    );
}

function getItemId(item: NavTreeItem): string {
    return item.filePath;
}
