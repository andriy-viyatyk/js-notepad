export interface McpResponse {
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

/** JSON-RPC params: object-or-null shape per spec. Handlers narrow as needed. */
export type McpParams = Record<string, unknown> | null | undefined;

export type McpCommandHandler = (params: McpParams) => Promise<McpResponse> | McpResponse;
