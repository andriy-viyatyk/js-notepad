import { IMcpToolDef } from "../types";
import { IToolContext } from "./params";

// Agent Tools registry — discover, run, author and refresh reusable parameterized tools.

export function agentTools(ctx: IToolContext): IMcpToolDef[] {
    const { z, windowIndex } = ctx;
    return [
        {
            name: "search_tools",
            description: "Discover reusable Agent Tools registered in Persephone — parameterized scripts (any language) for recurring external-system chores (Azure DevOps, SQL, email, CLIs). Returns COMPLETE, ready-to-call definitions (id, description, inputSchema, requirements, required env var NAMES, local folder path) — like ToolSearch, no separate info call. Query forms: omit `query` (or pass empty) for a cheap id+description listing of everything; `select:<toolset>/<tool>` for an exact-id lookup; otherwise the query is tokenized on whitespace and tools are ranked by how many terms match across tool id/description/keywords + toolset name/description/keywords (capped by maxResults). Run a result with execute_tool. IMPORTANT: read read_guide(\"tools\") first.",
            schema: {
                query: z.string().optional().describe("Empty/omitted = list all (id+description). 'select:<toolset>/<tool>' = exact lookup. Otherwise whitespace-tokenized terms matched over tool + toolset metadata, ranked by match count."),
                maxResults: z.number().int().optional().describe("Max keyword matches to return (default 5). Ignored for empty-query listing and select: lookup."),
                windowIndex,
            },
        },
        {
            name: "execute_tool",
            description: "Run a registered Agent Tool by id (from search_tools). Pass `args` as a JSON object matching the tool's inputSchema; Persephone delivers it on the tool's stdin. Returns a structured result: on success { ok:true, result | resultText, logs, durationMs, ... }; on failure { ok:false, error, stderr, exitCode, toolsetRoot, ... }. IMPORTANT self-repair rule: if a tool fails, it returns its folder path (toolsetRoot) and stderr — FIX the tool at that path (then refresh_toolset) rather than working around it. IMPORTANT: read read_guide(\"tools\") first.",
            schema: {
                toolId: z.string().describe("Tool id '<toolset>/<tool>' (from search_tools)."),
                args: z.record(z.string(), z.unknown()).optional().describe("Tool arguments as a JSON object (matches the tool's inputSchema). Omit for a no-parameter tool."),
                windowIndex,
            },
            // timeout 0 = infinite: the real limit is the manifest timeoutMs, enforced
            // renderer-side by the executor's own timeout + tree-kill.
            timeoutMs: 0,
        },
        {
            name: "refresh_toolset",
            description: "Re-read registered toolset manifests after you EDIT a tool's tools-manifest.json or scripts (the registry does not watch the filesystem). Never registers a new toolset — that stays a user action. Omit `path` for a full refresh. Returns a per-toolset summary (name, valid, errors, toolCount) so you can confirm your manifest edit parsed. Use after fixing a tool that execute_tool reported as failing.",
            schema: {
                path: z.string().optional().describe("Toolset folder path to refresh (hint only; a full refresh runs regardless). Omit to refresh all."),
                windowIndex,
            },
        },
        {
            name: "create_toolset",
            description: "Scaffold a new Agent Tools toolset folder (starter tools-manifest.json + an example tool + .env.example + authoring guide) inside `dir`, named `name`, and prompt the user to confirm registration (tools run headlessly with the user's privileges). Returns { created, registered, toolsetRoot, tools }. If the user declines, `registered` is false and the folder exists but its tools are not runnable — just call create_toolset again with the same name and dir to re-show the prompt (it will NOT overwrite your edits). If the toolset already exists it is not re-scaffolded (re-offers registration, or no-ops if already registered). After registering, edit the manifest + scripts and call refresh_toolset. IMPORTANT: read read_guide(\"tools\") first.",
            schema: {
                name: z.string().describe("Toolset folder name — created inside `dir`; also the authoritative toolset name (namespaces tool ids as <name>/<tool>)."),
                dir: z.string().describe("Absolute path of the container folder the toolset is created in (created if it doesn't exist)."),
                windowIndex,
            },
            // timeout 0 = infinite: the renderer handler blocks on the user confirmation dialog
            // (the ui_push / execute_tool precedent).
            timeoutMs: 0,
        },
    ];
}
