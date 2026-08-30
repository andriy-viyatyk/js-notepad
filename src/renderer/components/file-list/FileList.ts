import type { SlotContent } from "../../uikit/shared/fill-slot";
import type { MenuItem } from "../../uikit/Menu";
import type { IconRef } from "../../uikit";
import { TComponentModel } from "../../core/state/model";

export interface FileListItem {
    filePath: string;
    title: string;
    isFolder?: boolean;
    /** Optional explicit icon override. */
    icon?: IconRef;
}

export interface FileListProps {
    items: FileListItem[];
    onClick: (item: FileListItem) => void;
    getContextMenu?: (item: FileListItem) => MenuItem[] | undefined;
    onContextMenu?: (event: MouseEvent) => void;
    searchable?: boolean;
    getTrailing?: (item: FileListItem) => SlotContent;
    compact?: boolean;
    selectedPath?: string;
}

interface FileListState {
    searchText: string;
    searchVisible: boolean;
    activeIndex: number | null;
}

export const defaultFileListState: FileListState = {
    searchText: "",
    searchVisible: false,
    activeIndex: null,
};

export class FileListModel extends TComponentModel<FileListState, FileListProps> {
    setSearchText = (searchText: string) => {
        this.state.update((s) => { s.searchText = searchText; });
    };

    setSearchVisible = (searchVisible: boolean) => {
        this.state.update((s) => { s.searchVisible = searchVisible; });
    };

    setActiveIndex = (activeIndex: number | null) => {
        this.state.update((s) => { s.activeIndex = activeIndex; });
    };

    showSearch = () => {
        this.setSearchVisible(true);
    };

    hideSearch = () => {
        this.setSearchVisible(false);
        this.setSearchText("");
    };

}
