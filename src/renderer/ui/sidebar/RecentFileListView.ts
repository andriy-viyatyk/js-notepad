import { fpBasename } from "../../core/utils/file-path";
import { pagesModel } from "../../api/pages";
import { recent } from "../../api/recent";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { FileListView } from "../../components/file-list/FileListView";
import type { FileListItem, FileListProps } from "../../components/file-list/FileList";
import type { MenuItem } from "../../uikit/Menu";
import { api } from "../../../ipc/renderer/api";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createIconElement } from "../../uikit/shared/slots";

export interface RecentFileListProps {
    onClose?: () => void;
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

    protected onUpdate(): void {
        this.fileList.update(this.fileListProps());
    }

    public get model() {
        return this.fileList.model;
    }

    public async reload(): Promise<void> {
        await this.loadRecentFiles();
    }

    private fileListProps(): FileListProps {
        return {
            items: this.items(),
            onClick: (item) => this.openItem(item),
            getContextMenu: (item) => this.getContextMenu(item),
        };
    }

    private async loadRecentFiles(): Promise<void> {
        const loadId = ++this.loadId;
        await recent.load();
        if (!this.live || loadId !== this.loadId) return;
        this.files = recent.files;
        this.fileList.update(this.fileListProps());
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
                icon: createIconElement("open-file"),
                onClick: () => this.openItem(item),
            },
            {
                label: "Open in New Window",
                icon: createIconElement("new-window"),
                onClick: () => pagesModel.openPathInNewWindow(item.filePath),
                invisible: item.isFolder,
            },
            {
                label: "Show in File Explorer",
                icon: createIconElement("folder-open"),
                onClick: () => { api.showItemInFolder(item.filePath); },
            },
            {
                label: "Remove from Recent",
                icon: createIconElement("remove"),
                onClick: async () => {
                    const filePath = item.filePath;
                    await recent.remove(filePath);
                    if (!this.live) return;
                    this.files = recent.files;
                    this.fileList.update(this.fileListProps());
                },
            },
        ];
    }
}
