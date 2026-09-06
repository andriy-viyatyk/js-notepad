import type { IHighlightResult } from "./ui";

/** One active compare-mode pair with explicit left and right page identity. */
export interface IComparePair {
    readonly leftPageId: string;
    readonly rightPageId: string;
    readonly leftTitle: string;
    readonly rightTitle: string;
    readonly leftFilePath?: string;
    readonly rightFilePath?: string;
}

/** Compare mode exposed from the pages collection. */
export interface ICompareMode {
    readonly pairs: readonly IComparePair[];
    enter(pageId: string): void;
    exit(pageId: string): void;
    readonly elements: readonly {
        readonly name: string;
        readonly purpose: string;
        readonly selector: string;
        readonly visible: boolean;
    }[];
    highlight(name: string, message?: string): Promise<IHighlightResult>;
}
