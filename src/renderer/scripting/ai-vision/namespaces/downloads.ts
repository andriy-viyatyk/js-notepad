import type { IDownloads } from "../../../api/types/downloads";
import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const DOWNLOADS_MEMBERS: readonly IAiMember[] = [
    { name: "downloads", kind: "property", summary: "Current download entries as plain data." },
    { name: "hasActiveDownloads", kind: "property", summary: "Whether any download is currently active." },
    { name: "aggregateProgress", kind: "property", summary: "Aggregate active-download progress." },
    { name: "cancelDownload", kind: "method", signature: "cancelDownload(id: string)", summary: "Cancel a download.", caution: "stops a user download" },
    { name: "openDownload", kind: "method", signature: "openDownload(id: string)", summary: "Open a completed download.", caution: "opens the downloaded file in the OS or app" },
    { name: "showInFolder", kind: "method", signature: "showInFolder(id: string)", summary: "Reveal a download in its folder.", caution: "opens or focuses an OS window" },
    { name: "clearCompleted", kind: "method", signature: "clearCompleted()", summary: "Clear completed download entries.", caution: "removes download history from the manager" },
];

export function describeDownloads(instance: unknown): IAiVisionDescriptor {
    const downloads = instance as IDownloads;
    return {
        kind: "Downloads",
        summary: "Track current downloads and manage completed or active entries.",
        members: DOWNLOADS_MEMBERS,
        help: "Inspect download state before using cancel, open, reveal, or clear actions; download entries remain plain data.",
        summarize: () => ({ kind: "Downloads", count: downloads.downloads.length, active: downloads.hasActiveDownloads }),
    };
}
