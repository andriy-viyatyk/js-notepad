import { getServerInfo, readGuideFile, resourceFiles, SERVER_INSTRUCTIONS } from "./manifest";
import { registerTools } from "./register-tools";
import { McpServerInstance, requireSdk } from "./sdk";
import { agentTools } from "./tools/agent-tools";
import { boardTools } from "./tools/board-tools";
import { browserTools } from "./tools/browser-tools";
import { callTools } from "./tools/call-tools";
import { guideTools } from "./tools/guide-tools";
import { pageTools } from "./tools/page-tools";
import { createToolContext } from "./tools/params";
import { windowTools } from "./tools/window-tools";

// Enabled values are 1, true, and yes (case-insensitive); unset/empty and 0, false, and no are disabled.
function isMcpCallOnlyEnabled(value: string | undefined): boolean {
    const normalizedValue = value?.trim().toLowerCase();
    return normalizedValue === "1" || normalizedValue === "true" || normalizedValue === "yes";
}

/**
 * Creates a new McpServer — one per session, as the SDK requires one transport per
 * server. Tools are data (see `tools/`); this assembles the complete group list for
 * each new session.
 */
export function createMcpServer(): McpServerInstance {
    const { McpServer, z } = requireSdk();
    const server = new McpServer(getServerInfo(), { instructions: SERVER_INSTRUCTIONS });

    const ctx = createToolContext(z);
    const groups = isMcpCallOnlyEnabled(process.env.PERSEPHONE_MCP_CALL_ONLY)
        ? [callTools(ctx)]
        : [
            callTools(ctx),
            windowTools(ctx),
            pageTools(ctx),
            boardTools(ctx),
            agentTools(ctx),
            browserTools(ctx),
            guideTools(ctx),
        ];
    for (const group of groups) {
        registerTools(server, group);
    }

    // ── MCP Resources (focused guides) ─────────────────────────────────
    for (const res of resourceFiles) {
        server.registerResource(
            res.name,
            res.uri,
            { description: res.description, mimeType: "text/markdown" },
            async (uri) => ({
                contents: [{
                    uri: uri.href,
                    mimeType: "text/markdown",
                    text: readGuideFile(res.file),
                }],
            }),
        );
    }

    // Full API guide — concatenation of all resource files (for agents that want everything)
    server.registerResource(
        "full-api-guide",
        "persephone://guides/full",
        {
            description: "Complete API guide — all resources combined. Only read this if you need the full reference; prefer the focused guides above for specific tasks.",
            mimeType: "text/markdown",
        },
        async (uri) => ({
            contents: [{
                uri: uri.href,
                mimeType: "text/markdown",
                text: resourceFiles.map((r) => readGuideFile(r.file)).join("\n\n---\n\n"),
            }],
        }),
    );

    return server;
}
