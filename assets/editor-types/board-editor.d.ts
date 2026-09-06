export type BoardRenderState = "trusted" | "untrusted" | "not-found";

export interface IBoardSecondaryViewDeclaration {
    readonly id: string;
    readonly html?: string;
    readonly title?: string;
}

export interface IBoardManifest {
    readonly schemaVersion: number;
    readonly name?: string;
    readonly description?: string;
    readonly author?: string;
    readonly repository?: string;
    readonly version?: string;
    readonly standalone?: boolean;
    readonly minAppVersion?: string;
    readonly fileMasks?: readonly string[];
    readonly folderMasks?: readonly string[];
    readonly editorPriority?: number;
    readonly editorName?: string;
    readonly editorKind?: "simple" | "content-host";
    readonly editorSources?: "local" | "any";
    readonly secondaryViews?: readonly IBoardSecondaryViewDeclaration[];
}

export interface IBoardSecondaryView {
    readonly id: string;
    readonly panelId: string;
    readonly html?: string;
    readonly title?: string;
    readonly expanded?: boolean;
}

export interface IBoardReloadResult {
    readonly refreshed: true;
    readonly pageId: string;
    readonly frameReady: boolean;
    readonly renderState: BoardRenderState;
}

export interface IBoardEditor {
    readonly id: "board-view" | `board-editor:${string}`;
    readonly name: string;
    readonly boardRoot: string | undefined;
    readonly boardName: string | undefined;
    readonly renderState: BoardRenderState;
    getManifest(): Promise<IBoardManifest | undefined>;
    readonly secondaryViews: readonly IBoardSecondaryView[] | undefined;
    readonly statusText: string | undefined;
    readonly busy: boolean | undefined;
    readonly frameReady: boolean | undefined;
    readonly contentHostError: string | undefined;
    reload(): Promise<IBoardReloadResult>;
}
