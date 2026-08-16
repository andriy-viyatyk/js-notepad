import { fpBasename } from "../../core/utils/file-path";
import { useCallback, useEffect, useMemo } from "react";
import { pagesModel } from "../../api/pages";
import { recent } from "../../api/recent";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { FileListItem, FileList, FileListModel } from "../../components/file-list";
import type { MenuItem } from "../../uikit/Menu";
import { api } from "../../../ipc/renderer/api";
import {
    FolderOpenIcon,
    NewWindowIcon,
    OpenFileIcon,
    RemoveIcon,
} from "../../theme/icons";

interface RecentFileListProps {
    onClose?: () => void;
    onModel?: (model: FileListModel | null) => void;
}

export const RecentFileList = function RecentFileList({ onClose, onModel }: RecentFileListProps) {
        useEffect(() => {
            recent.load();
        }, []);

        const files = recent.useFiles();

        const items = useMemo(() => {
            const fileItems: FileListItem[] = files.map((filePath) => ({
                filePath,
                title: fpBasename(filePath),
            }));
            return fileItems;
        }, [files]);

        const onItemClick = useCallback(
            (item: FileListItem) => {
                app.events.openRawLink.sendAsync(createLinkData(item.filePath));
                onClose?.();
            },
            [onClose]
        );

        const getItemContextMenu = useCallback((item: FileListItem) => {
            const menuItems: MenuItem[] = [
                {
                    label: "Open",
                    icon: <OpenFileIcon />,
                    onClick: () => {
                        app.events.openRawLink.sendAsync(createLinkData(item.filePath));
                        onClose?.();
                    },
                },
                {
                    label: "Open in New Window",
                    icon: <NewWindowIcon />,
                    onClick: () => pagesModel.openPathInNewWindow(item.filePath),
                    invisible: item.isFolder,
                },
                {
                    label: "Show in File Explorer",
                    icon: <FolderOpenIcon />,
                    onClick: () => { api.showItemInFolder(item.filePath); },
                },
                {
                    label: "Remove from Recent",
                    icon: <RemoveIcon />,
                    onClick: async () => {
                        await recent.remove(item.filePath);
                    },
                }
            ];
            return menuItems;
        }, [onClose]);

        return (
            <FileList
                onModel={onModel}
                items={items}
                onClick={onItemClick}
                getContextMenu={getItemContextMenu}
            />
        );
};
