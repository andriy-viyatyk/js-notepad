import { sendToRenderer } from "../renderer-bridge";
import { toToolResult } from "../tool-results";
import { IMcpToolDef, IMcpToolResult, McpResponse, ToolArgs } from "../types";
import { IToolContext } from "./params";
import { openWindows } from "../../open-windows";
import { MainAiRoot, WINDOW_MEMBER_NAMES } from "../ai-vision/main-root";
import { formatPath, parsePath, PathSegment } from "../../../shared/ai-vision/path-parser";
import { HintMode, ICallResult, resolveCall } from "../../../shared/ai-vision/resolver";

/**
 * `call` — one path into Persephone's live object model (EPIC-083).
 *
 * Routing (design decision 2 + the architecture sketch): the main process owns `windows`. A path
 * that starts with `windows` is resolved here against `MainAiRoot` — `windows`, `windows[1]`,
 * `windows[1].open()`, `windows.$help` — until it reaches something a window answers itself
 * (`windows[1].pages[0].content`); that remainder is forwarded to that window's renderer as
 * `pages[0].content`. A path without the prefix goes to the main/default window, exactly like
 * every other tool when `windowIndex` is omitted. An explicit `windowIndex` parameter still works;
 * a prefix in the path wins.
 *
 * One `McpServer` exists per MCP session, and this factory runs once per server, so the closure
 * below *is* the per-session hint-dedupe state.
 */

interface IRoute {
    /** Resolve locally against the main root. */
    local?: true;
    /** Forward this path to this window's renderer. */
    forward?: { path: string; windowIndex?: number };
    error?: string;
}

/** Decide where a path is answered. Parse errors are left to the renderer, which reports them with the root hint. */
export function routeCallPath(path: string, explicitWindow: number | undefined): IRoute {
    let segments: PathSegment[];
    try {
        segments = parsePath(path);
    } catch {
        return { forward: { path, windowIndex: explicitWindow } };
    }
    const first = segments[0];
    if (!first || first.type !== "member" || first.name !== "windows") {
        return { forward: { path, windowIndex: explicitWindow } };
    }
    // windows | windows.$help | windows.count | windows[i] | windows[i].$help | windows[i].<own member>
    const index = segments[1];
    if (!index || index.type !== "index") return { local: true };
    const third = segments[2];
    if (!third || third.type === "help") return { local: true };
    if (typeof index.key !== "number") return { error: `windows[...] takes a window index (a number), got ${JSON.stringify(index.key)}.` };
    if (third.type === "member" || third.type === "call") {
        // `pages` is the window's live collection when it is open; only a closed window answers
        // from persisted state (there is no renderer to ask).
        const isLivePages = third.name === "pages" && isWindowOpen(index.key);
        if (!isLivePages && WINDOW_MEMBER_NAMES.includes(third.name)) return { local: true };
    }
    return { forward: { path: formatPath(segments.slice(2)), windowIndex: index.key } };
}

function isWindowOpen(index: number): boolean {
    return !!openWindows.windows.find(w => w.index === index)?.window;
}

/**
 * A forwarded response talks in renderer-relative paths (`pages[2]`, `page.asGrid()`,
 * `Details: call with path "pages.$help"`). Re-add the `windows[i].` prefix wherever a line or a
 * quoted path starts with the renderer's resolved path, so the agent sees the paths it typed.
 */
function prefixHintPaths(text: string, relativeRoot: string, prefix: string): string {
    // `windows[i]` alone is answered locally, so a forwarded path always has at least one segment.
    if (!relativeRoot) return text;
    return text.split("\n").map(line => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith(relativeRoot)) return line.replace(relativeRoot, prefix + relativeRoot);
        return line.replace(`path "${relativeRoot}`, `path "${prefix}${relativeRoot}`);
    }).join("\n");
}

export function callTools(ctx: IToolContext): IMcpToolDef[] {
    const { z, windowIndex } = ctx;
    const seenKinds = new Set<string>();
    const mainRoot = new MainAiRoot();

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
                "  path: \"windows\"                         → all windows; prefix any path with windows[i]. to target one (default: the main window)",
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
                const path = typeof params.path === "string" ? params.path : "";
                const route = routeCallPath(path, targetWindow);

                let response: McpResponse;
                if (route.error) {
                    const result: ICallResult = { path, error: route.error };
                    response = { result };
                } else if (route.local) {
                    const result = await resolveCall(mainRoot, {
                        path,
                        args: Array.isArray(params.args) ? params.args as unknown[] : undefined,
                        hints: params.hints as HintMode | undefined,
                        maxLength: typeof params.maxLength === "number" ? params.maxLength : undefined,
                        ...("value" in params ? { value: params.value } : {}),
                    }, seenKinds);
                    response = { result };
                } else {
                    const forward = route.forward!;
                    response = await sendToRenderer("call", { ...params, path: forward.path, seenKinds: [...seenKinds] }, forward.windowIndex);
                    // Report paths in the agent's own terms — with the windows[i]. prefix it typed.
                    const envelope = response.result as ICallResult | undefined;
                    if (envelope && forward.path !== path) {
                        const prefix = path.slice(0, path.length - forward.path.length);
                        const relativeRoot = envelope.resolvedUpTo ?? forward.path;
                        envelope.path = path;
                        if (envelope.resolvedUpTo !== undefined) envelope.resolvedUpTo = prefix + envelope.resolvedUpTo;
                        if (envelope.hint) envelope.hint.text = prefixHintPaths(envelope.hint.text, relativeRoot, prefix);
                    }
                }
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
