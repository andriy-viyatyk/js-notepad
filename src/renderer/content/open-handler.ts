import { app } from "../api/app";
import { pagesModel } from "../api/pages";
import { buildArchivePath } from "../core/utils/file-path";
import { cleanForStorage } from "../../shared/link-data";

/**
 * Register Layer 3 handler on openContent.
 *
 * Passes the pipe to the page model via openFile(filePath, pipe).
 * The page owns the pipe and uses it for all content I/O.
 *
 * Call during app bootstrap, before scripts load.
 */
export function registerOpenHandler(): void {
    app.events.openContent.subscribe(async (data) => {
        // Reconstruct full file path from pipe (provider + transformers).
        // For archive pipes: FileProvider("C:/data.zip") + ArchiveTransformer("readme.txt")
        //   → "C:/data.zip!readme.txt"
        let filePath = data.pipe.provider.sourceUrl;
        const zipTransformer = data.pipe.transformers.find((t) => t.type === "archive");
        if (zipTransformer) {
            const entryPath = zipTransformer.config.entryPath as string | undefined;
            if (entryPath) {
                filePath = buildArchivePath(filePath, entryPath);
            }
        }
        const pageId = data.pageId;
        const sourceLink = cleanForStorage(data);
        sourceLink.url = filePath;

        if (pageId) {
            // Navigate existing page to the new file — pass pipe through
            // On success the page owns the pipe; on error we must dispose it
            try {
                await pagesModel.lifecycle.navigatePageTo(pageId, filePath, {
                    revealLine: data.revealLine,
                    highlightText: data.highlightText,
                    fragment: data.fragment,
                    title: data.title,
                    sourceLink,
                    pipe: data.pipe,
                    target: data.target,
                    diffFrom: data.diffFrom,
                    diffTo: data.diffTo,
                });
            } catch (err) {
                data.pipe.dispose();
                throw err;
            }
        } else {
            // Open file in new or existing tab — pass pipe through
            // On success the page owns the pipe; on error we must dispose it
            try {
                await pagesModel.lifecycle.openFile(filePath, data.pipe, {
                    sourceLink,
                    fragment: data.fragment,
                    target: data.target,
                    diffFrom: data.diffFrom,
                    diffTo: data.diffTo,
                });
            } catch (err) {
                data.pipe.dispose();
                throw err;
            }
        }

        data.handled = true;
    });
}
