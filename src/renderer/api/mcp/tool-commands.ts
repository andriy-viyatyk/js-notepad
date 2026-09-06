import { fpJoin } from "../../core/utils/file-path";
import type { RegisteredTool } from "../tools/registered-tools";
import { errMessage } from "../../../shared/utils";
import type { McpParams, McpResponse } from "./types";

interface McpToolDefinition {
    id: string;
    toolset: string;
    description: string;
    inputSchema?: object;
    requirements?: string;
    env?: string[];
    timeoutMs?: number;
    toolsetRoot: string;
}
function asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function toDefinition(tool: RegisteredTool): McpToolDefinition {
    return {
        id: tool.id,
        toolset: tool.toolsetName,
        description: tool.tool.description,
        inputSchema: tool.tool.inputSchema,
        requirements: tool.tool.requirements,
        env: tool.tool.env,
        timeoutMs: tool.tool.timeoutMs,
        toolsetRoot: tool.toolsetRoot,
    };
}

export async function handleSearchTools(params: McpParams): Promise<McpResponse> {
    const { registeredTools } = await import("../tools/registered-tools");
    await registeredTools.ensureInitialized();
    const all = registeredTools.tools;
    const query = (asString(params?.query) ?? "").trim();
    const maxResults = typeof params?.maxResults === "number" && params.maxResults > 0
        ? Math.floor(params.maxResults)
        : 5;

    if (!query) {
        return { result: { total: all.length, tools: all.map((tool) => ({ id: tool.id, description: tool.tool.description })) } };
    }

    const selectPrefix = "select:";
    if (query.toLowerCase().startsWith(selectPrefix)) {
        const wantedRaw = query.slice(selectPrefix.length).trim();
        const wanted = wantedRaw.toLowerCase();
        const matches = all.filter((tool) => tool.id.toLowerCase() === wanted);
        return {
            result: {
                total: matches.length,
                tools: matches.map(toDefinition),
                ...(matches.length === 0 ? { note: `No tool with id "${wantedRaw}". Call tools.search with an empty query to list all.` } : {}),
            },
        };
    }

    const terms = [...new Set(query.toLowerCase().split(/\s+/).filter((word) => word.length >= 2))];
    const scored = all
        .map((tool) => {
            const haystack = [
                tool.id,
                tool.tool.description,
                ...(tool.tool.keywords ?? []),
                tool.toolsetName,
                tool.toolsetDescription ?? "",
                ...(tool.toolsetKeywords ?? []),
            ].join(" ").toLowerCase();
            return { tool, score: terms.filter((term) => haystack.includes(term)).length };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score);
    return {
        result: {
            total: scored.length,
            returned: Math.min(scored.length, maxResults),
            tools: scored.slice(0, maxResults).map((item) => ({ ...toDefinition(item.tool), score: item.score })),
        },
    };
}

export async function handleExecuteTool(params: McpParams): Promise<McpResponse> {
    const toolId = asString(params?.toolId);
    if (!toolId) return { error: { code: -32602, message: "Missing or invalid 'toolId' parameter" } };
    const { executeToolById } = await import("../tools/tool-executor");
    return { result: await executeToolById(toolId, params?.args) };
}

export async function handleRefreshToolset(params: McpParams): Promise<McpResponse> {
    const path = asString(params?.path);
    const { registeredTools } = await import("../tools/registered-tools");
    await registeredTools.ensureInitialized();
    await registeredTools.refresh(path);
    const toolsets = registeredTools.toolsets.map((toolset) => ({
        name: toolset.name,
        root: toolset.root,
        valid: toolset.valid,
        shadowed: toolset.shadowed,
        toolCount: toolset.manifest?.tools?.length ?? 0,
        errors: toolset.errors,
    }));
    return {
        result: {
            refreshed: true,
            toolsetCount: toolsets.length,
            toolCount: registeredTools.tools.length,
            toolsets,
        },
    };
}

export async function handleCreateToolset(params: McpParams): Promise<McpResponse> {
    const name = asString(params?.name);
    const dir = asString(params?.dir);
    if (!name) return { error: { code: -32602, message: "Missing or invalid 'name' parameter" } };
    if (!dir) return { error: { code: -32602, message: "Missing or invalid 'dir' parameter" } };

    const toolsetRoot = fpJoin(dir, name);
    const { registeredTools } = await import("../tools/registered-tools");
    const { toolsTrust } = await import("../tools/tools-trust");
    await registeredTools.ensureInitialized();
    const { isToolsetFolder, readToolsManifest } = await import("../tools/tools-manifest");
    let created = false;

    if (await isToolsetFolder(toolsetRoot)) {
        if (toolsTrust.isTrusted(toolsetRoot)) {
            return { result: { created: false, registered: true, toolsetRoot, message: "Toolset is already registered." } };
        }
    } else {
        try {
            const { createToolset } = await import("../tools/tool-scaffold");
            await createToolset(name, dir);
            created = true;
        } catch (err) {
            return { error: { code: -32603, message: errMessage(err) } };
        }
    }

    const manifest = await readToolsManifest(toolsetRoot);
    const tools = (manifest?.tools ?? []).map((tool) => ({ name: tool.name, description: tool.description }));
    const { showRegisterToolsetDialog } = await import("../../ui/dialogs/RegisterToolsetDialog");
    const allowed = await showRegisterToolsetDialog({
        toolsetName: manifest?.name ?? name,
        toolsetRoot,
        tools,
    });
    if (!allowed) {
        return {
            result: {
                created,
                registered: false,
                toolsetRoot,
                message: `Toolset is at "${toolsetRoot}" but its tools are not runnable yet because registration was declined. If the user asks to enable it, call tools.createToolset again with the same name and dir to re-show the confirmation prompt.`,
            },
        };
    }

    await toolsTrust.trust(toolsetRoot);
    await registeredTools.refresh();
    return {
        result: {
            created,
            registered: true,
            toolsetRoot,
            toolsetName: manifest?.name ?? name,
            tools: registeredTools.tools
                .filter((tool) => tool.toolsetRoot === toolsetRoot)
                .map((tool) => ({ id: tool.id, description: tool.tool.description })),
        },
    };
}
