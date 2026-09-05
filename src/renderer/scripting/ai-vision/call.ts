import { ScriptContext } from "../ScriptContext";
import { ICallRequest, ICallResult, resolveCall, SeenKinds } from "../../../shared/ai-vision/resolver";
import { AiRoot } from "./root";
import type { AiRootOptions } from "./root";
import { resolveWithAttention } from "./attention";

/**
 * Renderer entry point for the `call` MCP tool: build the tree root inside a fresh script context
 * (the same lifecycle `execute_script` uses — wrappers are created per run and released after),
 * resolve the path, dispose.
 *
 * `seenKinds` is the per-MCP-session dedupe set; the main process owns it and passes the kinds it
 * has already shown, so the renderer stays stateless across calls.
 */
// app.call() and persephone.call() intentionally remain plain-value APIs without this envelope.
export async function aiCall(request: ICallRequest, seenKinds?: SeenKinds): Promise<ICallResult> {
    const context = new ScriptContext(undefined, []);
    try {
        return await resolveWithAttention(
            request,
            () => resolveAiCall(context, request, seenKinds),
        );
    } finally {
        context.dispose();
    }
}

/** Resolve through an existing script context without changing its lifecycle. */
export function resolveAiCall(
    context: ScriptContext,
    request: ICallRequest,
    seenKinds?: SeenKinds,
    rootOptions?: AiRootOptions,
): Promise<ICallResult> {
    return resolveCall(new AiRoot(context.app, rootOptions), request, seenKinds);
}
