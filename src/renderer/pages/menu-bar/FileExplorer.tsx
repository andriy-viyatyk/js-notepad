import { useEffect } from "react";
import { TComponentModel, useComponentModel } from "../../common/classes/model";
import { FileListItem, FileList } from "./FileList";
import { nodeUtils } from "../../common/node-utils";
import { pagesModel } from "../../model/pages-model";
import { MenuItem } from "../../controls/PopupMenu";
import { api } from "../../../ipc/renderer/api";
import { filesModel } from "../../model/files-model";
import styled from "@emotion/styled";
import color from "../../theme/color";
const path = require("path");

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
        files.sort((a, b) => a.title.localeCompare(b.title));

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
                label: "Show in Explorer",
                onClick: () => {
                    if (item.isFolder) {
                        api.showFolder(item.filePath);
                    } else {
                        api.showItemInFolder(item.filePath);
                    }
                },
            },
        ];
        return menuItems;
    };

    onContextMenu = (e: React.MouseEvent) => {
        if (e.nativeEvent.menuItems === undefined) {
            e.nativeEvent.menuItems = [
                {
                    label: "Create New File",
                    onClick: async () => {
                        const filePath = await api.showSaveFileDialog({
                            defaultPath: this.state.get().currentPath,
                            title: "Create New File",
                        });
                        if (filePath) {
                            await filesModel.saveFile(filePath, "");
                            this.loadDirectory();
                        }
                    },
                },
            ];
        }
    };

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
}

export function FileExplorer(props: FileExplorerProps) {
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
                items={state.fileList}
                onClick={model.onItemClick}
                getContextMenu={model.getItemContextMenu}
                onContextMenu={model.onContextMenu}
            />
        </FileListRoot>
    );
}
