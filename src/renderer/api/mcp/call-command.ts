import type { McpParams, McpResponse } from "./types";
import type { HintMode } from "../../../shared/ai-vision/resolver";

/**
 * The `call` MCP command — one path into the live object model (EPIC-083).
 * The main process peels `windows[i]` off the path before forwarding and passes the kinds whose
 * member lists this session has already seen, so hint dedupe survives the process boundary.
 */
export async function handleCall(params: McpParams): Promise<McpResponse> {
    const path = typeof params?.path === "string" ? params.path : "";
    const args = Array.isArray(params?.args) ? (params.args as unknown[]) : undefined;
    const hints = params?.hints as HintMode | undefined;
    const maxLength = typeof params?.maxLength === "number" ? params.maxLength : undefined;
    const seenKinds = new Set(Array.isArray(params?.seenKinds) ? (params.seenKinds as string[]) : []);
    const request = { path, args, hints, maxLength, ...(params && "value" in params ? { value: params.value } : {}) };

    const { aiCall } = await import("../../scripting/ai-vision/call");
    const result = await aiCall(request, seenKinds);
    return { result };
}
