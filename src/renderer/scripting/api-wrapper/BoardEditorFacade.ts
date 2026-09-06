import type {
    BoardRenderState,
    IBoardEditor,
    IBoardManifest,
    IBoardReloadResult,
    IBoardSecondaryView,
} from "../../api/types/board-editor";
import type {
    IBrowserElementLocator,
    IBrowserNetworkRequest,
    IBrowserScreenshot,
    IBrowserTab,
} from "../../api/types/browser-editor";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import { BOARD_CDP_TAB } from "../../../ipc/api-types";
import type { BoardEditorModel } from "../../editors/board/BoardEditorModel";
import type { ITargetTab } from "../../automation/types";
import {
    clickElement,
    ensureTargetReady,
    evaluateInTarget,
    hoverElement,
    networkRequests,
    pressKeyOnTarget,
    resolveElementLocator,
    selectOption,
    takeScreenshot,
    snapshot,
    typeTextInto,
    waitFor,
} from "../../automation/operations";
import type { WaitMode } from "../../automation/operations";
import { boardTrust } from "../../api/board-trust";
import { boardSecondaryPanelId } from "../../editors/board/board-secondary";
import type { BoardManifest, SecondaryViewDecl } from "../../editors/board/board-manifest";
import { BROWSER_AUTOMATION_MEMBERS } from "../ai-vision/browser-automation-members";

const BOARD_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "board-toolbar-explorer", purpose: "Locate the toolbar control that toggles the board's Explorer navigator." },
    { name: "board-toolbar-reload", purpose: "Locate the toolbar Reload board control; the facade action is reload()." },
    { name: "board-toolbar-log", purpose: "Locate the control that opens the board's ui.log." },
    { name: "board-toolbar-properties", purpose: "Locate the control that opens Board Info/properties." },
    { name: "board-trust", purpose: "Locate the Trust board action in the untrusted placeholder." },
];

const BOARD_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete board editor id: board-view or board-editor:<root>." },
    { name: "name", kind: "property", summary: "The board editor's registry display name." },
    { name: "boardRoot", kind: "property", summary: "The board root path, or undefined before a board root is attached." },
    { name: "boardName", kind: "property", summary: "The resolved board folder name, or undefined when the board is not found." },
    { name: "renderState", kind: "property", summary: "Model-backed trusted, untrusted, or not-found state." },
    { name: "getManifest", kind: "method", signature: "getManifest(): Promise<IBoardManifest | undefined>", summary: "Read a copied board manifest snapshot, or undefined when it is absent or malformed." },
    { name: "secondaryViews", kind: "property", summary: "Copied declared board-secondary panel records, or undefined when the board is unresolved." },
    { name: "statusText", kind: "property", summary: "The model-backed board status text, or undefined when cleared or unresolved." },
    { name: "busy", kind: "property", summary: "The model-backed busy flag, or undefined when the board is unresolved." },
    { name: "frameReady", kind: "property", summary: "Whether the mounted main board frame is registered and ready." },
    { name: "contentHostError", kind: "property", summary: "The trusted content-host restore error, when present." },
    { name: "reload", kind: "method", signature: "reload(): Promise<IBoardReloadResult>", summary: "Reload the board and report whether its main frame became ready." },
];

const BOARD_AUTOMATION_TAB_MEMBERS: readonly IAiMember[] = [
    { name: "tabs", kind: "property", summary: "List the board's main frame and declared secondary-view frames." },
    { name: "activeTab", kind: "property", summary: "The selected board frame, or undefined when no frame is active." },
    { name: "switchTab", kind: "method", signature: "switchTab(tabId: string): Promise<void>", summary: "Select the main frame or a declared board-secondary:<viewId> frame and wait until it is attachable." },
];

const BOARD_HELP = `Access via pages[i].editor after narrowing editor.id to "board-view" or
"board-editor:<root>". This facade describes board chrome, trust state, manifest metadata, reload,
statusText, busy state, and declared secondary panels. It does not accept or return a trust decision:
untrusted content remains restricted until the user answers the Trust-this-Board dialog, shown as
"Trust this board?". The live dialog is dialogs[0]; its implementation is
src/renderer/ui/dialogs/TrustBoardDialog.ts and its scripting adapter is
src/renderer/scripting/ai-vision/dialogs/trust-board.ts. restricted() returns text only while
renderState is "untrusted"; trusted and not-found boards are unrestricted, and not-found means an
unavailable or empty board rather than a privacy boundary.

getManifest() returns copied known metadata and never exposes the parsed manifest object.
secondaryViews contains copied board-secondary:* declarations and current expansion state; sidebar
expansion and closure belong to page.panels. statusText, busy, renderState, contentHostError, and
frameReady are model-backed and never read from the footer or board iframe. reload() uses the shared
model waiter and returns frameReady: false when a trusted frame times out or is disposed; untrusted
and not-found boards return immediately with frameReady: false.

Board content is rendered in a cross-origin iframe, and the shared automation members reach that
content. Use snapshot() for the iframe's complete accessibility content and pass its returned refs
as { ref: "..." }; plain strings are always CSS selectors. The board page's own chrome--toolbar
controls, the Trust-this-Board prompt, and secondary-view controls--is what elements names and
highlight points at, not iframe content. Everything rendered inside the iframe is reachable only
through snapshot() and its returned refs and never appears in elements; a board control absent from
a snapshot belongs in elements, while iframe content absent from elements belongs in snapshot().

tabs contains the main frame and declared board-secondary:<viewId> frames. Call switchTab(tabId)
before driving a secondary view and wait for it to complete. Navigation and creating or closing
tabs are not supported and are absent from this member list. Untrusted content remains restricted
by the existing Trust-this-Board gate; trusted and not-found render states differ, and not-found
is not a privacy grant. screenshot() returns the existing metadata-plus-image call result when
available. As verified live by US-1335, snapshots contain no password or plain-text input values;
evaluate() and existing value reads remain capable of exposing page data.`;

export class BoardEditorFacade implements IAiVisible, IBoardEditor {
    constructor(
        private readonly editor: BoardEditorModel,
        readonly id: "board-view" | `board-editor:${string}`,
        readonly name: string,
    ) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(BOARD_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
            highlightOptions: { all: true },
        });
        return {
            kind: "BoardEditor",
            summary: "Board chrome, trust, metadata, frame automation, panels, and reload facade.",
            members: [
                ...BROWSER_AUTOMATION_MEMBERS,
                ...BOARD_AUTOMATION_TAB_MEMBERS,
                ...BOARD_MEMBERS,
                ...elements.members,
            ],
            help: BOARD_HELP,
            elements: BOARD_ELEMENTS,
            provide: elements.provide,
            restricted: () => this.restricted(),
            summarize: () => ({
                kind: "BoardEditor",
                id: this.id,
                name: this.name,
                ...(this.boardRoot !== undefined ? { boardRoot: this.boardRoot } : {}),
                ...(this.boardName !== undefined ? { boardName: this.boardName } : {}),
                renderState: this.renderState,
                ...(this.frameReady !== undefined ? { frameReady: this.frameReady } : {}),
                ...(this.busy !== undefined ? { busy: this.busy } : {}),
                ...(this.statusText !== undefined ? { statusText: this.statusText } : {}),
            }),
        };
    }

    /** List the board's main frame and declared secondary-view frames without attaching to CDP. */
    get tabs(): IBrowserTab[] {
        return this.editor.target.tabs.map(toBrowserTab);
    }

    /** Read the selected board frame without attaching to CDP. */
    get activeTab(): IBrowserTab | undefined {
        const tab = this.editor.target.activeTab;
        return tab ? toBrowserTab(tab) : undefined;
    }

    /** Build an accessibility snapshot for the selected or explicitly requested board frame. */
    async snapshot(options?: TabOption): Promise<string> {
        await ensureTargetReady(this.editor.target, options?.tabId);
        return snapshot(this.editor.target, options?.tabId, { overlayHint: true });
    }

    /** Click a board element by CSS selector or explicit snapshot ref. */
    async click(locator: IBrowserElementLocator, options?: TabOption): Promise<void> {
        await ensureTargetReady(this.editor.target, options?.tabId);
        await clickElement(this.editor.target, resolveElementLocator(locator), options?.tabId);
    }

    /** Hover a board element by CSS selector or explicit snapshot ref. */
    async hover(locator: IBrowserElementLocator, options?: TabOption): Promise<void> {
        await ensureTargetReady(this.editor.target, options?.tabId);
        await hoverElement(this.editor.target, resolveElementLocator(locator), options?.tabId);
    }

    /** Type into a board input by CSS selector or explicit snapshot ref. */
    async type(locator: IBrowserElementLocator, text: string, options?: TypeOption): Promise<void> {
        await ensureTargetReady(this.editor.target, options?.tabId);
        await typeTextInto(this.editor.target, resolveElementLocator(locator), text, {
            tabId: options?.tabId,
            slowly: options?.slowly,
            submit: options?.submit,
        });
    }

    /** Select a board option by CSS selector or explicit snapshot ref. */
    async select(locator: IBrowserElementLocator, values: string | string[], options?: TabOption): Promise<void> {
        await ensureTargetReady(this.editor.target, options?.tabId);
        await selectOption(this.editor.target, resolveElementLocator(locator), values, options?.tabId);
    }

    /** Press a key or compound key in the selected board frame. */
    async pressKey(key: string, options?: TabOption): Promise<void> {
        await ensureTargetReady(this.editor.target, options?.tabId);
        await pressKeyOnTarget(this.editor.target, key, options?.tabId);
    }

    /** Evaluate JavaScript in the selected or explicitly requested board frame. */
    async evaluate(expression: string, options?: TabOption): Promise<unknown> {
        await ensureTargetReady(this.editor.target, options?.tabId);
        return evaluateInTarget(this.editor.target, expression, options?.tabId);
    }

    /** Wait for exactly one selector, text, textGone, or time condition in a board frame. */
    async waitFor(options: WaitForOption): Promise<void> {
        const modes = [options.selector, options.text, options.textGone, options.time]
            .filter(value => value !== undefined);
        if (modes.length !== 1) {
            throw new Error("Expected exactly one of 'selector', 'text', 'textGone', or 'time'.");
        }
        let mode: WaitMode;
        if (options.time !== undefined) {
            mode = { kind: "time", seconds: options.time };
        } else if (options.selector !== undefined) {
            mode = { kind: "selector", selector: options.selector };
        } else if (options.text !== undefined) {
            mode = { kind: "text", text: options.text };
        } else {
            mode = { kind: "textGone", text: options.textGone! };
        }
        await ensureTargetReady(this.editor.target, options.tabId);
        await waitFor(this.editor.target, { mode, timeout: options.timeout, tabId: options.tabId });
    }

    /** Capture the selected board frame as PNG, or undefined when its session is unavailable. */
    async screenshot(options?: TabOption): Promise<IBrowserScreenshot | undefined> {
        await ensureTargetReady(this.editor.target, options?.tabId);
        return takeScreenshot(this.editor.target, options?.tabId, { returnUndefinedIfUnavailable: true });
    }

    /** Read recorded network requests for the selected board frame. */
    async networkRequests(options?: TabOption): Promise<IBrowserNetworkRequest[]> {
        await ensureTargetReady(this.editor.target, options?.tabId);
        return networkRequests(this.editor.target, options?.tabId);
    }

    /** Select a board frame and wait until a secondary frame is attachable. */
    async switchTab(tabId: string): Promise<void> {
        await this.editor.target.switchTab(tabId);
        await ensureTargetReady(this.editor.target, tabId);
    }

    get boardRoot(): string | undefined {
        return this.editor.state.get().boardRoot;
    }

    get boardName(): string | undefined {
        return this.editor.state.get().selectedBoard;
    }

    get renderState(): BoardRenderState {
        const state = this.editor.state.get();
        if (!state.boardRoot || !state.selectedBoard) return "not-found";
        return boardTrust.isTrusted(state.boardRoot) ? "trusted" : "untrusted";
    }

    async getManifest(): Promise<IBoardManifest | undefined> {
        const manifest = await this.editor.readManifestForFacade();
        return manifest ? copyManifest(manifest) : undefined;
    }

    get secondaryViews(): readonly IBoardSecondaryView[] | undefined {
        const state = this.editor.state.get();
        if (!state.boardRoot || !state.selectedBoard) return undefined;
        const page = this.editor.page;
        return (state.secondaryViewDefs ?? []).map((view) => {
            const panelId = boardSecondaryPanelId(view.id);
            return {
                id: view.id,
                panelId,
                ...(view.html !== undefined ? { html: view.html } : {}),
                ...(view.title !== undefined ? { title: view.title } : {}),
                ...(page ? { expanded: page.activePanelId === panelId } : {}),
            };
        });
    }

    get statusText(): string | undefined {
        if (!this.isResolvedBoard()) return undefined;
        return this.editor.state.get().statusText || undefined;
    }

    get busy(): boolean | undefined {
        if (!this.isResolvedBoard()) return undefined;
        return this.editor.state.get().busy ?? false;
    }

    get frameReady(): boolean | undefined {
        if (!this.isResolvedBoard()) return undefined;
        if (!this.editor.getFrame(BOARD_CDP_TAB)) return undefined;
        return this.editor.loadedTabs.has(BOARD_CDP_TAB);
    }

    get contentHostError(): string | undefined {
        return this.renderState === "trusted"
            ? this.editor.state.get().contentHostError
            : undefined;
    }

    reload(): Promise<IBoardReloadResult> {
        const pageId = this.editor.page?.id;
        if (!pageId) throw new Error("Board reload unavailable: no page host attached.");
        const boardRoot = this.boardRoot;
        if (!boardRoot) throw new Error("Board reload unavailable: no board root is attached.");

        const renderState = this.renderState;
        if (renderState !== "trusted") {
            return Promise.resolve({ refreshed: true, pageId, frameReady: false, renderState });
        }
        return this.editor.reloadAndWait().then((frameReady) => ({
            refreshed: true,
            pageId,
            frameReady,
            renderState,
        }));
    }

    private isResolvedBoard(): boolean {
        const state = this.editor.state.get();
        return !!state.boardRoot && !!state.selectedBoard;
    }

    private restricted(): string | undefined {
        return this.renderState === "untrusted"
            ? "This board's content is restricted until the user answers the Trust-this-Board dialog (shown as \"Trust this board?\"). The facade reports trust state but never grants trust or accepts a trust decision."
            : undefined;
    }
}

function copyManifest(manifest: BoardManifest): IBoardManifest | undefined {
    if (typeof manifest.schemaVersion !== "number") return undefined;
    const copy: Partial<MutableBoardManifest> = { schemaVersion: manifest.schemaVersion };
    if (typeof manifest.name === "string") copy.name = manifest.name;
    if (typeof manifest.description === "string") copy.description = manifest.description;
    if (typeof manifest.author === "string") copy.author = manifest.author;
    if (typeof manifest.repository === "string") copy.repository = manifest.repository;
    if (typeof manifest.version === "string") copy.version = manifest.version;
    if (typeof manifest.standalone === "boolean") copy.standalone = manifest.standalone;
    if (typeof manifest.minAppVersion === "string") copy.minAppVersion = manifest.minAppVersion;
    if (Array.isArray(manifest.fileMasks)) copy.fileMasks = manifest.fileMasks.filter(isString);
    if (Array.isArray(manifest.folderMasks)) copy.folderMasks = manifest.folderMasks.filter(isString);
    if (typeof manifest.editorPriority === "number") copy.editorPriority = manifest.editorPriority;
    if (typeof manifest.editorName === "string") copy.editorName = manifest.editorName;
    if (manifest.editorKind === "simple" || manifest.editorKind === "content-host") copy.editorKind = manifest.editorKind;
    if (manifest.editorSources === "local" || manifest.editorSources === "any") copy.editorSources = manifest.editorSources;
    if (Array.isArray(manifest.secondaryViews)) {
        copy.secondaryViews = manifest.secondaryViews
            .filter((view): view is SecondaryViewDecl => !!view && typeof view.id === "string")
            .map((view) => ({
                id: view.id,
                ...(typeof view.html === "string" ? { html: view.html } : {}),
                ...(typeof view.title === "string" ? { title: view.title } : {}),
            }));
    }
    return copy as IBoardManifest;
}

type MutableBoardManifest = {
    -readonly [Key in keyof IBoardManifest]: IBoardManifest[Key];
};

function isString(value: unknown): value is string {
    return typeof value === "string";
}

interface TabOption {
    tabId?: string;
}

interface TypeOption extends TabOption {
    slowly?: boolean;
    submit?: boolean;
}

interface WaitForOption extends TabOption {
    selector?: string;
    text?: string;
    textGone?: string;
    time?: number;
    timeout?: number;
}

function toBrowserTab(tab: ITargetTab): IBrowserTab {
    return {
        id: tab.id,
        ...(tab.url ? { url: tab.url } : {}),
        ...(tab.title ? { title: tab.title } : {}),
        loading: tab.loading,
        active: tab.active,
    };
}
