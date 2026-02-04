import { forwardRef, useEffect } from "react";
import { TComponentModel, useComponentModel } from "../../common/classes/model";
import { FileListItem, FileList, FileListRef } from "./FileList";
import { nodeUtils } from "../../common/node-utils";
import { pagesModel } from "../../model/pages-model";
import { MenuItem } from "../../controls/PopupMenu";
import { api } from "../../../ipc/renderer/api";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { showInputDialog } from "../../dialogs/dialogs/InputDialog";
import { alertWarning } from "../../dialogs/alerts/AlertsBar";
import { showConfirmationDialog } from "../../dialogs/dialogs/ConfirmationDialog";
const path = require("path");
const fs = require("fs");

const FileListRoot = styled("div")({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    "& .file-explorer-header": {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        fontSize: 13,
        padding: "2px 4px",
        color: color.text.light,
        overflow: "hidden",
        flexWrap: "nowrap",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        "& .home-label": {
            fontSize: 18,
        },
        "& .sub-folder-label": {
            "&:hover:not(:last-child)": {
                textDecoration: "underline",
                cursor: "pointer",
                color: color.text.default,
            },
        },
        "& .current-path-label": {},
    },
});

interface FileExplorerProps {
    onClose?: () => void;
    basePath?: string;
    menuOpen?: boolean;
}

const defaultFileExplorerState = {
    currentPath: "",
    fileList: [] as FileListItem[],
    subPath: [] as string[],
};

type FileExplorerState = typeof defaultFileExplorerState;

class FileExplorerModel extends TComponentModel<
    FileExplorerState,
    FileExplorerProps
> {
    init = () => {
        this.loadDirectory(this.props.basePath);
    };

    loadDirectory = async (dirPath?: string) => {
        dirPath = dirPath || this.state.get().currentPath;
        if (!dirPath) {
            return;
        }

        const items = nodeUtils.listFolderContent(dirPath);
        const folders: FileListItem[] = items
            .filter((i) => i.isFolder)
            .map((i) => ({
                filePath: i.path,
                title: path.basename(i.path),
                isFolder: true,
            }));
        const files: FileListItem[] = items
            .filter((i) => !i.isFolder)
            .map((i) => ({
                filePath: i.path,
                title: path.basename(i.path),
            }));
        folders.sort((a, b) => a.title.localeCompare(b.title));
        files.sort((a, b) => {
            const aExt = path.extname(a.title);
            const bExt = path.extname(b.title);
            const extComp = aExt.localeCompare(bExt);
            if (extComp !== 0) {
                return extComp;
            }
            return a.title.localeCompare(b.title);
        });

        if (this.state.get().subPath.length > 0) {
            folders.unshift({
                filePath: path.dirname(dirPath),
                title: "..",
                isFolder: true,
            });
        }

        this.state.update((s) => {
            s.currentPath = dirPath;
            s.fileList = [...folders, ...files];
        });
    };

    onItemClick = (item: FileListItem) => {
        if (item.isFolder) {
            if (item.title === "..") {
                this.state.update((s) => {
                    s.subPath.pop();
                    s.currentPath = path.dirname(s.currentPath);
                });
            } else {
                this.state.update((s) => {
                    s.subPath.push(path.basename(item.filePath));
                    s.currentPath = item.filePath;
                });
            }
            this.loadDirectory();
        } else {
            pagesModel.openFile(item.filePath);
            this.props.onClose?.();
        }
    };

    getItemContextMenu = (item: FileListItem) => {
        const menuItems: MenuItem[] = [
            {
                label: "Open",
                onClick: () => this.onItemClick(item),
            },
            {
                label: "Open in New Window",
                onClick: () => pagesModel.openPathInNewWindow(item.filePath),
                invisible: item.isFolder,
            },
            {
                label: "Show in File Explorer",
                onClick: () => {
                    if (item.isFolder) {
                        api.showFolder(item.filePath);
                    } else {
                        api.showItemInFolder(item.filePath);
                    }
                },
            },
            {
                startGroup: true,
                label: "Rename",
                onClick: () => this.renameItem(item),
            },
            {
                label: "Delete",
                onClick: () => this.deleteItem(item),
            }
        ];
        return menuItems;
    };

    onContextMenu = (e: React.MouseEvent) => {
        if (e.nativeEvent.menuItems === undefined) {
            e.nativeEvent.menuItems = [];
        }
            e.nativeEvent.menuItems.push(
                {
                    label: "Create New File",
                    onClick: this.createNewFile,
                },
                {
                    label: "Create New Folder",
                    onClick: this.createNewFolder,
                }
            );
    };

    createNewFile = async () => {
        const currentPath = this.state.get().currentPath;
        const inputResult = await showInputDialog({
            title: "New File",
            message: "Enter file name:",
            buttons: ["Create", "Cancel"],
        });
        if (inputResult && inputResult.button === "Create" && inputResult.value.trim() !== "") {
            const newFilePath = path.join(currentPath, inputResult.value.trim());
            if (fs.existsSync(newFilePath)) {
                alertWarning("A file or folder with that name already exists.");
                return;
            }
            try {
                fs.writeFileSync(newFilePath, "");
            } catch (err) {
                alertWarning(err.message || "Failed to create file.");
                return;
            }
            this.loadDirectory();
        }
    };

    createNewFolder = async () => {
        const currentPath = this.state.get().currentPath;
        const inputResult = await showInputDialog({
            title: "New Folder",
            message: "Enter folder name:",
            buttons: ["Create", "Cancel"],
        });
        if (inputResult && inputResult.button === "Create" && inputResult.value.trim() !== "") {
            const newFolderPath = path.join(currentPath, inputResult.value.trim());
            if (fs.existsSync(newFolderPath)) {
                alertWarning("A file or folder with that name already exists.");
                return;
            }
            try {
                fs.mkdirSync(newFolderPath);
            } catch (err) {
                alertWarning(err.message || "Failed to create folder.");
                return;
            }
            this.loadDirectory();
        }
    }

    navigateToIndex = (index: number) => {
        let path = this.props.basePath;
        if (index < 0) {
            this.state.update((s) => {
                s.subPath = [];
            });
        } else {
            const subPaths = this.state.get().subPath.slice(0, index + 1);
            this.state.update((s) => {
                s.subPath = subPaths;
            });
            path = this.props.basePath + "/" + subPaths.join("/");
        }
        this.loadDirectory(path);
    };

    renameItem = async (item: FileListItem) => {
        const inputResult = await showInputDialog({
            title: `Rename ${item.isFolder ? "Folder" : "File"}`,
            message: "Enter new name:",
            value: item.title,
            buttons: ["Rename", "Cancel"],
            selectAll: true,
        });
        if (inputResult && inputResult.button === "Rename" && inputResult.value.trim() !== "") {
            const newPath = path.join(
                path.dirname(item.filePath),
                inputResult.value.trim()
            );
            if (fs.existsSync(newPath)) {
                alertWarning("A file or folder with that name already exists.");
                return;
            }
            try {
                fs.renameSync(item.filePath, newPath);
            } catch (err) {
                alertWarning(err.message || `Failed to rename ${item.isFolder ? "folder" : "file"}.`);
                return;
            }
            this.loadDirectory();
        }
    }

    deleteItem = async (item: FileListItem) => {
        const bt = await showConfirmationDialog({
            title: "Delete Confirmation",
            message: `Are you sure you want to delete "${item.title}" ${item.isFolder ? "folder" : "file"}?`,
            buttons: ["Delete", "Cancel"],
        });
        if (bt !== "Delete") {
            return;
        }
        try {
            if (item.isFolder) {
                fs.rmdirSync(item.filePath, { recursive: true });
            } else {
                fs.unlinkSync(item.filePath);
            }
        } catch (err) {
            alertWarning(err.message || "Failed to delete file or folder.");
            return;
        }
        this.loadDirectory();
    };
}

export const FileExplorer = forwardRef<FileListRef, FileExplorerProps>(
    function FileExplorer(props, ref) {
        const model = useComponentModel(
            props,
            FileExplorerModel,
            defaultFileExplorerState
        );
        const state = model.state.use();

        useEffect(() => {
            model.init();
        }, []);

        useEffect(() => {
            if (props.menuOpen) {
                model.loadDirectory();
            }
        }, [props.menuOpen]);

        // Clear search when navigating to a different directory
        useEffect(() => {
            if (ref && typeof ref !== "function") {
                ref.current?.hideSearch();
            }
        }, [state.currentPath]);

        return (
            <FileListRoot>
                <div className="file-explorer-header">
                    {state.subPath.length ? (
                        <>
                            <span
                                className="sub-folder-label home-label"
                                onClick={() => model.navigateToIndex(-1)}
                            >
                                ⌂
                            </span>
                            {state.subPath.map((p, idx) => (
                                <span
                                    key={idx}
                                    className="sub-folder-label"
                                    onClick={() => {
                                        if (idx < state.subPath.length - 1) {
                                            model.navigateToIndex(idx);
                                        }
                                    }}
                                >
                                    {`/${p}`}
                                </span>
                            ))}
                        </>
                    ) : (
                        <span className="current-path-label">
                            {state.currentPath}
                        </span>
                    )}
                </div>
                <FileList
                    ref={ref}
                    items={state.fileList}
                    onClick={model.onItemClick}
                    getContextMenu={model.getItemContextMenu}
                    onContextMenu={model.onContextMenu}
                />
            </FileListRoot>
        );
    }
);
