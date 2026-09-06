import {
    BOARDS_ASSETS_BASE_URL,
    BOARDS_MANIFEST_URL,
    getCurrentBoardListingAt,
    getCurrentBoardListings,
} from "../../../api/boards";
import type { IAiChild, IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const BOARDS_MEMBERS: readonly IAiMember[] = [
    { name: "createBoard", kind: "method", signature: "createBoard(name: string, dir: string)", summary: "Scaffold and auto-trust a blank board.", caution: "writes a board to disk and grants its creation trust" },
    { name: "createDemoBoard", kind: "method", signature: "createDemoBoard(name: string, dir: string)", summary: "Scaffold and auto-trust the bundled Demo board; use main.runtime.demoBoardDir as the bundled template directory reference.", caution: "writes a board to disk and grants its creation trust" },
    { name: "openBoard", kind: "method", signature: "openBoard(boardRoot: string)", summary: "Open an existing board in a new or reused tab.", caution: "opens a visible page and may invoke board trust flow" },
    { name: "registerBoard", kind: "method", signature: "registerBoard(boardRoot: string)", summary: "Request trust for a board through the user's trust dialog.", caution: "blocks on user consent and grants execution trust only after approval" },
    { name: "unregisterBoard", kind: "method", signature: "unregisterBoard(boardRoot: string)", summary: "Remove board trust and its pin.", caution: "changes board availability and sidebar state" },
    { name: "renameBoard", kind: "method", signature: "renameBoard(boardRoot: string, newName: string)", summary: "Rename a board folder and transfer associated state.", caution: "moves files and changes an open board's path" },
    { name: "list", kind: "method", signature: "list()", summary: "List this machine's local trusted, installed, and open board roots." },
    { name: "searchPublished", kind: "method", signature: "searchPublished(query?: string)", summary: "Search the remote published-board catalog with local install annotations." },
    { name: "getPublishedVersions", kind: "method", signature: "getPublishedVersions(id: string)", summary: "Return remote published version history and compatibility/install flags." },
    { name: "downloadPublished", kind: "method", signature: "downloadPublished(id: string, opts?: { dir?: string; version?: string })", summary: "Download, verify, extract, and record a remote catalog board without trusting it.", caution: "writes an archive's contents to disk" },
    { name: "installPublished", kind: "method", signature: "installPublished(id: string, opts?: { dir?: string; version?: string })", summary: "Start installation from the remote catalog or change an installed version.", caution: "writes board files and may block on board, trust, or close dialogs" },
    { name: "uninstallBoard", kind: "method", signature: "uninstallBoard(id: string)", summary: "Delete an installed remote-catalog board after confirmation.", caution: "removes board files and trust/pin state" },
    { name: "checkPublishedUpdates", kind: "method", signature: "checkPublishedUpdates(force?: boolean)", summary: "Refresh the remote catalog and report compatible updates." },
    { name: "assetsBaseUrl", kind: "property", summary: "Remote recommended-components catalog base URL; readonly." },
    { name: "manifestUrl", kind: "property", summary: "Remote recommended-components catalog manifest URL; readonly." },
];

function boardChildren(): IAiChild[] {
    return getCurrentBoardListings().map((board, index) => {
        const install = board.installed;
        const update = install?.updateAvailable === undefined
            ? "update unknown"
            : install.updateAvailable ? "update available" : "current";
        const installSummary = install
            ? `installed ${install.id}@${install.version}, ${update}`
            : "not installed";
        const openSummary = `${board.openPageIds.length} open page${board.openPageIds.length === 1 ? "" : "s"}`;
        return {
            segment: `[${index}]`,
            kind: "Board",
            summary: `${board.root} (${board.trusted ? "trusted" : "untrusted"}; ${installSummary}; ${openSummary})`,
        };
    });
}

export function describeBoards(_instance: unknown): IAiVisionDescriptor {
    return {
        kind: "Boards",
        summary: "Local board inventory and lifecycle; published-catalog members read remote data.",
        members: BOARDS_MEMBERS,
        children: boardChildren,
        index: (key) => typeof key === "number" ? getCurrentBoardListingAt(key) : undefined,
        provide: (name) => {
            if (name === "assetsBaseUrl") return { value: BOARDS_ASSETS_BASE_URL };
            if (name === "manifestUrl") return { value: BOARDS_MANIFEST_URL };
            return undefined;
        },
        help: "Call boards.list() for this machine's trusted/installed/open local roots, take a returned root, then call boards.openBoard(root). Use boards.searchPublished() only for the remote published catalog; listing reports trust but never grants it, and boards.registerBoard(root) remains the only trust path through the existing user dialog.",
        summarize: () => ({ kind: "Boards", boardCount: getCurrentBoardListings().length }),
    };
}
