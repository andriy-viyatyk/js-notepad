import { showDialog } from "./Dialogs";
import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { registerDialogView } from "./dialog-view-registry";
import { RegisterToolsetDialogView } from "./RegisterToolsetDialogView";

/**
 * Confirmation dialog gating AGENT-initiated toolset registration (EPIC-038 / US-804 / C3).
 * Registering a toolset lets its tools run as headless OS processes with the user's privileges,
 * and — unlike a board (a visible artifact) — later edits to those tools run without re-prompting,
 * so registration is the user's one checkpoint on capability growth. Mirrors `TrustBoardDialog`.
 *
 * Only the MCP `create_toolset` path uses this. User-initiated registration in the management UI
 * (US-805) needs no dialog — the user already picked the folder.
 */
export const registerToolsetDialogId = Symbol("registerToolsetDialog");

export interface RegisterToolsetDialogProps {
    toolsetName: string;
    toolsetRoot: string; // absolute toolset-root path, for display
    tools: { name: string; description: string }[];
}

registerDialogView(registerToolsetDialogId, RegisterToolsetDialogView);

export function showRegisterToolsetDialog(props: RegisterToolsetDialogProps): Promise<boolean> {
    const model = new TDialogModel<RegisterToolsetDialogProps, boolean>(new TComponentState(props));
    return showDialog({
        viewId: registerToolsetDialogId,
        model,
    }) as Promise<boolean>;
}
