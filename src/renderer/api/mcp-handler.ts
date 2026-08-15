// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ipcRenderer } = require("electron");
import type { IpcRendererEvent } from "electron";
import { MCP_EXECUTE, MCP_RESULT } from "../../shared/constants";
import { errMessage } from "../../shared/utils";
import { dispatchMcpCommand } from "./mcp/command-registry";
import { logIncomingRequest } from "./mcp/request-log";
import type { McpParams, McpResponse } from "./mcp/types";

export { showMcpRequestLog } from "./mcp/request-log";

/** Registers the renderer half of the main-process MCP IPC bridge. */
export function initMcpHandler(): void {
    ipcRenderer.on(MCP_EXECUTE, async (
        _event: IpcRendererEvent,
        requestId: string,
        method: string,
        params: McpParams,
    ) => {
        const startTime = Date.now();
        let response: McpResponse;
        try {
            response = await dispatchMcpCommand(method, params);
        } catch (err) {
            response = { error: { code: -32603, message: errMessage(err, "Internal error") } };
        }
        logIncomingRequest(method, params, response, Date.now() - startTime);
        ipcRenderer.send(MCP_RESULT, requestId, response);
    });
}
