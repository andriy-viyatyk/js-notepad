/** The read-only facade for one model-resolved toolset page. */
export interface IToolsetEditor {
    readonly id: "toolset-view";
    readonly name: string;
    readonly toolsetRoot: string | undefined;
    readonly toolsetName: string | undefined;
    readonly registered: boolean | undefined;
    readonly valid: boolean | undefined;
    readonly errors: readonly string[] | undefined;

    /** Refresh the whole registered-tool registry and this toolset's manifest. */
    refresh(): Promise<void>;
    /** Open the toolset root in an Explorer page. */
    openFolder(): Promise<void>;
    /** Open the tool execution log when one exists. */
    openLog(): Promise<void>;
}
