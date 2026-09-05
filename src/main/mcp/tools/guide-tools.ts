import { readGuideFile, resourceFiles } from "../manifest";
import { IMcpToolDef, IMcpToolResult } from "../types";
import { IToolContext } from "./params";

// The guide reader. Same source of truth as the MCP resources (`resourceFiles`) — the
// tool exists because many clients read tools far more readily than resources.

export function guideTools(ctx: IToolContext): IMcpToolDef[] {
    const { z } = ctx;
    return [
        {
            name: "read_guide",
            description: [
                "Read a Persephone documentation guide. IMPORTANT: You MUST use this tool to read the relevant guide BEFORE using tools that require it. Tool descriptions will tell you which guide to read.",
                "",
                "Available guides:",
                "- overview — START HERE if new to Persephone: the mental model (windows, pages, editors, boards, tools) and a task → tool → guide routing table.",
                "- ui-push — log messages, dialogs, output types (markdown, mermaid, grid, code). For ui_push tool.",
                "- pages — page properties, editor types, editor+language table, multi-window. For create_page and set_page_content tools.",
                "- scripting — app API (pages, fs, settings, ui, shell, window), editor facades (grid, notebook, browser), Node.js access. For execute_script tool.",
                "- notebook — NoteItem JSON format, content types. For notebook-view editor.",
                "- links — LinkItem JSON format, categories, tags. For link-view editor.",
                "- graph — graph JSON format, node/link data, page.editor API. For graph-view editor.",
                "- boards — what a board is, the app.boards create/open lifecycle (via execute_script), develop & test a board.",
                "- tools — reusable Agent Tools registry: search_tools/execute_tool, stdin-JSON + result-marker contract, .env secrets, self-repair. For search_tools/execute_tool tools.",
                "- browser — browser_* automation in depth: page targeting resolution, snapshot format, ref lifecycle, waiting, profiles, boards, the app window.",
                "- ui — Persephone's own interface: what each always-visible element is for, its stable selector, and how to highlight an element on screen. For helping the user with the app itself.",
                "- ui-editors — the editor catalog: what each editor is for, how the user opens it, what it can do. For explaining Persephone's capabilities to the user.",
            ].join("\n"),
            schema: {
                guide: z.enum(["overview", "ui-push", "pages", "scripting", "notebook", "links", "graph", "boards", "tools", "browser", "ui", "ui-editors"])
                    .describe("Guide name to read."),
            },
            handler: async (args): Promise<IMcpToolResult> => {
                const { guide } = args as { guide: string };
                const res = resourceFiles.find(r => r.uri === `persephone://guides/${guide}`);
                if (!res) {
                    return {
                        content: [{ type: "text", text: `Unknown guide: ${guide}. Available: overview, ui-push, pages, scripting, notebook, links, graph, boards, tools, browser, ui, ui-editors.` }],
                        isError: true,
                    };
                }
                try {
                    return { content: [{ type: "text", text: readGuideFile(res.file) }] };
                } catch (err) {
                    return {
                        content: [{ type: "text", text: `Error reading guide: ${err}` }],
                        isError: true,
                    };
                }
            },
        },
    ];
}
