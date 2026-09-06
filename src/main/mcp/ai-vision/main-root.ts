import { openWindows } from "../../open-windows";
import { windowStates } from "../../window-states";
import { IAiChild, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { MainNode } from "./main-services";

/**
 * The main process's half of the AiVision tree (EPIC-083, US-1290).
 *
 * Everything under a window is renderer knowledge; the `windows` collection is main-process
 * knowledge (`openWindows`, `windowStates`). The `call` tool resolves `windows`, `windows[i]` and a
 * window's own members here with the same shared resolver the renderer uses, and forwards anything
 * deeper — `windows[1].pages[0].content` — to that window's renderer as `pages[0].content`.
 * US-1295 adds the `main` node beside `windows`.
 */

/** Members of one window that the main process answers itself; anything else is forwarded. */
export const WINDOW_MEMBER_NAMES: readonly string[] = ["index", "status", "pageCount", "activePageId", "pages", "open", "focus"];

const WINDOW_MEMBERS: readonly IAiMember[] = [
    { name: "index", kind: "property", summary: "Window index — the value other tools take as windowIndex." },
    { name: "status", kind: "property", summary: "\"open\" or \"closed\" (a closed window keeps its pages and can be reopened)." },
    { name: "pageCount", kind: "property", summary: "Number of pages the window holds (persisted state)." },
    { name: "activePageId", kind: "property", summary: "Id of the window's active page." },
    { name: "pages", kind: "property", summary: "The window's pages. Open window: the live Pages collection (windows[i].pages[0].content works). Closed window: summaries from persisted state (id, title, type, editor, filePath) — open() it to get the live collection. `type` appears only here: a persisted page may have no `editor` recorded, so `type` is the fallback classifier. On an open window use `editor`, which is the actionable one." },
    { name: "open", kind: "method", signature: "open()", summary: "Open (or reopen) this window with its persisted pages, and focus it." },
    { name: "focus", kind: "method", signature: "focus()", summary: "Bring an open window to the front." },
];

const WINDOWS_MEMBERS: readonly IAiMember[] = [
    { name: "count", kind: "property", summary: "Number of windows, open and closed." },
];

const WINDOWS_HELP = `
Persephone can have several windows. windows[i] is one window; its own members (status, open(),
focus(), persisted pages) are answered by the main process. Anything deeper is answered by that
window itself: prefix any path with "windows[i]." — windows[1].pages, windows[1].page.content,
windows[1].helpSearch(...). A path without the prefix targets the main (first open) window.
`;

interface IPersistedPageState {
    title?: string;
    type?: string;
    editor?: string;
    language?: string;
    filePath?: string;
    profileName?: string;
    isIncognito?: boolean;
    isTor?: boolean;
}

export class WindowNode implements IAiVisible {
    constructor(readonly index: number) {}

    private get data() {
        return openWindows.windows.find(w => w.index === this.index);
    }

    get status(): "open" | "closed" | "missing" {
        const data = this.data;
        if (!data) return "missing";
        return data.window ? "open" : "closed";
    }

    get pageCount(): number {
        return windowStates.getState(this.index)?.pages?.length ?? 0;
    }

    get activePageId(): string | undefined {
        return windowStates.getState(this.index)?.activePageId;
    }

    get pages() {
        const pages = windowStates.getState(this.index)?.pages ?? [];
        return pages.map(p => {
            const main = p.editors.find(e => e.id === p.mainEditorId);
            const state = (main?.state ?? {}) as IPersistedPageState;
            return {
                id: p.id,
                title: state.title ?? "Empty",
                type: state.type,
                editor: state.editor,
                language: state.language,
                filePath: state.filePath,
                modified: p.modified,
                pinned: p.pinned,
                // Browser pages: identity only, never the url — the same rule as window descriptors.
                ...(state.editor === "browser-view" ? { profileName: state.profileName ?? "", isIncognito: !!state.isIncognito, isTor: !!state.isTor } : {}),
            };
        });
    }

    async open(): Promise<{ windowIndex: number; status: string }> {
        const data = this.data;
        if (!data) throw new Error(`Window ${this.index} does not exist`);
        if (data.window) {
            data.window.focus();
            return { windowIndex: this.index, status: "open" };
        }
        openWindows.createWindow(this.index);
        if (data.whenReady) await data.whenReady;
        return { windowIndex: this.index, status: "open" };
    }

    focus(): { windowIndex: number; status: string } {
        const data = this.data;
        if (!data?.window) throw new Error(`Window ${this.index} is not open — call windows[${this.index}].open() first.`);
        data.window.focus();
        return { windowIndex: this.index, status: "open" };
    }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "Window",
            summary: "One Persephone window. Prefix a path with windows[i]. to address its pages.",
            members: WINDOW_MEMBERS,
            children: () => this.status === "open"
                ? [{ segment: ".pages", kind: "Pages", summary: `${this.pageCount} page(s) — live, answered by the window` }]
                : [],
            summarize: () => ({ kind: "Window", index: this.index, status: this.status, pageCount: this.pageCount, activePageId: this.activePageId ?? null }),
        };
    }
}

export class WindowsNode implements IAiVisible {
    get count(): number {
        return openWindows.windows.length;
    }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "Windows",
            summary: "All Persephone windows, open and closed.",
            members: WINDOWS_MEMBERS,
            help: WINDOWS_HELP,
            children: () => this.children(),
            index: (key) => {
                const index = typeof key === "number" ? key : Number(key);
                return openWindows.windows.some(w => w.index === index) ? new WindowNode(index) : undefined;
            },
            summarize: () => ({ kind: "Windows", count: this.count, open: openWindows.windows.filter(w => w.window).map(w => w.index) }),
        };
    }

    private children(): IAiChild[] {
        return openWindows.windows.map(w => {
            const node = new WindowNode(w.index);
            const state = windowStates.getState(w.index);
            return {
                segment: `[${w.index}]`,
                kind: "Window",
                summary: `${node.status}, ${state?.pages?.length ?? 0} page(s)`,
            };
        });
    }
}

/** The root the main process resolves against: only what the main process owns. */
export class MainAiRoot implements IAiVisible {
    readonly windows = new WindowsNode();
    readonly main = new MainNode(this.windows);

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "PersephoneMain",
            summary: "Main-process part of the object model.",
            members: [
                { name: "windows", kind: "property", node: true, summary: "All windows; windows[i] addresses one." },
                { name: "main", kind: "property", node: true, summary: "Main-process diagnostics and gated scripting." },
            ],
        };
    }
}
