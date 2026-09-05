import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const BOARDS_MEMBERS: readonly IAiMember[] = [
    { name: "createBoard", kind: "method", signature: "createBoard(name: string, dir: string)", summary: "Scaffold and auto-trust a blank board.", caution: "writes a board to disk and grants its creation trust" },
    { name: "createDemoBoard", kind: "method", signature: "createDemoBoard(name: string, dir: string)", summary: "Scaffold and auto-trust the bundled Demo board.", caution: "writes a board to disk and grants its creation trust" },
    { name: "openBoard", kind: "method", signature: "openBoard(boardRoot: string)", summary: "Open an existing board in a new or reused tab.", caution: "opens a visible page and may invoke board trust flow" },
    { name: "registerBoard", kind: "method", signature: "registerBoard(boardRoot: string)", summary: "Request trust for a board through the user's trust dialog.", caution: "blocks on user consent and grants execution trust only after approval" },
    { name: "unregisterBoard", kind: "method", signature: "unregisterBoard(boardRoot: string)", summary: "Remove board trust and its pin.", caution: "changes board availability and sidebar state" },
    { name: "renameBoard", kind: "method", signature: "renameBoard(boardRoot: string, newName: string)", summary: "Rename a board folder and transfer associated state.", caution: "moves files and changes an open board's path" },
    { name: "searchPublished", kind: "method", signature: "searchPublished(query?: string)", summary: "Search the published-board catalog with local install annotations." },
    { name: "getPublishedVersions", kind: "method", signature: "getPublishedVersions(id: string)", summary: "Return published version history and compatibility/install flags." },
    { name: "downloadPublished", kind: "method", signature: "downloadPublished(id: string, opts?: { dir?: string; version?: string })", summary: "Download, verify, extract, and record a board without trusting it.", caution: "writes an archive's contents to disk" },
    { name: "installPublished", kind: "method", signature: "installPublished(id: string, opts?: { dir?: string; version?: string })", summary: "Start interactive installation or change an installed version.", caution: "writes board files and may block on board, trust, or close dialogs" },
    { name: "uninstallBoard", kind: "method", signature: "uninstallBoard(id: string)", summary: "Delete an installed catalog board after confirmation.", caution: "removes board files and trust/pin state" },
    { name: "checkPublishedUpdates", kind: "method", signature: "checkPublishedUpdates(force?: boolean)", summary: "Refresh the catalog and report compatible updates." },
];

export function describeBoards(_instance: unknown): IAiVisionDescriptor {
    return {
        kind: "Boards",
        summary: "Sandboxed mini web-apps: create, open, trust, install, update, and remove.",
        members: BOARDS_MEMBERS,
        help: "Use the board lifecycle deliberately: review downloaded code before registering trust, and expect open/install/uninstall actions to affect pages or disk.",
        summarize: () => ({ kind: "Boards" }),
    };
}
