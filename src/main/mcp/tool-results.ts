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

/** Page-content results: image pages carry `image` (base64 PNG from the renderer's
 *  IImageExport path) — surface it as a real MCP image block (agents see the picture),
 *  with the remaining metadata as a JSON text block. Text/hint payloads flow as JSON. */
export function toPageContentResult(response: McpResponse): IMcpToolResult {
    if (response.error) return toToolResult(response);
    const r = response.result as
        | { image?: { data: string; mimeType: string } }
        | null
        | undefined;
    if (r?.image) {
        const { image, ...meta } = r;
        return {
            content: [
                { type: "text", text: JSON.stringify(meta, null, 2) },
                { type: "image", data: image.data, mimeType: image.mimeType },
            ],
        };
    }
    return toToolResult(response);
}

/** Screenshot results: the renderer returns `{ type: "image", data, mimeType }`. */
export function toImageResult(response: McpResponse): IMcpToolResult {
    if (response.error) return toToolResult(response);
    const r = response.result as { type?: string; data?: string; mimeType?: string } | null | undefined;
    if (r?.type === "image" && r.data) {
        return { content: [{ type: "image", data: r.data, mimeType: r.mimeType ?? "image/png" }] };
    }
    return toToolResult(response);
}
