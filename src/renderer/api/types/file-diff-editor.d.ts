import type { ILinkDiffRevision } from "./io.link-data";
import type { IHighlightResult } from "./ui";

/** File Diff editor facade. */
export interface IFileDiffEditor {
    readonly id: "file-diff";
    readonly name: string;
    /** Selected original revision, or undefined while host/revision state is unresolved. */
    readonly from: ILinkDiffRevision | undefined;
    /** Selected modified revision, or undefined while host/revision state is unresolved. */
    readonly to: ILinkDiffRevision | undefined;
    /** Whether the file has staged changes, or undefined while detection is unresolved. */
    readonly hasStaged: boolean | undefined;
    /** Whether the modified revision is read-only, or undefined before `to` resolves. */
    readonly readOnly: boolean | undefined;
    /** Curated editor-owned controls with live visibility. */
    readonly elements: readonly {
        readonly name: string;
        readonly purpose: string;
        readonly selector: string;
        readonly visible: boolean;
    }[];
    /** Highlight one curated file-diff control by name. */
    highlight(name: string, message?: string): Promise<IHighlightResult>;
}
