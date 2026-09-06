export interface ILogEntrySnapshot {
    readonly type: string;
    readonly id: string;
    readonly timestamp?: number;
    readonly [key: string]: unknown;
}

export type ILogPushEntry = string | {
    readonly type: string;
    readonly [key: string]: unknown;
};

export interface ILogPushResult {
    readonly entryIds: string[];
    readonly dialogIds: string[];
}

export type ILogDialogResult =
    | { readonly id: string; readonly status: "unresolved" }
    | { readonly id: string; readonly status: "resolved"; readonly entry: ILogEntrySnapshot };

export interface ILogViewEditor {
    readonly id: "log-view";
    readonly name: string;
    readonly entries: ILogEntrySnapshot[] | undefined;
    readonly entryCount: number | undefined;
    readonly error: string | undefined;
    readonly showTimestamps: boolean | undefined;

    push(entries: ILogPushEntry[]): ILogPushResult;
    dialogResult(id: string): ILogDialogResult | undefined;
    clear(): void;
    toggleTimestamps(): void;
    readonly elements: readonly {
        readonly name: string;
        readonly purpose: string;
        readonly selector: string;
        readonly visible: boolean;
    }[];
    highlight(name: string, message?: string): Promise<unknown>;
}
