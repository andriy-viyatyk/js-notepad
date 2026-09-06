import { getServerInfo, readGuideFile, resourceFiles, SERVER_INSTRUCTIONS } from "./manifest";
import { registerTools } from "./register-tools";
import { McpServerInstance, requireSdk } from "./sdk";
import { callTools } from "./tools/call-tools";
import { createToolContext } from "./tools/params";

/**
 * Creates a new McpServer — one per session, as the SDK requires one transport per
 * server. Tools are data (see `tools/`); this assembles the complete group list for
 * each new session.
 *
 * The manifest is `call` alone (US-1353). Every capability Persephone once advertised as a
 * separate tool is a path under it.
 */
export function createMcpServer(): McpServerInstance {
    const { McpServer, z } = requireSdk();
    const server = new McpServer(getServerInfo(), { instructions: SERVER_INSTRUCTIONS });

    const ctx = createToolContext(z);
    registerTools(server, callTools(ctx));

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
