import { fpBasename } from "../../core/utils/file-path";
import { pagesModel } from "../../api/pages";
import { recent } from "../../api/recent";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { FileListView } from "../../components/file-list/FileListView";
import type { FileListItem, FileListModel, FileListProps } from "../../components/file-list/FileList";
import type { MenuItem } from "../../uikit/Menu";
import { api } from "../../../ipc/renderer/api";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import {
    FolderOpenIcon,
    NewWindowIcon,
    OpenFileIcon,
    RemoveIcon,
} from "../../theme/icons";

export interface RecentFileListProps {
    onClose?: () => void;
    onModel?: (model: FileListModel | null) => void;
}

export class RecentFileListView extends VanillaView<RecentFileListProps> {
    private readonly fileList: FileListView;
    private files: string[] = [];
    private loadId = 0;
    private live = true;

    public constructor(props: RecentFileListProps) {
        const holder: { view?: RecentFileListView } = {};
        const fileListProps: FileListProps = {
            items: [],
            onClick: (item) => holder.view?.openItem(item),
            getContextMenu: (item) => holder.view?.getContextMenu(item),
            onModel: (model) => holder.view?.props.onModel?.(model),
        };
        const fileList = new FileListView(fileListProps);
        super(props, fileList.root);
        holder.view = this;
        this.fileList = fileList;
    }

    protected onMount(): void {
        this.child(this.fileList).mount();
        this.own(() => { this.live = false; });
        void this.loadRecentFiles();
    }

    protected onUpdate(props: RecentFileListProps): void {
        this.fileList.update(this.fileListProps(props));
    }

    public async reload(): Promise<void> {
        await this.loadRecentFiles();
    }

    private fileListProps(props: RecentFileListProps): FileListProps {
        return {
            items: this.items(),
            onClick: (item) => this.openItem(item),
            getContextMenu: (item) => this.getContextMenu(item),
            onModel: (model) => props.onModel?.(model),
        };
    }

    private async loadRecentFiles(): Promise<void> {
        const loadId = ++this.loadId;
        await recent.load();
        if (!this.live || loadId !== this.loadId) return;
        this.files = recent.files;
        this.fileList.update(this.fileListProps(this.props));
    }

    private items(): FileListItem[] {
        return this.files.map((filePath) => ({ filePath, title: fpBasename(filePath) }));
    }

    private openItem(item: FileListItem): void {
        void app.events.openRawLink.sendAsync(createLinkData(item.filePath));
        this.props.onClose?.();
    }

    private getContextMenu(item: FileListItem): MenuItem[] {
        return [
            {
                label: "Open",
                icon: React.createElement(OpenFileIcon),
                onClick: () => this.openItem(item),
            },
            {
                label: "Open in New Window",
                icon: React.createElement(NewWindowIcon),
                onClick: () => pagesModel.openPathInNewWindow(item.filePath),
                invisible: item.isFolder,
            },
            {
                label: "Show in File Explorer",
                icon: React.createElement(FolderOpenIcon),
                onClick: () => { api.showItemInFolder(item.filePath); },
            },
            {
                label: "Remove from Recent",
                icon: React.createElement(RemoveIcon),
                onClick: async () => {
                    const filePath = item.filePath;
                    await recent.remove(filePath);
                    if (!this.live) return;
                    this.files = recent.files;
                    this.fileList.update(this.fileListProps(this.props));
                },
            },
        ];
    }
}
import React from "react";
