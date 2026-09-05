import { ScriptContext } from "../ScriptContext";
import { ICallRequest, ICallResult, resolveCall, SeenKinds } from "../../../shared/ai-vision/resolver";
import { AiRoot } from "./root";

/**
 * Renderer entry point for the `call` MCP tool: build the tree root inside a fresh script context
 * (the same lifecycle `execute_script` uses — wrappers are created per run and released after),
 * resolve the path, dispose.
 *
 * `seenKinds` is the per-MCP-session dedupe set; the main process owns it and passes the kinds it
 * has already shown, so the renderer stays stateless across calls.
 */
export async function aiCall(request: ICallRequest, seenKinds?: SeenKinds): Promise<ICallResult> {
    const context = new ScriptContext(undefined, []);
    try {
        return await resolveCall(new AiRoot(context.app), request, seenKinds);
    } finally {
        context.dispose();
    }
}
