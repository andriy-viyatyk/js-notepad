export type MnemeConnectionStatus = "connecting" | "connected" | "error" | "disconnected";

export interface IMnemeReindexProgress {
    readonly phase: string;
    readonly processed: number;
    readonly total: number;
}

export interface IMnemeRootStatus {
    readonly name: string;
    readonly folder: string;
    readonly docCount: number;
    readonly model: string;
    readonly precision: string;
    readonly schemaVer: number;
    readonly indexPath: string;
    readonly indexBytes: number;
    readonly reindex?: IMnemeReindexProgress;
}

export interface IMnemeModelFile {
    readonly filename: string;
    readonly present: boolean;
    readonly verified: boolean;
    readonly bytes: number;
}

export interface IMnemeModelDownload {
    readonly phase: string;
    readonly bytesDone: number;
    readonly bytesTotal: number;
}

export interface IMnemeModelStatus {
    readonly name: string;
    readonly precision: string;
    readonly version: number;
    readonly dir: string;
    readonly complete: boolean;
    readonly files: readonly IMnemeModelFile[];
    readonly download?: IMnemeModelDownload;
}

export interface IMnemeRootConfig {
    readonly name: string;
    readonly folder: string;
    readonly include: readonly string[];
    readonly ignore: readonly string[];
}

export interface IMnemeConfigEditor {
    readonly id: "mneme-config";
    readonly name: string;
    readonly running: boolean;
    readonly url?: string;
    readonly connectionStatus: MnemeConnectionStatus;
    readonly errorMessage?: string;
    readonly roots?: readonly IMnemeRootStatus[];
    readonly model?: IMnemeModelStatus;
    readonly modelReady?: boolean;
    readonly reindexProgress?: Readonly<Record<string, IMnemeReindexProgress>>;
    readonly rootConfigs?: Readonly<Record<string, IMnemeRootConfig>>;
    readonly refreshing: boolean;

    refresh(): Promise<void>;
    restart(): Promise<void>;
    removeRoot(root: string): Promise<void>;
    reindex(root?: string): Promise<void>;
    getRootConfig(root: string): Promise<void>;
    setRootConfig(root: string, include: string[], ignore: string[]): Promise<void>;
    updateModel(): Promise<void>;
}
