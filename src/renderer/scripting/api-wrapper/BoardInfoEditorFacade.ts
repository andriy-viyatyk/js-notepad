import type {
    BoardInfoInstallState,
    IBoardInfoCatalogMatch,
    IBoardInfoEditor,
    IBoardInfoProperties,
    IBoardInfoVersion,
} from "../../api/types/board-info-editor";
import type { BoardInfoEditorModel } from "../../editors/board-info/BoardInfoEditorModel";
import { boardInstallRegistry } from "../../api/board-install-registry";
import { boardTrust } from "../../api/board-trust";
import { publishedBoards } from "../../api/published-boards";
import { ui } from "../../api/ui";
import { compareVersions } from "../../../shared/version-utils";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const BOARD_INFO_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "board-info-browse", purpose: "Locate the install-location folder picker." },
    { name: "board-info-download", purpose: "Locate all matching catalog Download controls." },
    { name: "board-info-cancel", purpose: "Locate the active archive download's Cancel control." },
    { name: "board-info-retry", purpose: "Locate a failed catalog download's Retry control." },
    { name: "board-info-register", purpose: "Locate the downloaded board Register board control." },
    { name: "board-info-delete", purpose: "Locate Delete download for an unregistered archive." },
    { name: "board-info-open", purpose: "Locate Open board in properties mode." },
    { name: "board-info-uninstall", purpose: "Locate the catalog-install Uninstall control." },
    { name: "board-info-unregister", purpose: "Locate the local-board Unregister control." },
    { name: "board-info-versions-retry", purpose: "Locate Retry when published version history failed." },
    { name: "board-info-version-install", purpose: "Locate repeated Update/Install version controls for update or rollback." },
];

const BOARD_INFO_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete editor id: board-info." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "mode", kind: "property", summary: "Model-backed install or properties mode." },
    { name: "matches", kind: "property", summary: "Fresh catalog match snapshots with install, download, and trust status." },
    { name: "installDir", kind: "property", summary: "The selected parent directory for catalog downloads, or undefined before it is established." },
    { name: "properties", kind: "property", summary: "A copied installed-board properties snapshot, or undefined outside properties mode." },
    { name: "versions", kind: "property", summary: "Copied published version snapshots, undefined until history loads successfully." },
    { name: "versionsState", kind: "property", summary: "Published-version loading state, or undefined when version history does not apply." },
    { name: "changeInstallDir", kind: "method", signature: "changeInstallDir(): Promise<void>", summary: "Open the native install-location folder picker and retain its selected directory." },
    { name: "cancelDownload", kind: "method", signature: "cancelDownload(catalogId: string): void", summary: "Cancel the model-owned archive download after validating its current catalog id." },
];

const BOARD_INFO_HELP = `Access via pages[i].editor after narrowing editor.id to "board-info".
This model-backed facade reports the Board Info install/properties surface and its eleven curated
page-scoped controls. mode is "install" until the model has state.boardRoot, then "properties";
the facade never reads BoardInfoEditorView, page text, or the DOM to calculate state.

matches, properties, and versions are fresh snapshots. matches includes catalog metadata, archive
size, and the visible available/downloading/error/downloaded/registered state, but never archive
URLs, hashes, or live model objects. properties recalculates trusted from the app trust registry.
versions is undefined until a catalog history succeeds, and [] means a successful empty history;
versionsState is undefined when catalog history does not apply. installDir is the selected download
parent and changeInstallDir() delegates to the native folder picker. cancelDownload(catalogId)
delegates to the model's private board-install cancellation path and rejects ids not in current
matches; a valid id without an active download remains idempotent.

The screen's lifecycle actions remain on boards.*: use boards.downloadPublished(match.id, { dir:
installDir }) to download, boards.registerBoard(properties.root) to register, and
boards.openBoard(properties.root) to open. Use boards.getPublishedVersions(properties.catalogId)
for a read-only refresh, boards.checkPublishedUpdates() followed by
boards.installPublished(properties.catalogId, { version }) for update or rollback,
boards.uninstallBoard(properties.catalogId) for catalog uninstall/delete, and
boards.unregisterBoard(properties.root) for local unregister. The visible
board-info-version-install controls only locate Update/Install buttons; this facade adds no
update, rollback, installBoardVersion, download, register, uninstall, unregister, deleteDownload,
or openBoard member.

Downloading is inert and untrusted. Registration is the only trust-granting step and remains the
user click through "Trust this board?"; no facade method accepts or returns a trust decision, calls
boardTrust.trust(), or bypasses that dialog. The separate environment-variable namespace collision
confirmation follows the trust prompt. All renderer dialog answers are made through the live
dialogs[0] adapter: this includes Trust this board?, the namespace-collision dialog, and generic
confirmations titled "Folder already exists", "Remove board", "Delete board", and "Board is open".
Trust this board? is implemented by src/renderer/ui/dialogs/TrustBoardDialog.ts and answered by
src/renderer/scripting/ai-vision/dialogs/trust-board.ts; the namespace-collision dialog uses the
NamespaceCollisionDialog adapter at src/renderer/scripting/ai-vision/dialogs/namespace-collision.ts;
and those generic confirmations use src/renderer/scripting/ai-vision/dialogs/confirmation.ts. The
install-location picker from fs.showFolderDialog() is native and is not a dialogs[0] entry; progress
displays are not trust decisions.

pages[i].content already returns the adopted file host's text, or "" without a host; this facade
adds no content or host getter. Board variables remain a separate credential surface:
app.boardVars.get() and the board-side persephone.var.get path already return values, list() returns
names, and this facade adds no value, setter, .env, or password path. Existing boards.* members
remain the lifecycle action paths; this facade only owns the folder picker and download cancellation.`;

export class BoardInfoEditorFacade implements IAiVisible, IBoardInfoEditor {
    constructor(
        private readonly editor: BoardInfoEditorModel,
        readonly id: "board-info",
        readonly name: string,
    ) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(BOARD_INFO_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
            highlightOptions: { all: true },
        });
        return {
            kind: "BoardInfoEditor",
            summary: "Model-backed Board Info catalog, install, properties, and version facade.",
            members: [...BOARD_INFO_MEMBERS, ...elements.members],
            help: BOARD_INFO_HELP,
            elements: BOARD_INFO_ELEMENTS,
            provide: elements.provide,
            summarize: () => this.aiSummary(),
        };
    }

    get mode(): "install" | "properties" {
        return this.editor.mode;
    }

    get matches(): readonly IBoardInfoCatalogMatch[] {
        const state = this.editor.state.get();
        const installed = boardInstallRegistry.listInstalled();
        return state.matches.map((entry) => this.copyMatch(entry, state.installUi[entry.id], installed));
    }

    get installDir(): string | undefined {
        return this.editor.state.get().installDir;
    }

    get properties(): IBoardInfoProperties | undefined {
        const properties = this.editor.state.get().props;
        if (!properties) return undefined;

        return {
            name: properties.name,
            ...(properties.description !== undefined ? { description: properties.description } : {}),
            ...(properties.author !== undefined ? { author: properties.author } : {}),
            ...(properties.repository !== undefined ? { repository: properties.repository } : {}),
            ...(properties.manifestVersion !== undefined ? { manifestVersion: properties.manifestVersion } : {}),
            ...(properties.fileMasks !== undefined ? { fileMasks: [...properties.fileMasks] } : {}),
            ...(properties.folderMasks !== undefined ? { folderMasks: [...properties.folderMasks] } : {}),
            ...(properties.editorName !== undefined ? { editorName: properties.editorName } : {}),
            ...(properties.editorKind !== undefined ? { editorKind: properties.editorKind } : {}),
            root: properties.root,
            trusted: properties.missing ? false : boardTrust.isTrusted(properties.root),
            isCatalogInstall: properties.isCatalogInstall,
            ...(properties.catalogId !== undefined ? { catalogId: properties.catalogId } : {}),
            ...(properties.installedVersion !== undefined ? { installedVersion: properties.installedVersion } : {}),
            ...(properties.missing !== undefined ? { missing: properties.missing } : {}),
        };
    }

    get versions(): readonly IBoardInfoVersion[] | undefined {
        const state = this.editor.state.get();
        if (!state.versions) return undefined;
        const installedVersion = state.props?.installedVersion;
        return state.versions.map((version) => ({
            version: version.version,
            ...(version.date !== undefined ? { date: version.date } : {}),
            ...(version.notes !== undefined ? { notes: version.notes } : {}),
            ...(version.minAppVersion !== undefined ? { minAppVersion: version.minAppVersion } : {}),
            compatible: publishedBoards.isCompatible(version.minAppVersion),
            installed: installedVersion !== undefined
                && compareVersions(installedVersion, version.version) === 0,
        }));
    }

    get versionsState(): "idle" | "loading" | "error" | undefined {
        return this.editor.state.get().versionsState;
    }

    changeInstallDir(): Promise<void> {
        return this.editor.changeInstallDir();
    }

    cancelDownload(catalogId: string): void {
        const matches = this.editor.state.get().matches;
        const entry = matches.find((match) => match.id === catalogId);
        if (!entry) {
            const validIds = matches.map((match) => match.id).join(", ") || "(none)";
            throw new Error(
                `Unknown Board Info catalog id ${JSON.stringify(catalogId)}. Valid ids: ${validIds}.`,
            );
        }
        this.editor.cancelDownload(entry);
    }

    private copyMatch(
        entry: {
            id: string;
            version: string;
            name: string;
            description?: string;
            fileMasks?: string[];
            folderMasks?: string[];
            editorName?: string;
            editorKind?: "simple" | "content-host";
            standalone?: boolean;
            minAppVersion?: string;
            screenshotUrl?: string;
            archive: { size: number };
        },
        installUi: { phase: "downloading" | "error"; received?: number; total?: number; error?: string } | undefined,
        installed: readonly { id: string; root: string }[],
    ): IBoardInfoCatalogMatch {
        const installedEntry = installed.find((candidate) => candidate.id === entry.id);
        let installState: BoardInfoInstallState = "available";
        let root: string | undefined;
        if (installUi?.phase === "downloading") {
            installState = "downloading";
        } else if (installedEntry) {
            root = installedEntry.root;
            installState = boardTrust.isTrusted(root) ? "registered" : "downloaded";
        } else if (installUi?.phase === "error") {
            installState = "error";
        }

        return {
            id: entry.id,
            version: entry.version,
            name: entry.name,
            ...(entry.description !== undefined ? { description: entry.description } : {}),
            ...(entry.fileMasks !== undefined ? { fileMasks: [...entry.fileMasks] } : {}),
            ...(entry.folderMasks !== undefined ? { folderMasks: [...entry.folderMasks] } : {}),
            ...(entry.editorName !== undefined ? { editorName: entry.editorName } : {}),
            ...(entry.editorKind !== undefined ? { editorKind: entry.editorKind } : {}),
            ...(entry.standalone !== undefined ? { standalone: entry.standalone } : {}),
            ...(entry.minAppVersion !== undefined ? { minAppVersion: entry.minAppVersion } : {}),
            ...(entry.screenshotUrl !== undefined ? { screenshotUrl: entry.screenshotUrl } : {}),
            size: entry.archive.size,
            installState,
            ...(root !== undefined ? { root } : {}),
            ...(installUi?.received !== undefined ? { received: installUi.received } : {}),
            ...(installUi?.total !== undefined ? { total: installUi.total } : {}),
            ...(installUi?.error !== undefined ? { error: installUi.error } : {}),
        };
    }

    private aiSummary(): Record<string, unknown> {
        const state = this.editor.state.get();
        const summary: Record<string, unknown> = {
            kind: "BoardInfoEditor",
            id: this.id,
            name: this.name,
            mode: this.mode,
            matchCount: state.matches.length,
            propertiesPresent: state.props !== undefined,
        };
        if (state.installDir !== undefined) summary.installDir = state.installDir;
        if (state.versionsState !== undefined) summary.versionsState = state.versionsState;
        return summary;
    }
}
