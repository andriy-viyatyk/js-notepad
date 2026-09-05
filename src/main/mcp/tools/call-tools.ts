import { sendToRenderer } from "../renderer-bridge";
import { toToolResult } from "../tool-results";
import { IMcpToolDef, IMcpToolResult, McpResponse, ToolArgs } from "../types";
import { IToolContext } from "./params";

/**
 * `call` — one path into Persephone's live object model (EPIC-083).
 *
 * US-1289 ships the minimum that makes the tree testable: forward to the renderer with the
 * per-session hint-dedupe set. US-1290 adds the optional `windows[i]` prefix, the `windows` node,
 * and the final description; US-1295 adds the `main` node.
 *
 * One `McpServer` exists per MCP session, and this factory runs once per server, so the closure
 * below *is* the per-session state.
 */
export function callTools(ctx: IToolContext): IMcpToolDef[] {
    const { z, windowIndex } = ctx;
    const seenKinds = new Set<string>();

    return [
        {
            name: "call",
            description: [
                "Persephone (developer notepad: tabbed pages, editors, scripting) — read or act on its live object model by PATH. Start with path \"\" to see the top-level entries; every result comes with a hint listing what is under it, so you can discover everything from here without any guide.",
                "",
                "Examples:",
                "  path: \"\"                                → top-level entries",
                "  path: \"pages\"                           → open pages (tabs), each with an index and id",
                "  path: \"page.content\"                    → text of the active page",
                "  path: \"pages[0].content\", value: \"...\" → replace a page's text",
                "  path: \"pages.showPage\", args: [\"<id>\"]  → activate a page",
                "  path: \"pages[0].asGrid().rowCount\"      → rows in a grid page",
                "  path: \"helpSearch\", args: [\"add rows\"]  → find where something lives",
                "  path: \"pages[0].$help\"                  → long-form help for a node",
                "",
                "Paths use the same names as the scripting API (execute_script). Put method arguments in `args` and assignments in `value`; the path itself takes only short JSON literals like pages[2] or pages[\"id\"]. An unknown member returns the valid member list instead of failing.",
            ].join("\n"),
            schema: {
                path: z.string().describe("Path into the object model, e.g. \"\", \"pages\", \"pages[0].content\", \"pages[\\\"<id>\\\"].asGrid().rows\", \"page.$help\"."),
                args: z.array(z.unknown()).optional().describe("Arguments for the last segment when it is a method (JSON array). Use this for strings with quotes/newlines or any non-trivial value."),
                value: z.unknown().optional().describe("Assign this value to the property named by the last segment (e.g. page.content). Mutually exclusive with args."),
                hints: z.enum(["auto", "always", "never"]).optional().describe("auto (default): the member list for each kind of object is sent once per session, live children always; always: repeat member lists; never: no hints."),
                maxLength: z.number().int().optional().describe("Cut string results longer than this (default 20000); the response then carries truncated: true and totalLength."),
                windowIndex,
            },
            handler: async (args: ToolArgs): Promise<IMcpToolResult> => {
                const { windowIndex: targetWindow, ...params } = args as { windowIndex?: number } & Record<string, unknown>;
                const response = await sendToRenderer("call", { ...params, seenKinds: [...seenKinds] }, targetWindow);
                const hint = (response.result as { hint?: { kind?: string } } | undefined)?.hint;
                if (hint?.kind) seenKinds.add(hint.kind);
                return toCallResult(response);
            },
        },
    ];
}

interface ICallEnvelope {
    path: string;
    result?: unknown;
    truncated?: boolean;
    totalLength?: number;
    error?: string;
    resolvedUpTo?: string;
    hint?: { kind: string; text: string };
}

/**
 * Two text blocks instead of one JSON dump: the value (or error) as JSON, then the hint as plain
 * text — a hint is prose for the agent to read, and escaping its newlines inside JSON makes it
 * markedly harder for small models to follow.
 */
function toCallResult(response: McpResponse): IMcpToolResult {
    if (response.error) return toToolResult(response);
    const envelope = response.result as ICallEnvelope | undefined;
    if (!envelope) return toToolResult(response);
    const { hint, ...rest } = envelope;
    const content: IMcpToolResult["content"] = [];
    if (rest.error !== undefined) {
        const where = rest.resolvedUpTo ? ` (resolved up to "${rest.resolvedUpTo}")` : "";
        content.push({ type: "text", text: `Error: ${rest.error}${where}` });
        if (rest.result !== undefined) content.push({ type: "text", text: JSON.stringify(rest.result, null, 2) });
    } else {
        const body = typeof rest.result === "string" ? rest.result : JSON.stringify(rest.result ?? null, null, 2);
        content.push({ type: "text", text: body });
        if (rest.truncated) content.push({ type: "text", text: `[truncated: showing ${(rest.result as string).length} of ${rest.totalLength} chars — raise maxLength or read a narrower path]` });
    }
    if (hint) content.push({ type: "text", text: `--- hint (${hint.kind}) ---\n${hint.text}` });
    return { content, isError: rest.error !== undefined };
}
