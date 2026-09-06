import { randomUUID } from "node:crypto";
import http from "node:http";
import { openWindows } from "./open-windows";
import { EventEndpoint } from "../ipc/api-types";
import { cancelPendingRequests, initMcpIpc } from "./mcp/renderer-bridge";
import { loadSdk, McpTransportInstance, requireSdk, McpServerInstance } from "./mcp/sdk";
import { createMcpServer } from "./mcp/server-factory";

// The Streamable HTTP transport for Persephone's MCP server: sessions, HTTP plumbing
// and lifecycle. What the server OFFERS — instructions, tools, guides — is defined as
// data under `mcp/` and assembled by `createMcpServer`.

const DEFAULT_PORT = 7865;

// ── Session lifecycle ───────────────────────────────────────────────
// The MCP SDK only evicts a session when the client sends an explicit HTTP
// DELETE (or we call transport.close()). Clients that just terminate — Claude
// Code restarting, a one-shot client, a reconnect after sleep — never send
// DELETE, so their sessions would accumulate forever (we observed 178 in a day).
// Each leaked session holds a full McpServer + transport in memory.
//
// Fix: track per-session activity and periodically close sessions idle past a
// TTL. transport.close() fires onclose, which funnels through the same
// sessions.delete path as DELETE — eviction stays in one place. We do NOT evict
// on SSE-stream disconnect: the session is meant to outlive a single connection
// so reconnecting clients keep working (see typescript-sdk issue #1852).
const SESSION_IDLE_MS = 30 * 60_000; // close sessions with no traffic for 30 min
const SESSION_SWEEP_MS = 60_000;     // check for idle sessions once a minute
const MAX_SESSIONS = 500;            // backstop cap against burst leaks

// ── State ───────────────────────────────────────────────────────────

let httpServer: http.Server | undefined;
let currentPort = DEFAULT_PORT;
interface Session { server: McpServerInstance; transport: McpTransportInstance; lastActivity: number }
const sessions = new Map<string, Session>();
let sessionSweepTimer: ReturnType<typeof setInterval> | undefined;

// Bump a session's activity timestamp so the idle reaper doesn't evict it. Called
// on every request that carries a valid, known session id.
function touchSession(sessionId: string | undefined): void {
    if (!sessionId) return;
    const session = sessions.get(sessionId);
    if (session) session.lastActivity = Date.now();
}

// Periodic sweep: close sessions idle past SESSION_IDLE_MS. transport.close()
// fires onclose → sessions.delete, so the map and broadcast update there.
function sweepIdleSessions(): void {
    const now = Date.now();
    for (const [sid, session] of sessions) {
        if (now - session.lastActivity > SESSION_IDLE_MS) {
            // close() is async and rejects pending streams; if it throws, drop the
            // entry directly so a wedged transport can't pin the session forever.
            Promise.resolve(session.transport.close()).catch(() => {
                sessions.delete(sid);
                broadcastMcpStatus();
            });
        }
    }
}

// ── Status Broadcast ────────────────────────────────────────────────

function broadcastMcpStatus(): void {
    openWindows.send(EventEndpoint.eMcpStatusChanged, {
        running: isMcpHttpServerRunning(),
        url: getMcpUrl(),
        clientCount: getMcpClientCount(),
    });
}

// ── HTTP Body Parser ───────────────────────────────────────────────

function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        req.on("end", () => {
            try {
                resolve(data ? JSON.parse(data) : undefined);
            } catch {
                reject(new Error("Invalid JSON"));
            }
        });
        req.on("error", reject);
    });
}

// ── HTTP Request Handler ───────────────────────────────────────────

async function handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://localhost:${currentPort}`);
    if (url.pathname !== "/mcp") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
        if (req.method === "POST") {
            const body = await parseJsonBody(req);

            if (sessionId && sessions.has(sessionId)) {
                touchSession(sessionId);
                await sessions.get(sessionId).transport.handleRequest(req, res, body);
            } else if (!sessionId && requireSdk().isInitializeRequest(body)) {
                await startSession(req, res, body);
            } else {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    jsonrpc: "2.0",
                    error: { code: -32000, message: "Bad request: no valid session ID" },
                    id: null,
                }));
            }
        } else if (req.method === "GET" || req.method === "DELETE") {
            // GET opens the SSE stream, DELETE ends the session; the transport handles
            // both, and both require an established session.
            if (!sessionId || !sessions.has(sessionId)) {
                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("Invalid or missing session ID");
                return;
            }
            touchSession(sessionId);
            await sessions.get(sessionId).transport.handleRequest(req, res);
        } else {
            res.writeHead(405, { "Content-Type": "text/plain" });
            res.end("Method not allowed");
        }
    } catch (error) {
        console.error("MCP HTTP handler error:", error);
        if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal server error" },
                id: null,
            }));
        }
    }
}

/** Admit a new client: build a server + transport for it and let the transport
 *  answer the initialize request that brought us here. */
async function startSession(req: http.IncomingMessage, res: http.ServerResponse, body: unknown): Promise<void> {
    const { StreamableHTTPServerTransport } = requireSdk();

    // Backstop against a burst of leaked sessions: if we're at the cap,
    // evict the least-recently-active one before admitting a new client.
    if (sessions.size >= MAX_SESSIONS) {
        let oldestSid: string | undefined;
        let oldest = Infinity;
        for (const [sid, s] of sessions) {
            if (s.lastActivity < oldest) { oldest = s.lastActivity; oldestSid = sid; }
        }
        const victim = oldestSid && sessions.get(oldestSid);
        if (victim) Promise.resolve(victim.transport.close()).catch(() => {
            sessions.delete(oldestSid);
            broadcastMcpStatus();
        });
    }

    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
            sessions.set(sid, { server: mcpServer, transport, lastActivity: Date.now() });
            broadcastMcpStatus();
        },
    });

    transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) sessions.delete(sid);
        broadcastMcpStatus();
    };

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
}

// ── Server Lifecycle ───────────────────────────────────────────────

/**
 * Guards against a concurrent second start. `httpServer` is only assigned in the `listen`
 * callback, so the `if (httpServer)` check alone leaves an in-flight window in which a second
 * caller passes the guard and calls `listen()` on the same port — EADDRINUSE.
 *
 * Two callers is the normal case, not an exotic one: every renderer window actuates
 * `mcp.enabled` (at startup, and on a settings-file change picked up by each window's watcher),
 * so opening two windows or editing appSettings.json fires this from every one of them at once.
 * Mirrors the same guard in `startMneme`.
 */
let startPromise: Promise<void> | null = null;

export async function startMcpHttpServer(port?: number): Promise<void> {
    if (httpServer) return;
    if (startPromise) return startPromise;

    await loadSdk();
    currentPort = port ?? DEFAULT_PORT;
    initMcpIpc();

    startPromise = new Promise<void>((resolve, reject) => {
        const server = http.createServer(handleHttpRequest);

        server.on("error", (err: NodeJS.ErrnoException) => {
            if (!httpServer) {
                // Startup error
                startPromise = null;
                reject(err);
            }
            console.error(`MCP HTTP server error on port ${currentPort}:`, err.message);
        });

        server.listen(currentPort, "127.0.0.1", () => {
            httpServer = server;
            startPromise = null;
            // Reap idle sessions abandoned by clients that never sent DELETE. unref()
            // so this timer never keeps the process alive on its own.
            sessionSweepTimer = setInterval(sweepIdleSessions, SESSION_SWEEP_MS);
            sessionSweepTimer.unref?.();
            console.log(`MCP HTTP server started: http://127.0.0.1:${currentPort}/mcp`);
            broadcastMcpStatus();
            resolve();
        });
    });

    return startPromise;
}

export async function stopMcpHttpServer(): Promise<void> {
    if (!httpServer) return;

    if (sessionSweepTimer) {
        clearInterval(sessionSweepTimer);
        sessionSweepTimer = undefined;
    }

    // Close all active sessions
    for (const [, session] of sessions) {
        try { await session.transport.close(); } catch { /* ignore cleanup errors */ }
    }
    sessions.clear();

    cancelPendingRequests("Server shutting down");

    return new Promise<void>((resolve) => {
        httpServer.close(() => {
            httpServer = undefined;
            console.log("MCP HTTP server stopped");
            broadcastMcpStatus();
            resolve();
        });
    });
}

export function isMcpHttpServerRunning(): boolean {
    return !!httpServer;
}

export function getMcpUrl(): string {
    // 127.0.0.1, not "localhost": the server binds IPv4 loopback (see server.listen
    // above), and an IPv6-first client resolving "localhost" to ::1 can stall instead
    // of failing over. Addressing the bound IPv4 directly is unambiguous.
    return `http://127.0.0.1:${currentPort}/mcp`;
}

export function getMcpClientCount(): number {
    return sessions.size;
}

export interface McpSessionSnapshot {
    ordinal: number;
    idPrefix: string;
    lastActivity: number;
    idleMs: number;
}

/** Return bounded metadata for the active MCP sessions without exposing SDK objects or full ids. */
export function getMcpSessionSnapshots(): McpSessionSnapshot[] {
    const now = Date.now();
    return [...sessions.entries()].map(([id, session], index) => ({
        ordinal: index + 1,
        idPrefix: id.slice(0, 8),
        lastActivity: session.lastActivity,
        idleMs: Math.max(0, now - session.lastActivity),
    }));
}
