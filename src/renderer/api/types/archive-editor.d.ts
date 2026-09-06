export interface IArchiveEntry {
    readonly path: string;
    readonly isDirectory: boolean;
    readonly size: number;
    readonly mtime: number;
}

export interface IArchiveEditor {
    readonly id: "archive-view";
    readonly name: string;
    readonly archivePath: string | undefined;
    readonly selectedEntryHref: string | undefined;

    listEntries(): Promise<IArchiveEntry[] | undefined>;
    openEntry(innerPath: string): Promise<void>;
    extractTo(targetDir: string): Promise<void>;
}
