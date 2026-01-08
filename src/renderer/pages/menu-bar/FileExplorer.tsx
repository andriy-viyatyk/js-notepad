import { useEffect } from "react";
import { TComponentModel, useComponentModel } from "../../common/classes/model";
import { FileListItem, FileList } from "./FileList";
import { nodeUtils } from "../../common/node-utils";
import { pagesModel } from "../../model/pages-model";
import { MenuItem } from "../../controls/PopupMenu";
import { api } from "../../../ipc/renderer/api";
import { filesModel } from "../../model/files-model";
const path = require("path");

interface FileExplorerProps {
    onClose?: () => void;
    basePath?: string;
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

    private loadDirectory = async (dirPath?: string) => {
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
            }
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
                        })
                        if (filePath) {
                            await filesModel.saveFile(filePath, "");
                            this.loadDirectory();
                        }
                    },
                }
            ]
        }
    }
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

    return (
        <FileList
            items={state.fileList}
            onClick={model.onItemClick}
            getContextMenu={model.getItemContextMenu}
            onContextMenu={model.onContextMenu}
        />
    );
}
