import { IMcpToolResult, McpResponse } from "./types";

/** Default mapper: errors become an isError text block, results are pretty JSON. */
export function toToolResult(response: McpResponse): IMcpToolResult {
    if (response.error) {
        return {
            content: [{ type: "text", text: `Error: ${response.error.message}` }],
            isError: true,
        };
    }
    const text = response.result != null ? JSON.stringify(response.result, null, 2) : "OK";
    return { content: [{ type: "text", text }] };
}

