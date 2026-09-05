import type { IHighlightResult } from "./ui";

/** The presentation state and curated controls of one page's tab-strip entry. */
export interface IPageTab {
    /** The real page title, even when a pinned tab hides its title text. */
    readonly title: string;
    readonly modified: boolean;
    readonly pinned: boolean;
    /** True for the active page and its grouped partner. */
    readonly active: boolean;
    /** Whether the tab's conditional sound/mute control is present. */
    readonly soundIndicator: boolean;
    readonly elements: readonly {
        readonly name: string;
        readonly purpose: string;
        readonly selector: string;
        readonly visible: boolean;
    }[];
    highlight(name: string, message?: string): Promise<IHighlightResult>;
}
