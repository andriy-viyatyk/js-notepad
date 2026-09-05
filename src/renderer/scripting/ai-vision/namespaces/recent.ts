import type { IRecentFiles } from "../../../api/types/recent";
import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const RECENT_FILES_MEMBERS: readonly IAiMember[] = [
    { name: "files", kind: "property", summary: "Loaded recent paths, most recent first; empty until load runs." },
    { name: "load", kind: "method", signature: "load()", summary: "Load recent paths from disk." },
    { name: "add", kind: "method", signature: "add(filePath: string)", summary: "Add a path to the top, deduplicating and capping at 100.", caution: "changes persisted recent-file history" },
    { name: "remove", kind: "method", signature: "remove(filePath: string)", summary: "Remove a path.", caution: "changes persisted recent-file history" },
    { name: "clear", kind: "method", signature: "clear()", summary: "Clear all recent paths.", caution: "deletes persisted recent-file history" },
];

export function describeRecentFiles(instance: unknown): IAiVisionDescriptor {
    const recent = instance as IRecentFiles;
    return {
        kind: "RecentFiles",
        summary: "Access and manage the recently opened file paths.",
        members: RECENT_FILES_MEMBERS,
        help: "Call load before reading files; add, remove, and clear change persisted recent-file history.",
        summarize: () => ({ kind: "RecentFiles", count: recent.files.length }),
    };
}
