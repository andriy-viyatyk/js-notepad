import { Zod } from "./types";

// The MCP SDK and zod are heavy and only needed when the server is actually started,
// so they are imported on the first startMcpHttpServer call. Everything that needs
// them runs after that point: requireSdk() is the "already loaded" accessor.

export interface IMcpSdk {
    McpServer: typeof import("@modelcontextprotocol/sdk/server/mcp.js").McpServer;
    StreamableHTTPServerTransport: typeof import("@modelcontextprotocol/sdk/server/streamableHttp.js").StreamableHTTPServerTransport;
    isInitializeRequest: typeof import("@modelcontextprotocol/sdk/types.js").isInitializeRequest;
    z: Zod;
}

export type McpServerInstance = InstanceType<IMcpSdk["McpServer"]>;
export type McpTransportInstance = InstanceType<IMcpSdk["StreamableHTTPServerTransport"]>;

let sdk: IMcpSdk | undefined;

export async function loadSdk(): Promise<IMcpSdk> {
    if (sdk) return sdk;
    const [mcpMod, transportMod, typesMod, zodMod] = await Promise.all([
        import("@modelcontextprotocol/sdk/server/mcp.js"),
        import("@modelcontextprotocol/sdk/server/streamableHttp.js"),
        import("@modelcontextprotocol/sdk/types.js"),
        import("zod"),
    ]);
    sdk = {
        McpServer: mcpMod.McpServer,
        StreamableHTTPServerTransport: transportMod.StreamableHTTPServerTransport,
        isInitializeRequest: typesMod.isInitializeRequest,
        z: zodMod.z,
    };
    return sdk;
}

/** The loaded SDK. Only call after `loadSdk()` has resolved — i.e. from anything
 *  reachable from a running HTTP server. */
export function requireSdk(): IMcpSdk {
    if (!sdk) throw new Error("MCP SDK not loaded");
    return sdk;
}
