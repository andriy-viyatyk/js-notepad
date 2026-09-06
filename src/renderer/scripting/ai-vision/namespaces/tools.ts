import { fpNormalizeForCompare } from "../../../core/utils/file-path";
import { registeredTools } from "../../../api/tools/registered-tools";
import type { RegisteredToolset } from "../../../api/tools/registered-tools";
import { executeToolById } from "../../../api/tools/tool-executor";
import type { ToolRunResult } from "../../../api/tools/tool-executor";
import {
    handleCreateToolset,
    handleRefreshToolset,
    handleSearchTools,
} from "../../../api/mcp/tool-commands";
import type { McpResponse } from "../../../api/mcp/types";
import type { IAiChild, IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const REGISTRY_NOT_INITIALIZED = "Agent Tools registry is not initialized.";

const TOOLS_MEMBERS: readonly IAiMember[] = [
    { name: "search", kind: "method", signature: "search(query?: string, maxResults?: number)", summary: "Search registered tools by keyword or select an exact tool id." },
    { name: "execute", kind: "method", signature: "execute(toolId: string, args?: Record<string, unknown>)", summary: "Run one registered tool and return its structured result.", caution: "runs the registered script with the user's privileges" },
    { name: "toolsets", kind: "property", node: true, summary: "Inspect registered toolsets, including invalid and shadowed entries." },
    { name: "createToolset", kind: "method", signature: "createToolset(name: string, dir: string)", summary: "Scaffold a toolset and offer registration through the user's confirmation dialog.", caution: "writes files and blocks for user consent before registration" },
];

const TOOLSETS_MEMBERS: readonly IAiMember[] = [
    { name: "refresh", kind: "method", signature: "refresh()", summary: "Refresh the entire registered-tool registry." },
];

const TOOLSET_MEMBERS: readonly IAiMember[] = [
    { name: "name", kind: "property", summary: "The authoritative toolset display name." },
    { name: "root", kind: "property", summary: "The absolute registered toolset root." },
    { name: "valid", kind: "property", summary: "Whether the manifest passed structural validation." },
    { name: "shadowed", kind: "property", summary: "Whether a name collision made this toolset unavailable to execute." },
    { name: "errors", kind: "property", summary: "Validation and collision errors." },
    { name: "manifest", kind: "property", summary: "The parsed manifest projection, when parsing succeeded." },
    { name: "tools", kind: "property", summary: "Declared tool metadata with environment-variable names only." },
];

function requireInitialized(): void {
    if (!registeredTools.isInitialized) throw new Error(REGISTRY_NOT_INITIALIZED);
}

function cloneWithoutUndefined(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(cloneWithoutUndefined);
    if (!value || typeof value !== "object") return value;

    const cloned: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        if (item !== undefined) cloned[key] = cloneWithoutUndefined(item);
    }
    return cloned;
}

function unwrapResponse(response: McpResponse): unknown {
    if (response.error) throw new Error(response.error.message);
    return response.result;
}

function projectTool(tool: unknown): Record<string, unknown> {
    const source = (tool && typeof tool === "object" ? tool : {}) as Record<string, unknown>;
    const env = Array.isArray(source.env)
        ? source.env.filter((name): name is string => typeof name === "string")
        : undefined;
    const inputSchema = source.inputSchema && typeof source.inputSchema === "object" && !Array.isArray(source.inputSchema)
        ? cloneWithoutUndefined(source.inputSchema)
        : undefined;

    return {
        ...(typeof source.name === "string" ? { name: source.name } : {}),
        ...(typeof source.description === "string" ? { description: source.description } : {}),
        ...(inputSchema !== undefined ? { inputSchema } : {}),
        ...(typeof source.requirements === "string" ? { requirements: source.requirements } : {}),
        ...(env !== undefined ? { env } : {}),
        ...(typeof source.timeoutMs === "number" ? { timeoutMs: source.timeoutMs } : {}),
    };
}

function projectManifest(manifest: RegisteredToolset["manifest"]): Record<string, unknown> | undefined {
    if (!manifest) return undefined;
    const source = manifest as unknown as Record<string, unknown>;
    const keywords = Array.isArray(source.keywords)
        ? source.keywords.filter((keyword): keyword is string => typeof keyword === "string")
        : undefined;
    const tools = Array.isArray(source.tools) ? source.tools.map(projectTool) : undefined;

    return {
        ...(typeof source.schemaVersion === "number" ? { schemaVersion: source.schemaVersion } : {}),
        ...(typeof source.name === "string" ? { name: source.name } : {}),
        ...(typeof source.description === "string" ? { description: source.description } : {}),
        ...(typeof source.author === "string" ? { author: source.author } : {}),
        ...(keywords !== undefined ? { keywords } : {}),
        ...(tools !== undefined ? { tools } : {}),
    };
}

function toolsetSummary(toolset: RegisteredToolset): string {
    const declaredCount = Array.isArray(toolset.manifest?.tools) ? toolset.manifest.tools.length : 0;
    return `${toolset.name} (${toolset.valid ? "valid" : "invalid"}; ${declaredCount} declared tool${declaredCount === 1 ? "" : "s"}${toolset.shadowed ? "; shadowed" : ""})`;
}

class ToolsetNode {
    constructor(private readonly registeredRoot: string) {}

    private current(): RegisteredToolset | undefined {
        requireInitialized();
        const rootKey = fpNormalizeForCompare(this.registeredRoot);
        return registeredTools.toolsets.find((toolset) => fpNormalizeForCompare(toolset.root) === rootKey);
    }

    get name(): string | undefined { return this.current()?.name; }
    get root(): string | undefined { return this.current()?.root; }
    get valid(): boolean | undefined { return this.current()?.valid; }
    get shadowed(): boolean | undefined { return this.current()?.shadowed; }
    get errors(): string[] | undefined {
        const toolset = this.current();
        return toolset ? [...toolset.errors] : undefined;
    }
    get manifest(): Record<string, unknown> | undefined {
        return projectManifest(this.current()?.manifest);
    }
    get tools(): Record<string, unknown>[] | undefined {
        const manifest = this.current()?.manifest;
        return Array.isArray(manifest?.tools) ? manifest.tools.map(projectTool) : undefined;
    }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "Toolset",
            summary: "A registered Agent Tools toolset.",
            members: TOOLSET_MEMBERS,
            help: "Read this live toolset snapshot for manifest validation, declarations, and errors. Its tools are runnable only when valid, not shadowed, and present in the flat tools search; use tools.toolsets.refresh() after editing files. Environment fields are variable names only; values from .env are never returned.",
            summarize: () => ({ kind: "Toolset", root: this.registeredRoot }),
        };
    }
}

class ToolsetsNode {
    children(): readonly IAiChild[] {
        requireInitialized();
        return registeredTools.toolsets.map((toolset, index) => ({
            segment: `[${index}]`,
            kind: "Toolset",
            summary: toolsetSummary(toolset),
        }));
    }

    index(key: string | number): ToolsetNode {
        requireInitialized();
        const toolsets = registeredTools.toolsets;
        const toolset = typeof key === "number"
            ? Number.isInteger(key) && key >= 0 ? toolsets[key] : undefined
            : toolsets.find((candidate) => candidate.name.toLowerCase() === key.toLowerCase());
        if (toolset) return new ToolsetNode(toolset.root);

        const indexes = toolsets.map((_candidate, index) => `[${index}]`).join(", ") || "(none)";
        const names = toolsets.map((candidate) => candidate.name).join(", ") || "(none)";
        throw new Error(`Unknown toolset ${JSON.stringify(key)}. Valid indexes: ${indexes}; valid names: ${names}.`);
    }

    async refresh(): Promise<unknown> {
        requireInitialized();
        return cloneWithoutUndefined(unwrapResponse(await handleRefreshToolset({}))) as unknown;
    }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "Toolsets",
            summary: "Live registered Agent Tools toolsets, including invalid and shadowed records.",
            members: TOOLSETS_MEMBERS,
            children: () => this.children(),
            index: (key) => this.index(key),
            help: "Use numeric indexes or exact case-insensitive authoritative toolset names. The collection includes invalid and shadowed registrations. refresh() always rebuilds the whole registry; there is deliberately no per-toolset refresh member.",
            summarize: () => ({ kind: "Toolsets" }),
        };
    }
}

export class ToolsNode {
    private readonly toolsetsNode = new ToolsetsNode();

    get toolsets(): ToolsetsNode {
        requireInitialized();
        return this.toolsetsNode;
    }

    async search(query?: string, maxResults?: number): Promise<unknown> {
        requireInitialized();
        const normalizedQuery = typeof query === "string" ? query.trim() : "";
        if (normalizedQuery.toLowerCase().startsWith("select:")) {
            const wanted = normalizedQuery.slice("select:".length).trim();
            const match = registeredTools.tools.some((tool) => tool.id.toLowerCase() === wanted.toLowerCase());
            if (!match) {
                const validIds = registeredTools.tools.map((tool) => tool.id).join(", ") || "(none)";
                throw new Error(`Unknown tool selection "${wanted}". Valid tool ids: ${validIds}.`);
            }
        }

        const params: Record<string, unknown> = {};
        if (query !== undefined) params.query = query;
        if (maxResults !== undefined) params.maxResults = maxResults;
        return cloneWithoutUndefined(unwrapResponse(await handleSearchTools(params))) as unknown;
    }

    async execute(toolId: string, args?: unknown): Promise<ToolRunResult> {
        requireInitialized();
        const tool = registeredTools.tools.find((candidate) => candidate.id === toolId);
        if (!tool) {
            const validIds = registeredTools.tools.map((candidate) => candidate.id);
            throw new Error(`Unknown toolId "${toolId}". Valid tool ids: ${validIds.join(", ") || "(none)"}.`);
        }
        const result = await executeToolById(tool.id, args);
        return cloneWithoutUndefined(result) as ToolRunResult;
    }

    async createToolset(name: string, dir: string): Promise<unknown> {
        return cloneWithoutUndefined(unwrapResponse(await handleCreateToolset({ name, dir }))) as unknown;
    }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "Tools",
            summary: "Registered Agent Tools search, execution, inspection, refresh, and user-mediated scaffolding.",
            members: TOOLS_MEMBERS,
            children: () => {
                requireInitialized();
                return [{
                    segment: ".toolsets",
                    kind: "Toolsets",
                    summary: `${registeredTools.toolsets.length} registered toolset${registeredTools.toolsets.length === 1 ? "" : "s"}`,
                }];
            },
            help: `Agent Tools are registered programs, so execute() runs with the user's privileges. The registry is initialized during renderer startup; reads fail closed before that and never initialize or refresh from a getter or children().

search() supports an empty listing, ranked keyword search, and select:<toolset>/<tool> for one full definition. Full definitions contain id, toolset, description, optional inputSchema, requirements, env names, timeoutMs, and toolsetRoot. env contains variable NAMES only: .env values are used only inside the child process and never appear in results. Keep credentials in .env, not in execute() args; args are JSON input and may be recorded in local tool logs.

execute() returns the existing structured ToolRunResult. A process failure is not thrown: use ok, error, exitCode, stderr, logs, and toolsetRoot for self-repair. Fix the tool in toolsetRoot, call tools.toolsets.refresh(), and run it again. The last ##PERSEPHONE_RESULT##<json> line wins; marker-free stdout becomes resultText and stderr is diagnostics.

inputSchema is descriptive and best-effort validation produces advisory argWarnings; warnings never reject the request, and the tool script is the authoritative input validator. Unknown tool ids and toolset indexes/names are request errors with valid choices. toolsets.refresh() refreshes the whole registry and no individual toolset has a refresh member.

createToolset(name, dir) scaffolds through the existing flow and shows the registration confirmation. It never grants trust itself: registered:false means the user declined and the same call can re-offer it; registered:true means approval was obtained before trust and refresh.`,
            summarize: () => ({ kind: "Tools" }),
        };
    }
}

export const toolsNode = new ToolsNode();

export function describeTools(_instance: unknown): IAiVisionDescriptor {
    return toolsNode.aiVision;
}
