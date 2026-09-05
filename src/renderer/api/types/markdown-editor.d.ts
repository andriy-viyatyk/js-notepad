import type { IHighlightResult } from "./ui";

/**
 * IMarkdownEditor — script interface for the markdown preview.
 *
 * Obtained via `page.editor`. Only for text pages with markdown content.
 *
 * @example
 * const md = page.editor;
 * if (md.viewMounted) {
 *     console.log(md.html); // rendered HTML from the preview
 * }
 */
export interface IMarkdownEditor {
    readonly id: "md-view";
    readonly name: string;
    /** Curated persistent controls owned by this preview, with live visibility. */
    readonly elements: readonly {
        readonly name: string;
        readonly purpose: string;
        readonly selector: string;
        readonly visible: boolean;
    }[];
    /** Highlight one curated preview control by name. */
    highlight(name: string, message?: string): Promise<IHighlightResult>;
    /** True if the markdown preview container is mounted in the DOM. */
    readonly viewMounted: boolean;

    /** The rendered HTML content from the preview container. Empty if view is not mounted. */
    readonly html: string;

    readonly compactMode: boolean;
    readonly searchVisible: boolean;
    readonly searchText: string;
    readonly currentMatchIndex: number;
    readonly totalMatches: number;

    revealFragment(fragment: string): void;
    navigateBack(): Promise<void>;
    toggleCompact(): void;
    openSearch(): void;
    closeSearch(): void;
    setSearchText(text: string): void;
    nextMatch(): void;
    prevMatch(): void;
}
