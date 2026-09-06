import { LogViewEditor } from "../../editors/log-view";
import { pagesModel } from "../pages";

/** Get, focus, and return the fixed Log View used by MCP output in this renderer. */
export function getOrCreateMcpLogViewEditor(): LogViewEditor {
    const page = pagesModel.requireWellKnownPage("mcp-ui-log");
    const editor = page.mainEditorInstance;
    if (!(editor instanceof LogViewEditor)) {
        throw new Error("MCP log page is not a LogViewEditor");
    }
    return editor;
}
