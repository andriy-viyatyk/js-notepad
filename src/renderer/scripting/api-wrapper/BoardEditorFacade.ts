import type {
    BoardRenderState,
    IBoardEditor,
    IBoardManifest,
    IBoardReloadResult,
    IBoardSecondaryView,
} from "../../api/types/board-editor";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import { BOARD_CDP_TAB } from "../../../ipc/api-types";
import type { BoardEditorModel } from "../../editors/board/BoardEditorModel";
import { boardTrust } from "../../api/board-trust";
import { boardSecondaryPanelId } from "../../editors/board/board-secondary";
import type { BoardManifest, SecondaryViewDecl } from "../../editors/board/board-manifest";

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

This surface does not add snapshot, click, type, or any other content interaction inside the board's
cross-origin iframe. Those operations belong to the EPIC-089 automation surface. board_refresh remains
the legacy handler until the later EPIC-088 acceptance task verifies this facade live.`;

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
            summary: "Model-backed board chrome, trust, metadata, status, panels, and reload facade.",
            members: [...BOARD_MEMBERS, ...elements.members],
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
