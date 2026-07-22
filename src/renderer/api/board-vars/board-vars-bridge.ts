import { showCreateBoardVarsStorageDialog } from "../../ui/dialogs/CreateBoardVarsStorageDialog";
import { boardVars } from "./BoardEnvStore";
import { openEnvVarsPage } from "../../editors/env-vars/open-env-vars";

// =============================================================================
// Board vars bridge orchestration (EPIC-046 / US-888).
//
// The single renderer-side entry point `BoardWebview` calls for every
// `persephone.var.*` request: loads the store (showing the "Create environment
// variables storage" dialog when unconfigured), then dispatches get/set/list
// against the CALLER'S namespace (resolved by `BoardWebview` from the board
// root — never supplied by the board itself).
//
// Requests are serialized on a shared in-flight chain so two boards hitting a
// locked/not-configured store at once can't each pop a password/create dialog
// (US-887 concern #5).
// =============================================================================

export interface BoardVarReply {
    result?: unknown;
    error?: string;
}

let chain: Promise<unknown> = Promise.resolve();

export function resolveBoardVarRequest(
    namespace: string,
    method: "get" | "set" | "list" | "show",
    args: unknown[],
): Promise<BoardVarReply> {
    const run = chain.then(() => runVarRequest(namespace, method, args));
    // Keep the chain alive regardless of this request's outcome.
    chain = run.then(
        (): void => undefined,
        (): void => undefined,
    );
    return run;
}

async function runVarRequest(
    namespace: string,
    method: "get" | "set" | "list" | "show",
    args: unknown[],
): Promise<BoardVarReply> {
    // "show" needs the store configured and unlocked too — that's what resolves the path
    // openEnvVarsPage() opens (US-889).
    let load = await boardVars.ensureLoaded();

    if (load.status === "not-configured") {
        const created = await showCreateBoardVarsStorageDialog();
        if (!created) return { error: "Board environment variables storage is not configured." };
        load = await boardVars.ensureLoaded(); // setting changed → reset → reload
    }
    if (load.status === "locked") return { error: "Board environment variables file is locked." };
    if (load.status !== "ok") {
        return { error: load.message || "Failed to load the board environment variables." };
    }

    try {
        switch (method) {
            case "get":
                return {
                    result: boardVars.get(namespace, String(args[0] ?? ""), args[1] as string | undefined),
                };
            case "list":
                return { result: boardVars.list(namespace, args[0] as string | undefined) };
            case "set":
                await boardVars.set(
                    namespace,
                    String(args[0] ?? ""),
                    String(args[1] ?? ""),
                    args[2] as string | undefined,
                );
                return { result: undefined };
            case "show":
                await openEnvVarsPage(namespace);
                return { result: undefined };
            default:
                return { error: `Unknown var method: ${String(method)}` };
        }
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}
