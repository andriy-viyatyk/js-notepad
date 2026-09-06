import type {
    IMnemeConfigEditor,
    IMnemeModelDownload,
    IMnemeModelFile,
    IMnemeModelStatus,
    IMnemeReindexProgress,
    IMnemeRootConfig,
    IMnemeRootStatus,
} from "../../api/types/mneme-config-editor";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import type { MnemeConfigEditorModel } from "../../editors/mneme-config/MnemeConfigEditorModel";
import type {
    WikiModelDownload,
    WikiModelFile,
    WikiModelStatus,
    WikiReindexProgress,
    WikiRootConfig,
    WikiRootStatus,
} from "../../editors/mneme-config/mnemeTypes";

const MNEME_CONFIG_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "mneme-start", purpose: "Locate the visible control that starts the stopped Mneme service." },
    { name: "mneme-open-settings", purpose: "Locate the visible control that opens Mneme settings." },
    { name: "mneme-open-mcp-inspector", purpose: "Locate the visible control that opens the Mneme MCP Inspector." },
    { name: "mneme-open-log", purpose: "Locate the visible control that opens the Mneme sidecar log." },
    { name: "mneme-restart", purpose: "Locate the visible control that restarts the Mneme service." },
    { name: "mneme-add-root", purpose: "Locate the visible user-driven add-root workflow." },
    { name: "mneme-reindex-all", purpose: "Locate the visible all-roots Mneme reindex control." },
    { name: "mneme-update-model", purpose: "Locate the visible embedding-model update control." },
];

const MNEME_CONFIG_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id: mneme-config." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "running", kind: "property", summary: "Whether the Mneme sidecar is reported running." },
    { name: "url", kind: "property", summary: "The current credential-free Mneme endpoint, or undefined when unavailable." },
    { name: "connectionStatus", kind: "property", summary: "The shared Mneme MCP connection status." },
    { name: "errorMessage", kind: "property", summary: "The current connection error, or undefined when there is none." },
    { name: "roots", kind: "property", summary: "Copied registered root status records, or undefined before status is fetched." },
    { name: "model", kind: "property", summary: "Copied embedding-model status, or undefined before status or without a model." },
    { name: "modelReady", kind: "property", summary: "Whether the fetched embedding model is ready, or undefined before status is fetched." },
    { name: "reindexProgress", kind: "property", summary: "Copied active reindex progress, or an empty map after status is fetched." },
    { name: "rootConfigs", kind: "property", summary: "Copied loaded root include/ignore configurations, or an empty map after status is fetched." },
    { name: "refreshing", kind: "property", summary: "Whether a visible status refresh is in progress." },
    { name: "refresh", kind: "method", signature: "refresh(): Promise<void>", summary: "Refresh the Mneme status snapshot." },
    { name: "restart", kind: "method", signature: "restart(): Promise<void>", summary: "Restart the Mneme sidecar and reconnect.", caution: "disrupts the Mneme service and its active connection" },
    { name: "removeRoot", kind: "method", signature: "removeRoot(root: string): Promise<void>", summary: "Remove a registered Mneme root after the existing confirmation.", caution: "removes the registered root and its derived Mneme index" },
    { name: "reindex", kind: "method", signature: "reindex(root?: string): Promise<void>", summary: "Rebuild one root's or all roots' derived indexes.", caution: "starts an expensive indexing operation" },
    { name: "getRootConfig", kind: "method", signature: "getRootConfig(root: string): Promise<void>", summary: "Load one root's include/ignore configuration." },
    { name: "setRootConfig", kind: "method", signature: "setRootConfig(root: string, include: string[], ignore: string[]): Promise<void>", summary: "Write one root's include/ignore configuration.", caution: "writes root configuration and triggers indexing" },
    { name: "updateModel", kind: "method", signature: "updateModel(): Promise<void>", summary: "Request the configured embedding-model cache update.", caution: "downloads and writes the local model cache" },
];

const MNEME_CONFIG_HELP = `Access via pages[i].editor after narrowing editor.id to "mneme-config".
This page-scoped facade exposes Mneme configuration, connection/service status, root status,
root filters already loaded by the model, reindex progress, and embedding-model status. It is a
configuration and browsing surface, not a knowledge-base or filesystem API. Document contents and
document operations belong to the Mneme MCP server.

url and errorMessage map empty model strings to undefined. roots, model, modelReady, reindexProgress,
and rootConfigs are absent until a status snapshot exists; genuine empty arrays and maps remain []
and {}. Nested records are copied, and absent optional fields are omitted rather than returned as
undefined. No facade member accepts or returns a credential; transport.token is intentionally not
available.

refresh delegates to the editor model. restart, removeRoot, reindex, setRootConfig, and updateModel
are cautioned because they disrupt the service, remove derived data, perform expensive indexing,
write root configuration, or download/write the model cache. removeRoot keeps the model's existing
confirmation. mneme-start, mneme-open-settings, mneme-add-root, mneme-open-log, and
mneme-open-mcp-inspector are element locations; add-root remains a native folder picker plus input
dialog and is not a facade method. The Mneme tree remains page.panels["mneme-tree"], and document
reading/writing/deletion remains the Mneme MCP responsibility.`;

export class MnemeConfigEditorFacade implements IAiVisible, IMnemeConfigEditor {
    constructor(
        private readonly editor: MnemeConfigEditorModel,
        readonly id: "mneme-config",
        readonly name: string,
    ) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(MNEME_CONFIG_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
            highlightOptions: { all: true },
        });
        return {
            kind: "MnemeConfigEditor",
            summary: "Model-backed Mneme configuration and service-status facade.",
            members: [...MNEME_CONFIG_MEMBERS, ...elements.members],
            help: MNEME_CONFIG_HELP,
            elements: MNEME_CONFIG_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "MnemeConfigEditor",
                id: this.id,
                name: this.name,
                running: this.running,
                connectionStatus: this.connectionStatus,
                ...(this.url !== undefined ? { url: this.url } : {}),
                ...(this.errorMessage !== undefined ? { errorMessage: this.errorMessage } : {}),
                refreshing: this.refreshing,
            }),
        };
    }

    get running(): boolean { return this.editor.state.get().running; }

    get url(): string | undefined { return this.editor.state.get().url || undefined; }

    get connectionStatus() { return this.editor.state.get().connectionStatus; }

    get errorMessage(): string | undefined { return this.editor.state.get().errorMessage || undefined; }

    get roots(): readonly IMnemeRootStatus[] | undefined {
        const status = this.editor.state.get().status;
        return status ? status.roots.map(copyRootStatus) : undefined;
    }

    get model(): IMnemeModelStatus | undefined {
        const model = this.editor.state.get().status?.model;
        return model ? copyModelStatus(model) : undefined;
    }

    get modelReady(): boolean | undefined {
        return this.editor.state.get().status ? this.editor.modelReady : undefined;
    }

    get reindexProgress(): Readonly<Record<string, IMnemeReindexProgress>> | undefined {
        const state = this.editor.state.get();
        return state.status ? copyProgressMap(state.reindexProgress) : undefined;
    }

    get rootConfigs(): Readonly<Record<string, IMnemeRootConfig>> | undefined {
        const state = this.editor.state.get();
        return state.status ? copyConfigMap(state.rootConfigs) : undefined;
    }

    get refreshing(): boolean { return this.editor.state.get().refreshing; }

    refresh(): Promise<void> { return this.editor.refreshStatus(); }

    restart(): Promise<void> { return this.editor.restartMneme(); }

    removeRoot(root: string): Promise<void> { return this.editor.removeRoot(root); }

    reindex(root?: string): Promise<void> { return this.editor.reindex(root); }

    getRootConfig(root: string): Promise<void> { return this.editor.getRootConfig(root); }

    setRootConfig(root: string, include: string[], ignore: string[]): Promise<void> {
        return this.editor.setRootConfig(root, include, ignore);
    }

    updateModel(): Promise<void> { return this.editor.updateModel(); }
}

function copyRootStatus(root: WikiRootStatus): IMnemeRootStatus {
    return {
        name: root.name,
        folder: root.folder,
        docCount: root.docCount,
        model: root.model,
        precision: root.precision,
        schemaVer: root.schemaVer,
        indexPath: root.indexPath,
        indexBytes: root.indexBytes,
        ...(root.reindex ? { reindex: copyReindexProgress(root.reindex) } : {}),
    };
}

function copyReindexProgress(progress: WikiReindexProgress): IMnemeReindexProgress {
    return { phase: progress.phase, processed: progress.processed, total: progress.total };
}

function copyModelStatus(model: WikiModelStatus): IMnemeModelStatus {
    return {
        name: model.name,
        precision: model.precision,
        version: model.version,
        dir: model.dir,
        complete: model.complete,
        files: model.files.map(copyModelFile),
        ...(model.download ? { download: copyModelDownload(model.download) } : {}),
    };
}

function copyModelFile(file: WikiModelFile): IMnemeModelFile {
    return { filename: file.filename, present: file.present, verified: file.verified, bytes: file.bytes };
}

function copyModelDownload(download: WikiModelDownload): IMnemeModelDownload {
    return { phase: download.phase, bytesDone: download.bytesDone, bytesTotal: download.bytesTotal };
}

function copyProgressMap(progress: Record<string, WikiReindexProgress>): Readonly<Record<string, IMnemeReindexProgress>> {
    return Object.fromEntries(Object.entries(progress).map(([root, value]) => [root, copyReindexProgress(value)]));
}

function copyConfigMap(configs: Record<string, WikiRootConfig>): Readonly<Record<string, IMnemeRootConfig>> {
    return Object.fromEntries(Object.entries(configs).map(([root, value]) => [root, copyRootConfig(value)]));
}

function copyRootConfig(config: WikiRootConfig): IMnemeRootConfig {
    return {
        name: config.name,
        folder: config.folder,
        include: [...config.include],
        ignore: [...config.ignore],
    };
}
