import { useCallback, useEffect, useMemo } from "react";
import { recentFiles } from "../../model/recentFiles";
import { FileListItem, FileList } from "./FileList";
import { windowUtils } from "../../common/utils";
import { pagesModel } from "../../model/pages-model";

interface RecentFileListProps {
    onClose?: () => void;
}

export function RecentFileList(props: RecentFileListProps) {
    useEffect(() => {
        recentFiles.load();
    }, []);

    const files = recentFiles.state.use(s => s.files);

    const items = useMemo(() => {
        const fileItems: FileListItem[] = files.map(filePath => ({
            filePath,
            title: windowUtils.path.basename(filePath),
        }));
        return fileItems;
    }, [files]);

    const onItemClick = useCallback((item: FileListItem) => {
        pagesModel.openFile(item.filePath);
        props.onClose?.();
    }, [props.onClose]);

    return <FileList items={items} onClick={onItemClick} />;
}