const path = require("path");
import { useCallback, useEffect, useMemo } from "react";
import { recentFiles } from "../../model/recentFiles";
import { FileListItem, FileList } from "./FileList";
import { pagesModel } from "../../model/pages-model";
import { MenuItem } from "../../controls/PopupMenu";
import { api } from "../../../ipc/renderer/api";

interface RecentFileListProps {
    onClose?: () => void;
}

export function RecentFileList(props: RecentFileListProps) {
    useEffect(() => {
        recentFiles.load();
    }, []);

    const files = recentFiles.state.use((s) => s.files);

    const items = useMemo(() => {
        const fileItems: FileListItem[] = files.map((filePath) => ({
            filePath,
            title: path.basename(filePath),
        }));
        return fileItems;
    }, [files]);

    const onItemClick = useCallback(
        (item: FileListItem) => {
            pagesModel.openFile(item.filePath);
            props.onClose?.();
        },
        [props.onClose]
    );

    const getItemContextMenu = useCallback((item: FileListItem) => {
        const menuItems: MenuItem[] = [
            {
                label: "Open",
                onClick: () => {
                    pagesModel.openFile(item.filePath);
                    props.onClose?.();
                },
            },
            {
                label: "Open in New Window",
                onClick: () => pagesModel.openPathInNewWindow(item.filePath),
                invisible: item.isFolder,
            },
            {
                label: "Show in File Explorer",
                onClick: () => { api.showItemInFolder(item.filePath); },
            },
            {
                label: "Remove from Recent",
                onClick: async () => {
                    await recentFiles.remove(item.filePath);
                },
            }
        ];
        return menuItems;
    }, []);

    return (
        <FileList
            items={items}
            onClick={onItemClick}
            getContextMenu={getItemContextMenu}
        />
    );
}
