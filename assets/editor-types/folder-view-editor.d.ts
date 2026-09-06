export interface IFolderItem {
    readonly id?: string;
    readonly title: string;
    readonly href: string;
    readonly category: string;
    readonly tags: readonly string[];
    readonly isDirectory: boolean;
    readonly size?: number;
    readonly mtime?: string;
    readonly imgSrc?: string;
    readonly hasSubDirectories?: boolean;
    readonly hasItems?: boolean;
    readonly target?: string;
    readonly icon?: string;
}

export type IFolderViewMode =
    | "list"
    | "tiles-landscape"
    | "tiles-landscape-big"
    | "tiles-portrait"
    | "tiles-portrait-big";

export interface IFolderViewEditor {
    readonly id: "category-view";
    readonly name: string;
    readonly providerType: string | undefined;
    readonly providerName: string | undefined;
    readonly sourceUrl: string | undefined;
    readonly rootPath: string | undefined;
    readonly categoryPath: string | undefined;
    readonly selectedHref: string | undefined;
    readonly items: Promise<readonly IFolderItem[] | undefined>;
    readonly itemCount: Promise<number | undefined>;
    readonly viewMode: IFolderViewMode | undefined;

    listItems(): Promise<IFolderItem[] | undefined>;
    openItem(item: IFolderItem): Promise<void>;
    openCategory(category: string): Promise<void>;
    refresh(): Promise<void>;
}
