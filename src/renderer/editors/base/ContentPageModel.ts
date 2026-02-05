import { IPage } from "../../../shared/types";
import { PageModel, getDefaultPageModelState } from "./PageModel";

/**
 * Base state for content-based page models (text, grid, etc.)
 */
export interface ContentPageModelState extends IPage {
    content: string;
    deleted: boolean;
    encoding?: string;
    restored: boolean;
    temp: boolean;
}

/**
 * Default state factory for content page models
 */
export const getDefaultContentPageModelState = (): ContentPageModelState => ({
    ...getDefaultPageModelState(),
    content: "",
    deleted: false,
    encoding: undefined,
    restored: false,
    temp: true,
});

/**
 * Abstract base class for editors that handle file content.
 * Provides common functionality for:
 * - Content management
 * - File I/O operations
 * - State persistence
 *
 * Extended by TextFileModel, GridPageModel, etc.
 *
 * Note: canClose is inherited from TDialogModel as an optional property.
 * Subclasses should assign to this.canClose in their constructor or define it as a method.
 */
export abstract class ContentPageModel<
    T extends ContentPageModelState = ContentPageModelState,
    R = void
> extends PageModel<T, R> {
    /**
     * Called when content changes
     */
    abstract changeContent(newContent: string, byUser?: boolean): void;

    /**
     * Clean up resources when the page is closed
     */
    abstract dispose(): Promise<void>;

    /**
     * Save the file to disk
     */
    abstract saveFile(saveAs?: boolean): Promise<boolean>;
}
