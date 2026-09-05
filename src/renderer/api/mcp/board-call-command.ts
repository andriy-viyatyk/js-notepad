import { pagesModel } from "../pages";
import { boardTrust } from "../board-trust";
import { ScriptContext } from "../../scripting/ScriptContext";
import { resolveAiCall } from "../../scripting/ai-vision/call";
import type { ICallRequest } from "../../../shared/ai-vision/resolver";
import { errMessage } from "../../../shared/utils";
import type { McpParams, McpResponse } from "./types";

/** Internal renderer command used only by the Board MessagePort call envelope. */
export async function handleBoardCall(params: McpParams): Promise<McpResponse> {
    const ownerId = typeof params?.ownerId === "string" ? params.ownerId : "";
    const rawRequest = params?.request;
    if (!ownerId || !rawRequest || typeof rawRequest !== "object") {
        return { error: { code: -32602, message: "Board call needs an ownerId and request." } };
    }

    const requestData = rawRequest as Record<string, unknown>;
    if (typeof requestData.path !== "string" || !requestData.path) {
        return { error: { code: -32602, message: "Board call needs a non-empty path." } };
    }
    if (requestData.args !== undefined && !Array.isArray(requestData.args)) {
        return { error: { code: -32602, message: "Board call args must be an array." } };
    }

    const request: ICallRequest = {
        path: requestData.path,
        hints: "never",
        ...(requestData.args !== undefined ? { args: requestData.args as unknown[] } : {}),
        ...(Object.prototype.hasOwnProperty.call(requestData, "value") ? { value: requestData.value } : {}),
        ...(typeof requestData.maxLength === "number" ? { maxLength: requestData.maxLength } : {}),
    };
    const page = pagesModel.findPage(ownerId);
    if (!page) {
        return { error: { code: -32603, message: "The Board's hosting page is no longer open." } };
    }

    const boardEditor = page.editors.find((editor) => editor.id === ownerId);
    const boardRoot = (boardEditor?.state.get() as { boardRoot?: unknown } | undefined)?.boardRoot;
    const contextEditor = page.mainEditor;
    if (!boardEditor || typeof boardRoot !== "string" || !boardRoot || !contextEditor || contextEditor.page !== page) {
        return { error: { code: -32603, message: "The Board is no longer attached to its hosting page." } };
    }

    const context = new ScriptContext(contextEditor);
    try {
        const result = await resolveAiCall(context, request, undefined, {
            page: context.page,
            restricted: () => boardTrust.isTrusted(boardRoot)
                ? undefined
                : "This Board is not trusted; trust it before using persephone.call().",
        });
        if (result.error) return { error: { code: -32603, message: result.error } };
        return { result: result.result };
    } catch (error) {
        return { error: { code: -32603, message: errMessage(error, "Board call failed.") } };
    } finally {
        context.dispose();
    }
}
