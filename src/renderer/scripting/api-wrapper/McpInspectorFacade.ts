import type {
    IMcpPromptMessageContentSnapshot,
    IMcpPromptMessageSnapshot,
    IMcpPromptSnapshot,
    IMcpResourceContentSnapshot,
    IMcpResourceSnapshot,
    IMcpResourceTemplateSnapshot,
    IMcpToolAnnotationsSnapshot,
    IMcpToolInputSchemaSnapshot,
    IMcpToolResultContentSnapshot,
    IMcpToolResultSnapshot,
    IMcpToolSnapshot,
} from "../../api/types/mcp-inspector-editor";
import type {
    McpInspectorEditorModel,
    McpPanelId,
    McpPromptInfo,
    McpPromptMessage,
    McpPromptMessageContent,
    McpResourceInfo,
    McpResourceTemplateInfo,
    McpToolInfo,
    McpToolResult,
    McpToolResultContent,
} from "../../editors/mcp-inspector/McpInspectorEditorModel";
import type { McpTransportType } from "../../editors/mcp-inspector/McpConnectionManager";
import type { McpRequestEntry } from "../../editors/log-view/logTypes";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const MCP_INSPECTOR_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "mcp-transport", purpose: "Choose the HTTP or stdio connection transport." },
    { name: "mcp-saved-connections", purpose: "Choose a saved connection to fill the connection bar." },
    { name: "mcp-url", purpose: "Edit the HTTP endpoint before the user connects." },
    { name: "mcp-command", purpose: "Edit the stdio command before the user connects." },
    { name: "mcp-args", purpose: "Edit stdio arguments before the user connects." },
    { name: "mcp-connect", purpose: "Connect or disconnect the configured MCP server." },
    { name: "mcp-panel-switch", purpose: "Switch between Info, Tools, Resources, Prompts, and History." },
    { name: "mcp-call-tool", purpose: "Call the selected MCP tool from the Tools panel." },
    { name: "mcp-read-resource", purpose: "Read the selected resource or expanded resource template." },
    { name: "mcp-get-prompt", purpose: "Get the selected prompt with its entered arguments." },
    { name: "mcp-open-history", purpose: "Open recorded MCP history in a Log View page." },
    { name: "mcp-clear-history", purpose: "Clear recorded MCP request history." },
];

const MCP_INSPECTOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "connectionStatus", kind: "property", summary: "Connection state: \"disconnected\", \"connecting\", \"connected\", \"error\"." },
    { name: "serverName", kind: "property", summary: "Connected server name (empty when disconnected)." },
    { name: "serverTitle", kind: "property", summary: "Display-friendly server title (empty if not provided)." },
    { name: "serverVersion", kind: "property", summary: "Connected server version (empty when disconnected)." },
    { name: "serverDescription", kind: "property", summary: "Short server description (empty if not provided)." },
    { name: "serverWebsiteUrl", kind: "property", summary: "Server website URL (empty if not provided)." },
    { name: "instructions", kind: "property", summary: "Server instructions received during initialization (empty when disconnected)." },
    { name: "errorMessage", kind: "property", summary: "Last error message (empty when no error)." },
    { name: "transportType", kind: "property", writable: true, summary: "Transport type: \"http\" or \"stdio\"." },
    { name: "url", kind: "property", writable: true, summary: "Credential-free server URL (for HTTP transport)." },
    { name: "command", kind: "property", summary: "Current stdio command; readable but not writable through the agent API." },
    { name: "args", kind: "property", summary: "Current stdio arguments; readable but not writable through the agent API." },
    { name: "connectionName", kind: "property", writable: true, summary: "Display name for the connection." },
    { name: "connect", kind: "method", signature: "connect(): Promise<void>", summary: "Connect using current parameters.", caution: "contacts the configured MCP server or starts its configured stdio process with the user's privileges" },
    { name: "disconnect", kind: "method", signature: "disconnect(): Promise<void>", summary: "Disconnect from the current server.", caution: "ends the active server connection" },
    { name: "historyCount", kind: "property", summary: "Number of recorded request entries." },
    { name: "history", kind: "property", summary: "Array of recorded MCP request/response entries. Each entry has: direction, method, params, result, error, durationMs, timestamp." },
    { name: "clearHistory", kind: "method", signature: "clearHistory(): void", summary: "Clear all recorded history.", caution: "deletes recorded troubleshooting history" },
    { name: "showHistory", kind: "method", signature: "showHistory(): Promise<void>", summary: "Open history in a new Log View page." },
    { name: "activePanel", kind: "property", summary: "The active connected panel, or undefined while disconnected." },
    { name: "availablePanels", kind: "property", summary: "Connected panels available in the Inspector's panel switcher." },
    { name: "tools", kind: "property", summary: "Copied connected-server tool metadata, or undefined while disconnected." },
    { name: "selectedTool", kind: "property", summary: "Copied selected tool metadata, or undefined without a matching selection." },
    { name: "toolResult", kind: "property", summary: "Copied result from the selected tool, or undefined before a result exists." },
    { name: "toolCallLoading", kind: "property", summary: "Whether the selected tool call is loading, or undefined while disconnected." },
    { name: "resources", kind: "property", summary: "Copied connected-server resources, or undefined while disconnected." },
    { name: "resourceTemplates", kind: "property", summary: "Copied connected-server resource templates, or undefined while disconnected." },
    { name: "selectedResource", kind: "property", summary: "Copied selected resource, or undefined without a matching selection." },
    { name: "selectedResourceTemplate", kind: "property", summary: "Copied selected resource template, or undefined without a matching selection." },
    { name: "resourceContent", kind: "property", summary: "Copied selected-resource content, or undefined before a successful read." },
    { name: "templateResourceContent", kind: "property", summary: "Copied selected-template content, or undefined before a successful read." },
    { name: "resourceReadLoading", kind: "property", summary: "Whether the selected resource is loading, or undefined while disconnected." },
    { name: "templateReadLoading", kind: "property", summary: "Whether the selected template is loading, or undefined while disconnected." },
    { name: "resourceReadError", kind: "property", summary: "Selected-resource read error, or undefined when there is none." },
    { name: "templateReadError", kind: "property", summary: "Selected-template read error, or undefined when there is none." },
    { name: "prompts", kind: "property", summary: "Copied connected-server prompts, or undefined while disconnected." },
    { name: "selectedPrompt", kind: "property", summary: "Copied selected prompt, or undefined without a matching selection." },
    { name: "promptMessages", kind: "property", summary: "Copied selected-prompt messages, or undefined before a successful get." },
    { name: "promptLoading", kind: "property", summary: "Whether the selected prompt is loading, or undefined while disconnected." },
    { name: "promptError", kind: "property", summary: "Selected-prompt error, or undefined when there is none." },
];

const MCP_INSPECTOR_HELP = [
    "Access via pages[i].editor after narrowing editor.id to \"mcp-view\".",
    "MCP Inspector connection and panel state are model-backed. activePanel and availablePanels follow",
    "the connected server's Info, capability-backed Tools/Resources/Prompts, and History selector order.",
    "The three panel families, selections, results, content, loading flags, and errors are read-only",
    "snapshots. Connected empty lists and false loading flags are genuine values; disconnected or",
    "unavailable panel state is undefined. No facade member calls an MCP tool, reads a resource, or gets",
    "a prompt: inspect the state and tell the user which visible control to operate.",
    "",
    "connect() contacts the configured MCP server or starts its configured stdio process with the user's",
    "privileges. An agent must not use it to start an arbitrary process. The command and args setters",
    "were intentionally removed because an agent-chosen command line handed to StdioClientTransport",
    "on connect() has no consent dialog and can execute an arbitrary process. The existing command and",
    "args getters remain for compatibility and may expose credential-bearing flags; the existing URL,",
    "command, and args values can also be persisted by the user-facing Inspector. URL remains writable",
    "for HTTP addresses only: it must not contain embedded basic-auth/query credentials or tokens, and",
    "the agent must ask the user to enter credentials or headers in the Inspector UI.",
    "",
    "The curated elements are stable page controls only. Their selectors are scoped to this page,",
    "highlight activates the page, waits for layout, and uses { all: true }; dynamic rows and argument",
    "fields are intentionally not enumerated. history and its existing connection behavior remain",
    "backward-compatible.",
].join("\n");

function copyInputSchema(schema: McpToolInfo["inputSchema"]): IMcpToolInputSchemaSnapshot {
    return {
        type: schema.type,
        ...(schema.properties !== undefined ? { properties: { ...schema.properties } } : {}),
        ...(schema.required !== undefined ? { required: [...schema.required] } : {}),
    };
}

function copyAnnotations(annotations: NonNullable<McpToolInfo["annotations"]>): IMcpToolAnnotationsSnapshot {
    return {
        ...(annotations.title !== undefined ? { title: annotations.title } : {}),
        ...(annotations.readOnlyHint !== undefined ? { readOnlyHint: annotations.readOnlyHint } : {}),
        ...(annotations.destructiveHint !== undefined ? { destructiveHint: annotations.destructiveHint } : {}),
    };
}

function copyTool(tool: McpToolInfo): IMcpToolSnapshot {
    return {
        name: tool.name,
        description: tool.description,
        inputSchema: copyInputSchema(tool.inputSchema),
        ...(tool.annotations !== undefined ? { annotations: copyAnnotations(tool.annotations) } : {}),
    };
}

function copyResourceContent(content: { uri: string; mimeType?: string; text?: string; blob?: string }): IMcpResourceContentSnapshot {
    return {
        uri: content.uri,
        ...(content.mimeType !== undefined ? { mimeType: content.mimeType } : {}),
        ...(content.text !== undefined ? { text: content.text } : {}),
        ...(content.blob !== undefined ? { blob: content.blob } : {}),
    };
}

function copyToolResultContent(content: McpToolResultContent): IMcpToolResultContentSnapshot {
    if (content.type === "resource") {
        return { type: "resource", resource: copyResourceContent(content.resource) };
    }
    if (content.type === "image") {
        return {
            type: "image",
            data: content.data,
            ...(content.mimeType !== undefined ? { mimeType: content.mimeType } : {}),
        };
    }
    if (content.type === "resource_link") {
        return { type: "resource_link", uri: content.uri, name: content.name };
    }
    return { type: "text", text: content.text };
}

function copyToolResult(result: McpToolResult): IMcpToolResultSnapshot {
    return {
        content: result.content.map(copyToolResultContent),
        ...(result.isError !== undefined ? { isError: result.isError } : {}),
        durationMs: result.durationMs,
    };
}

function copyResource(resource: McpResourceInfo): IMcpResourceSnapshot {
    return { ...resource };
}

function copyResourceTemplate(template: McpResourceTemplateInfo): IMcpResourceTemplateSnapshot {
    return { ...template };
}

function copyPrompt(prompt: McpPromptInfo): IMcpPromptSnapshot {
    return {
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments.map((argument) => ({ ...argument })),
    };
}

function copyPromptMessageContent(content: McpPromptMessageContent): IMcpPromptMessageContentSnapshot {
    if (content.type === "resource") {
        return { type: "resource", resource: copyResourceContent(content.resource) };
    }
    if (content.type === "image") {
        return {
            type: "image",
            data: content.data,
            ...(content.mimeType !== undefined ? { mimeType: content.mimeType } : {}),
        };
    }
    if (content.type === "resource_link") {
        return { type: "resource_link", uri: content.uri, name: content.name };
    }
    return { type: "text", text: content.text };
}

function copyPromptMessage(message: McpPromptMessage): IMcpPromptMessageSnapshot {
    return { role: message.role, content: message.content.map(copyPromptMessageContent) };
}

export class McpInspectorFacade implements IAiVisible {
    constructor(private readonly model: McpInspectorEditorModel, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.model.page?.id;
        const elements = createElements(MCP_INSPECTOR_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
            highlightOptions: { all: true },
        });
        return {
            kind: "McpInspector",
            summary: "MCP Inspector connection, panel state, and troubleshooting facade.",
            members: [...MCP_INSPECTOR_MEMBERS, ...elements.members],
            help: MCP_INSPECTOR_HELP,
            elements: MCP_INSPECTOR_ELEMENTS,
            provide: elements.provide,
            summarize: () => this.aiSummary(),
        };
    }

    // -- Connection status (read-only) --------------------------------------

    get connectionStatus(): string { return this.model.state.get().connectionStatus; }
    get serverName(): string { return this.model.state.get().serverName; }
    get serverTitle(): string { return this.model.state.get().serverTitle; }
    get serverVersion(): string { return this.model.state.get().serverVersion; }
    get serverDescription(): string { return this.model.state.get().serverDescription; }
    get serverWebsiteUrl(): string { return this.model.state.get().serverWebsiteUrl; }
    get instructions(): string { return this.model.state.get().instructions; }
    get errorMessage(): string { return this.model.state.get().errorMessage; }

    // -- Connection parameters (read/write, except process configuration) ---

    get transportType(): string { return this.model.state.get().transportType; }
    set transportType(value: string) {
        this.model.state.update((state) => { state.transportType = value as McpTransportType; });
    }

    get url(): string { return this.model.state.get().url; }
    set url(value: string) {
        assertCredentialFreeUrl(value);
        this.model.state.update((state) => { state.url = value; });
    }

    // These remain readable for compatibility, but cannot be changed by an agent: with a writable
    // transportType and connect(), a new command line would otherwise spawn an arbitrary process.
    get command(): string { return this.model.state.get().command; }
    get args(): string { return this.model.state.get().args; }

    get connectionName(): string { return this.model.state.get().connectionName; }
    set connectionName(value: string) {
        this.model.state.update((state) => { state.connectionName = value; });
    }

    // -- Connection actions --------------------------------------------------

    connect(): Promise<void> { return this.model.connect(); }
    disconnect(): Promise<void> { return this.model.disconnect(); }

    // -- History --------------------------------------------------------------

    get historyCount(): number { return this.model.historyCount; }
    get history(): ReadonlyArray<McpRequestEntry> { return this.model.history; }
    clearHistory(): void { this.model.clearHistory(); }
    showHistory(): Promise<void> { return this.model.showHistory(); }

    // -- Connected panel state (read-only snapshots) ------------------------

    get activePanel(): McpPanelId | undefined {
        const state = this.connectedState;
        return state?.activePanel;
    }

    get availablePanels(): readonly McpPanelId[] | undefined {
        const state = this.connectedState;
        if (!state) return undefined;
        const panels: McpPanelId[] = ["info"];
        if (state.hasTools) panels.push("tools");
        if (state.hasResources) panels.push("resources");
        if (state.hasPrompts) panels.push("prompts");
        panels.push("history");
        return panels;
    }

    get tools(): readonly IMcpToolSnapshot[] | undefined {
        if (!this.connectedState) return undefined;
        return this.model.toolsState.get().tools.map(copyTool);
    }

    get selectedTool(): IMcpToolSnapshot | undefined {
        if (!this.connectedState) return undefined;
        const state = this.model.toolsState.get();
        const tool = state.tools.find((item) => item.name === state.selectedToolName);
        return tool ? copyTool(tool) : undefined;
    }

    get toolResult(): IMcpToolResultSnapshot | undefined {
        if (!this.connectedState) return undefined;
        const result = this.model.toolsState.get().toolResult;
        return result ? copyToolResult(result) : undefined;
    }

    get toolCallLoading(): boolean | undefined {
        if (!this.connectedState) return undefined;
        return this.model.toolsState.get().toolCallLoading;
    }

    get resources(): readonly IMcpResourceSnapshot[] | undefined {
        if (!this.connectedState) return undefined;
        return this.model.resourcesState.get().resources.map(copyResource);
    }

    get resourceTemplates(): readonly IMcpResourceTemplateSnapshot[] | undefined {
        if (!this.connectedState) return undefined;
        return this.model.resourcesState.get().templates.map(copyResourceTemplate);
    }

    get selectedResource(): IMcpResourceSnapshot | undefined {
        if (!this.connectedState) return undefined;
        const state = this.model.resourcesState.get();
        const resource = state.resources.find((item) => item.uri === state.selectedUri);
        return resource ? copyResource(resource) : undefined;
    }

    get selectedResourceTemplate(): IMcpResourceTemplateSnapshot | undefined {
        if (!this.connectedState) return undefined;
        const state = this.model.resourcesState.get();
        const template = state.templates.find((item) => item.uriTemplate === state.selectedTemplateUri);
        return template ? copyResourceTemplate(template) : undefined;
    }

    get resourceContent(): IMcpResourceContentSnapshot | undefined {
        if (!this.connectedState) return undefined;
        const state = this.model.resourcesState.get();
        return state.selectedUri && state.readContent ? copyResourceContent(state.readContent) : undefined;
    }

    get templateResourceContent(): IMcpResourceContentSnapshot | undefined {
        if (!this.connectedState) return undefined;
        const state = this.model.resourcesState.get();
        return state.selectedTemplateUri && state.templateReadContent
            ? copyResourceContent(state.templateReadContent)
            : undefined;
    }

    get resourceReadLoading(): boolean | undefined {
        if (!this.connectedState) return undefined;
        return this.model.resourcesState.get().readLoading;
    }

    get templateReadLoading(): boolean | undefined {
        if (!this.connectedState) return undefined;
        return this.model.resourcesState.get().templateReadLoading;
    }

    get resourceReadError(): string | undefined {
        if (!this.connectedState) return undefined;
        return this.model.resourcesState.get().readError || undefined;
    }

    get templateReadError(): string | undefined {
        if (!this.connectedState) return undefined;
        return this.model.resourcesState.get().templateReadError || undefined;
    }

    get prompts(): readonly IMcpPromptSnapshot[] | undefined {
        if (!this.connectedState) return undefined;
        return this.model.promptsState.get().prompts.map(copyPrompt);
    }

    get selectedPrompt(): IMcpPromptSnapshot | undefined {
        if (!this.connectedState) return undefined;
        const state = this.model.promptsState.get();
        const prompt = state.prompts.find((item) => item.name === state.selectedPromptName);
        return prompt ? copyPrompt(prompt) : undefined;
    }

    get promptMessages(): readonly IMcpPromptMessageSnapshot[] | undefined {
        if (!this.connectedState) return undefined;
        const state = this.model.promptsState.get();
        return state.selectedPromptName && state.promptMessages !== null
            ? state.promptMessages.map(copyPromptMessage)
            : undefined;
    }

    get promptLoading(): boolean | undefined {
        if (!this.connectedState) return undefined;
        return this.model.promptsState.get().getPromptLoading;
    }

    get promptError(): string | undefined {
        if (!this.connectedState) return undefined;
        return this.model.promptsState.get().promptError || undefined;
    }

    private get connectedState() {
        const state = this.model.state.get();
        return state.connectionStatus === "connected" ? state : undefined;
    }

    private aiSummary(): Record<string, unknown> {
        const state = this.model.state.get();
        const summary: Record<string, unknown> = {
            kind: "McpInspector",
            id: this.id,
            name: this.name,
            connectionStatus: state.connectionStatus,
            serverName: state.serverName,
            historyCount: this.historyCount,
        };
        if (state.connectionStatus !== "connected") return summary;

        const toolsState = this.model.toolsState.get();
        const resourcesState = this.model.resourcesState.get();
        const promptsState = this.model.promptsState.get();
        summary.activePanel = state.activePanel;
        summary.toolCount = toolsState.tools.length;
        summary.resourceCount = resourcesState.resources.length;
        summary.resourceTemplateCount = resourcesState.templates.length;
        summary.promptCount = promptsState.prompts.length;
        if (toolsState.selectedToolName) summary.selectedToolName = toolsState.selectedToolName;
        if (resourcesState.selectedUri) summary.selectedResourceUri = resourcesState.selectedUri;
        if (resourcesState.selectedTemplateUri) summary.selectedResourceTemplateUri = resourcesState.selectedTemplateUri;
        if (promptsState.selectedPromptName) summary.selectedPromptName = promptsState.selectedPromptName;
        return summary;
    }
}

function assertCredentialFreeUrl(value: string): void {
    if (/^[a-z][a-z\d+.-]*:\/\/[^/?#]*@/i.test(value)) {
        throw new Error("MCP URL must not contain embedded userinfo or credentials.");
    }

    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return;
    }

    // Userinfo only. A fragment is not a credential, and rejecting one would refuse a legitimate
    // URL for no gain — the guard is here to stop a secret being written into the call transcript,
    // not to narrow what an MCP endpoint may look like.
    if (parsed.username || parsed.password) {
        throw new Error("MCP URL must not contain embedded credentials (user:password@).");
    }

    for (const key of parsed.searchParams.keys()) {
        if (/(?:token|secret|password|passwd|credential|api[_-]?key|auth)/i.test(key)) {
            throw new Error(`MCP URL query parameter "${key}" may contain a secret and is not allowed.`);
        }
    }
}
