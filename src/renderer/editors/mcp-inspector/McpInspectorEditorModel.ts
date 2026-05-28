import { createElement, ReactNode } from "react";
import {
    EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/EditorModel";
import type { EditorDescriptor } from "../../../shared/persistence-v4";
import { TComponentState, TOneState } from "../../core/state/state";
import { McpIcon } from "../../theme/icons";
import {
    McpConnectionManager,
    McpConnectionStatus,
    McpTransportType,
} from "./McpConnectionManager";
import { mcpConnectionStore, SavedMcpConnection } from "./McpConnectionStore";
import { pagesModel } from "../../api/pages";
import type { McpRequestEntry } from "../log-view/logTypes";

// ============================================================================
// Types — Tools
// ============================================================================

export interface McpToolInfo {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties?: Record<string, any>;
        required?: string[];
    };
    annotations?: {
        title?: string;
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
    };
}

export interface McpToolResult {
    content: McpToolResultContent[];
    isError?: boolean;
    durationMs: number;
}

export type McpToolResultContent =
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
    | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string } }
    | { type: "resource_link"; uri: string; name: string };

export interface McpToolsPanelState {
    tools: McpToolInfo[];
    selectedToolName: string;
    toolCallLoading: boolean;
    toolResult: McpToolResult | null;
    toolArgs: Record<string, string>;
}

const getDefaultToolsPanelState = (): McpToolsPanelState => ({
    tools: [],
    selectedToolName: "",
    toolCallLoading: false,
    toolResult: null,
    toolArgs: {},
});

// ============================================================================
// Types — Resources
// ============================================================================

export interface McpResourceInfo {
    uri: string;
    name: string;
    description: string;
    mimeType: string;
}

export interface McpResourceTemplateInfo {
    uriTemplate: string;
    name: string;
    description: string;
    mimeType: string;
}

export interface McpResourceContent {
    uri: string;
    mimeType: string;
    text?: string;
    blob?: string;
}

export interface McpResourcesPanelState {
    resources: McpResourceInfo[];
    templates: McpResourceTemplateInfo[];
    selectedUri: string;
    readLoading: boolean;
    readContent: McpResourceContent | null;
    readError: string;
    // Template selection
    selectedTemplateUri: string;
    templateArgs: Record<string, string>;
    templateReadLoading: boolean;
    templateReadContent: McpResourceContent | null;
    templateReadError: string;
}

const getDefaultResourcesPanelState = (): McpResourcesPanelState => ({
    resources: [],
    templates: [],
    selectedUri: "",
    readLoading: false,
    readContent: null,
    readError: "",
    selectedTemplateUri: "",
    templateArgs: {},
    templateReadLoading: false,
    templateReadContent: null,
    templateReadError: "",
});

// ============================================================================
// Types — Prompts
// ============================================================================

export interface McpPromptInfo {
    name: string;
    description: string;
    arguments: McpPromptArgInfo[];
}

export interface McpPromptArgInfo {
    name: string;
    description: string;
    required: boolean;
}

export interface McpPromptMessage {
    role: "user" | "assistant";
    content: McpPromptMessageContent[];
}

export type McpPromptMessageContent =
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
    | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string; blob?: string } }
    | { type: "resource_link"; uri: string; name: string };

export interface McpPromptsPanelState {
    prompts: McpPromptInfo[];
    selectedPromptName: string;
    promptArgs: Record<string, string>;
    getPromptLoading: boolean;
    promptMessages: McpPromptMessage[] | null;
    promptError: string;
}

const getDefaultPromptsPanelState = (): McpPromptsPanelState => ({
    prompts: [],
    selectedPromptName: "",
    promptArgs: {},
    getPromptLoading: false,
    promptMessages: null,
    promptError: "",
});

// ============================================================================
// State — Page
// ============================================================================

export type McpPanelId = "info" | "tools" | "resources" | "prompts" | "history";

export interface McpInspectorEditorState extends EditorStateBase {
    /** State-type discriminator. */
    type: "mcpInspectorPage";

    // Connection config
    url: string;
    transportType: McpTransportType;
    command: string;
    args: string;
    connectionName: string;

    // Connection status
    connectionStatus: McpConnectionStatus;
    errorMessage: string;

    // Server info (populated after connect)
    serverName: string;
    serverTitle: string;
    serverVersion: string;
    serverDescription: string;
    serverWebsiteUrl: string;
    instructions: string;
    hasTools: boolean;
    hasResources: boolean;
    hasPrompts: boolean;

    // UI state
    activePanel: McpPanelId;
}

export const getDefaultMcpInspectorEditorState = (): McpInspectorEditorState => ({
    id: crypto.randomUUID(),
    title: "MCP Inspector",
    modified: false,
    type: "mcpInspectorPage",
    editor: "mcp-view",

    url: "",
    transportType: "http",
    command: "",
    args: "",
    connectionName: "",

    connectionStatus: "disconnected",
    errorMessage: "",

    serverName: "",
    serverTitle: "",
    serverVersion: "",
    serverDescription: "",
    serverWebsiteUrl: "",
    instructions: "",
    hasTools: false,
    hasResources: false,
    hasPrompts: false,

    activePanel: "info",
});

// ============================================================================
// Model
// ============================================================================

export class McpInspectorEditorModel extends EditorModel<McpInspectorEditorState> {
    /** v4 editor identity. Matches the legacy registry id so v4
     *  EditorDescriptor.editorId. */
    readonly editorId = "mcp-view";

    noLanguage = true;
    skipSave = true;

    readonly connection = new McpConnectionManager();
    readonly toolsState = new TOneState<McpToolsPanelState>(getDefaultToolsPanelState());
    readonly resourcesState = new TOneState<McpResourcesPanelState>(getDefaultResourcesPanelState());
    readonly promptsState = new TOneState<McpPromptsPanelState>(getDefaultPromptsPanelState());

    private _history: McpRequestEntry[] = [];

    constructor(state: TComponentState<McpInspectorEditorState>) {
        super(state);
        this.connection.onStatusChange = (status, error) => {
            const info = this.connection.serverInfo;
            this.state.update((s) => {
                s.connectionStatus = status;
                s.errorMessage = error || "";
                if (info) {
                    s.serverName = info.name;
                    s.serverTitle = info.title;
                    s.serverVersion = info.version;
                    s.serverDescription = info.description;
                    s.serverWebsiteUrl = info.websiteUrl;
                    s.instructions = info.instructions;
                    s.hasTools = !!info.capabilities.tools;
                    s.hasResources = !!info.capabilities.resources;
                    s.hasPrompts = !!info.capabilities.prompts;
                } else if (status === "disconnected" || status === "error") {
                    s.serverName = "";
                    s.serverTitle = "";
                    s.serverVersion = "";
                    s.serverDescription = "";
                    s.serverWebsiteUrl = "";
                    s.instructions = "";
                    s.hasTools = false;
                    s.hasResources = false;
                    s.hasPrompts = false;
                }
            });
            if (status === "connected") {
                this.loadTools();
                this.loadResources();
                this.loadPrompts();
                this.autoSaveConnection();
            } else if (status === "disconnected" || status === "error") {
                this.toolsState.set(getDefaultToolsPanelState());
                this.resourcesState.set(getDefaultResourcesPanelState());
                this.promptsState.set(getDefaultPromptsPanelState());
                this._history = [];
            }
        };
    }

    /** Connect using current state config. */
    connect = async (): Promise<void> => {
        const s = this.state.get();
        await this.connection.connect({
            name: s.connectionName || "MCP Server",
            transport: s.transportType,
            url: s.transportType === "http" ? s.url : undefined,
            command: s.transportType === "stdio" ? s.command : undefined,
            args: s.transportType === "stdio" && s.args
                ? s.args.split(/\s+/).filter(Boolean)
                : undefined,
        });
    };

    /** Disconnect from the current server. */
    disconnect = async (): Promise<void> => {
        await this.connection.disconnect();
    };

    setActivePanel = (panel: McpPanelId): void => {
        this.state.update((s) => { s.activePanel = panel; });
    };

    // -- Connections ----------------------------------------------------------

    /** Auto-save connection config on successful connect. */
    private autoSaveConnection = async (): Promise<void> => {
        const s = this.state.get();
        const name = s.connectionName || s.serverName || s.url || s.command || "MCP Server";
        await mcpConnectionStore.save({
            name,
            transport: s.transportType,
            url: s.url,
            command: s.command,
            args: s.args,
        });
        if (!s.connectionName && name) {
            this.state.update((st) => { st.connectionName = name; });
        }
    };

    /** Fill connection bar fields from a saved connection. */
    fillFromSaved = (conn: SavedMcpConnection): void => {
        this.state.update((s) => {
            s.transportType = conn.transport;
            s.url = conn.url;
            s.command = conn.command;
            s.args = conn.args;
            s.connectionName = conn.name;
        });
    };

    /** Delete a saved connection from the store. */
    deleteSavedConnection = async (id: string): Promise<void> => {
        await mcpConnectionStore.delete(id);
    };

    // -- Tools ----------------------------------------------------------------

    /** Load tools list from connected server. */
    loadTools = async (): Promise<void> => {
        const client = this.connection.getClient();
        if (!client) return;
        const start = Date.now();
        try {
            const result = await client.listTools();
            this.logRequest("tools/list", null, result, null, Date.now() - start);
            const tools: McpToolInfo[] = (result.tools || []).map((t: any) => ({
                name: t.name,
                description: t.description || "",
                inputSchema: t.inputSchema as McpToolInfo["inputSchema"],
                annotations: t.annotations,
            }));
            this.toolsState.update((s) => {
                s.tools = tools;
                s.selectedToolName = tools.length > 0 ? tools[0].name : "";
                s.toolResult = null;
                s.toolArgs = {};
            });
        } catch (err: any) {
            this.logRequest("tools/list", null, null, err?.message || String(err), Date.now() - start);
        }
    };

    /** Select a tool by name. Clears previous args and result. */
    selectTool = (name: string): void => {
        this.toolsState.update((s) => {
            s.selectedToolName = name;
            s.toolResult = null;
            s.toolArgs = {};
        });
    };

    /** Update a single tool argument value. */
    setToolArg = (name: string, value: string): void => {
        this.toolsState.update((s) => {
            s.toolArgs = { ...s.toolArgs, [name]: value };
        });
    };

    /** Call the currently selected tool with entered arguments. */
    callTool = async (): Promise<void> => {
        const client = this.connection.getClient();
        if (!client) return;
        const ts = this.toolsState.get();
        const tool = ts.tools.find((t) => t.name === ts.selectedToolName);
        if (!tool) return;

        // Parse argument strings to proper types based on schema
        const args: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(ts.toolArgs)) {
            if (!value && value !== "false") continue;
            const propSchema = tool.inputSchema.properties?.[key] as any;
            if (propSchema?.type === "number" || propSchema?.type === "integer") {
                args[key] = Number(value);
            } else if (propSchema?.type === "boolean") {
                args[key] = value === "true";
            } else if (propSchema?.type === "object" || propSchema?.type === "array") {
                try { args[key] = JSON.parse(value); } catch { args[key] = value; }
            } else {
                args[key] = value;
            }
        }

        this.toolsState.update((s) => { s.toolCallLoading = true; s.toolResult = null; });
        const startTime = Date.now();
        const callParams = { name: tool.name, arguments: args };
        try {
            const result = await client.callTool(callParams);
            const duration = Date.now() - startTime;
            this.logRequest("tools/call", callParams, result, null, duration);
            this.toolsState.update((s) => {
                s.toolCallLoading = false;
                s.toolResult = {
                    content: (result as any).content || [],
                    isError: (result as any).isError,
                    durationMs: duration,
                };
            });
        } catch (err: any) {
            const duration = Date.now() - startTime;
            this.logRequest("tools/call", callParams, null, err?.message || String(err), duration);
            this.toolsState.update((s) => {
                s.toolCallLoading = false;
                s.toolResult = {
                    content: [{ type: "text", text: err?.message || String(err) }],
                    isError: true,
                    durationMs: duration,
                };
            });
        }
    };

    // -- Resources ------------------------------------------------------------

    /** Load resources and templates from connected server. */
    loadResources = async (): Promise<void> => {
        const client = this.connection.getClient();
        if (!client) return;
        const start = Date.now();
        try {
            const [resResult, tmplResult] = await Promise.all([
                client.listResources().catch(() => ({ resources: [] as any[] })),
                client.listResourceTemplates().catch(() => ({ resourceTemplates: [] as any[] })),
            ]);
            this.logRequest("resources/list", null, { resources: resResult, templates: tmplResult }, null, Date.now() - start);
            const resources: McpResourceInfo[] = (resResult.resources || []).map((r: any) => ({
                uri: r.uri,
                name: r.name || r.uri,
                description: r.description || "",
                mimeType: r.mimeType || "",
            }));
            const templates: McpResourceTemplateInfo[] = (tmplResult.resourceTemplates || []).map((t: any) => ({
                uriTemplate: t.uriTemplate,
                name: t.name || t.uriTemplate,
                description: t.description || "",
                mimeType: t.mimeType || "",
            }));
            this.resourcesState.update((s) => {
                s.resources = resources;
                s.templates = templates;
                s.selectedUri = resources.length > 0 ? resources[0].uri : "";
                s.readContent = null;
                s.readError = "";
            });
        } catch (err: any) {
            this.logRequest("resources/list", null, null, err?.message || String(err), Date.now() - start);
        }
    };

    /** Select a resource by URI. Clears previous content and deselects template. */
    selectResource = (uri: string): void => {
        this.resourcesState.update((s) => {
            s.selectedUri = uri;
            s.readContent = null;
            s.readError = "";
            s.selectedTemplateUri = "";
            s.templateArgs = {};
            s.templateReadContent = null;
            s.templateReadError = "";
        });
    };

    /** Select a resource template. Clears static resource selection. */
    selectTemplate = (uriTemplate: string): void => {
        this.resourcesState.update((s) => {
            s.selectedTemplateUri = uriTemplate;
            s.templateArgs = {};
            s.templateReadContent = null;
            s.templateReadError = "";
            s.selectedUri = "";
            s.readContent = null;
            s.readError = "";
        });
    };

    /** Update a single template argument value. */
    setTemplateArg = (name: string, value: string): void => {
        this.resourcesState.update((s) => {
            s.templateArgs = { ...s.templateArgs, [name]: value };
        });
    };

    /** Read a resource by expanding the selected template with entered arguments. */
    readTemplateResource = async (): Promise<void> => {
        const client = this.connection.getClient();
        if (!client) return;
        const rs = this.resourcesState.get();
        if (!rs.selectedTemplateUri) return;

        const expandedUri = expandUriTemplate(rs.selectedTemplateUri, rs.templateArgs);
        this.resourcesState.update((s) => {
            s.templateReadLoading = true;
            s.templateReadContent = null;
            s.templateReadError = "";
        });
        const readParams = { uri: expandedUri };
        const start = Date.now();
        try {
            const result = await client.readResource(readParams);
            this.logRequest("resources/read", readParams, result, null, Date.now() - start);
            const first = result.contents?.[0] as any;
            if (first) {
                this.resourcesState.update((s) => {
                    s.templateReadLoading = false;
                    s.templateReadContent = {
                        uri: first.uri || expandedUri,
                        mimeType: first.mimeType || "",
                        text: first.text,
                        blob: first.blob,
                    };
                });
            } else {
                this.resourcesState.update((s) => {
                    s.templateReadLoading = false;
                    s.templateReadError = "No content returned.";
                });
            }
        } catch (err: any) {
            this.logRequest("resources/read", readParams, null, err?.message || String(err), Date.now() - start);
            this.resourcesState.update((s) => {
                s.templateReadLoading = false;
                s.templateReadError = err?.message || String(err);
            });
        }
    };

    /** Read the currently selected resource. */
    readResource = async (): Promise<void> => {
        const client = this.connection.getClient();
        if (!client) return;
        const rs = this.resourcesState.get();
        if (!rs.selectedUri) return;

        this.resourcesState.update((s) => { s.readLoading = true; s.readContent = null; s.readError = ""; });
        const readParams = { uri: rs.selectedUri };
        const start = Date.now();
        try {
            const result = await client.readResource(readParams);
            this.logRequest("resources/read", readParams, result, null, Date.now() - start);
            const first = result.contents?.[0] as any;
            if (first) {
                this.resourcesState.update((s) => {
                    s.readLoading = false;
                    s.readContent = {
                        uri: first.uri || rs.selectedUri,
                        mimeType: first.mimeType || "",
                        text: first.text,
                        blob: first.blob,
                    };
                });
            } else {
                this.resourcesState.update((s) => {
                    s.readLoading = false;
                    s.readError = "No content returned.";
                });
            }
        } catch (err: any) {
            this.logRequest("resources/read", readParams, null, err?.message || String(err), Date.now() - start);
            this.resourcesState.update((s) => {
                s.readLoading = false;
                s.readError = err?.message || String(err);
            });
        }
    };

    // -- Prompts --------------------------------------------------------------

    /** Load prompts from connected server. */
    loadPrompts = async (): Promise<void> => {
        const client = this.connection.getClient();
        if (!client) return;
        const start = Date.now();
        try {
            const result = await client.listPrompts();
            this.logRequest("prompts/list", null, result, null, Date.now() - start);
            const prompts: McpPromptInfo[] = (result.prompts || []).map((p: any) => ({
                name: p.name,
                description: p.description || "",
                arguments: (p.arguments || []).map((a: any) => ({
                    name: a.name,
                    description: a.description || "",
                    required: !!a.required,
                })),
            }));
            this.promptsState.update((s) => {
                s.prompts = prompts;
                s.selectedPromptName = prompts.length > 0 ? prompts[0].name : "";
                s.promptArgs = {};
                s.promptMessages = null;
                s.promptError = "";
            });
        } catch (err: any) {
            this.logRequest("prompts/list", null, null, err?.message || String(err), Date.now() - start);
        }
    };

    /** Select a prompt by name. Clears previous args and messages. */
    selectPrompt = (name: string): void => {
        this.promptsState.update((s) => {
            s.selectedPromptName = name;
            s.promptArgs = {};
            s.promptMessages = null;
            s.promptError = "";
        });
    };

    /** Update a single prompt argument value. */
    setPromptArg = (name: string, value: string): void => {
        this.promptsState.update((s) => {
            s.promptArgs = { ...s.promptArgs, [name]: value };
        });
    };

    /** Get the currently selected prompt with entered arguments. */
    getPrompt = async (): Promise<void> => {
        const client = this.connection.getClient();
        if (!client) return;
        const ps = this.promptsState.get();
        const prompt = ps.prompts.find((p) => p.name === ps.selectedPromptName);
        if (!prompt) return;

        const args: Record<string, string> = {};
        for (const [key, value] of Object.entries(ps.promptArgs)) {
            if (value) args[key] = value;
        }

        this.promptsState.update((s) => { s.getPromptLoading = true; s.promptMessages = null; s.promptError = ""; });
        const getParams = { name: prompt.name, arguments: args };
        const start = Date.now();
        try {
            const result = await client.getPrompt(getParams);
            this.logRequest("prompts/get", getParams, result, null, Date.now() - start);
            const messages: McpPromptMessage[] = (result.messages || []).map((m: any) => {
                const contentBlock = m.content;
                // content can be a single block or array
                const contentArray: McpPromptMessageContent[] = Array.isArray(contentBlock)
                    ? contentBlock.map(normalizePromptContent)
                    : [normalizePromptContent(contentBlock)];
                return { role: m.role as "user" | "assistant", content: contentArray };
            });
            this.promptsState.update((s) => {
                s.getPromptLoading = false;
                s.promptMessages = messages;
            });
        } catch (err: any) {
            this.logRequest("prompts/get", getParams, null, err?.message || String(err), Date.now() - start);
            this.promptsState.update((s) => {
                s.getPromptLoading = false;
                s.promptError = err?.message || String(err);
            });
        }
    };

    // -- History --------------------------------------------------------------

    private logRequest(method: string, params: any, result: any, error: string | null, durationMs: number): void {
        this._history.push({
            type: "output.mcp-request",
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            direction: "outgoing",
            method,
            params,
            result,
            error,
            durationMs,
        });
    }

    get historyCount(): number {
        return this._history.length;
    }

    get history(): ReadonlyArray<McpRequestEntry> {
        return this._history;
    }

    /** Open a new one-time log page with all collected history entries. */
    showHistory = async (): Promise<void> => {
        if (this._history.length === 0) return;
        const content = this._history.map((e) => JSON.stringify(e)).join("\n");
        pagesModel.addEditorPage("log-view", "jsonl", "MCP Inspector History", content);
    };

    clearHistory = (): void => {
        this._history = [];
    };

    // -- Lifecycle ------------------------------------------------------------
    // No `restore()` override — the v4 base no-op suffices. MCP must NOT
    // auto-connect on restore (connection is user-initiated).

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Persist only the connection config; reset all transient runtime state
        // so a session that quit while connected restores disconnected rather
        // than showing a stale "connected" header with a dead socket. The three
        // sub-state stores and `_history` live outside `state` and are excluded
        // automatically.
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                ...s,
                connectionStatus: "disconnected",
                errorMessage: "",
                serverName: "",
                serverTitle: "",
                serverVersion: "",
                serverDescription: "",
                serverWebsiteUrl: "",
                instructions: "",
                hasTools: false,
                hasResources: false,
                hasPrompts: false,
            } as unknown as Record<string, unknown>,
        };
    }

    applyRestoreData(data: RestoreData<McpInspectorEditorState>): void {
        super.applyRestoreData(data);
        this.state.update((s) => {
            if (data.url !== undefined) s.url = data.url;
            if (data.transportType) s.transportType = data.transportType;
            if (data.command !== undefined) s.command = data.command;
            if (data.args !== undefined) s.args = data.args;
            if (data.connectionName !== undefined) s.connectionName = data.connectionName;
            if (data.activePanel) s.activePanel = data.activePanel;
        });
    }

    async dispose(): Promise<void> {
        await this.connection.dispose();
        await super.dispose();
    }

    getIcon = (): ReactNode => {
        return createElement(McpIcon);
    };
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract simple `{param}` names from a URI template. */
export function extractTemplateParams(uriTemplate: string): string[] {
    const params: string[] = [];
    const re = /\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(uriTemplate)) !== null) {
        params.push(match[1]);
    }
    return params;
}

/** Replace `{param}` placeholders in a URI template with values from args. */
export function expandUriTemplate(uriTemplate: string, args: Record<string, string>): string {
    return uriTemplate.replace(/\{([^}]+)\}/g, (_, name) => args[name] ?? "");
}

function normalizePromptContent(block: any): McpPromptMessageContent {
    if (!block || typeof block === "string") return { type: "text", text: block || "" };
    if (block.type === "text") return { type: "text", text: block.text || "" };
    if (block.type === "image") return { type: "image", data: block.data, mimeType: block.mimeType };
    if (block.type === "resource") return {
        type: "resource",
        resource: {
            uri: block.resource?.uri || "",
            mimeType: block.resource?.mimeType,
            text: block.resource?.text,
            blob: block.resource?.blob,
        },
    };
    if (block.type === "resource_link") return { type: "resource_link", uri: block.uri, name: block.name };
    return { type: "text", text: JSON.stringify(block) };
}
