import type { IBoardVars } from "../../../api/types/board-vars";
import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const BOARD_VARS_MEMBERS: readonly IAiMember[] = [
    { name: "namespaceFor", kind: "method", signature: "namespaceFor(boardRoot: string)", summary: "Resolve the namespace key used by a board's environment store.", caution: "the first use can block on storage setup" },
    { name: "get", kind: "method", signature: "get(namespace: string, name: string, env?: string)", summary: "Read one stored variable.", caution: "can block on storage setup or an unlock prompt" },
    { name: "set", kind: "method", signature: "set(namespace: string, name: string, value: string, env?: string)", summary: "Persist one board environment value.", caution: "can block on storage setup or unlock and writes a secret" },
    { name: "list", kind: "method", signature: "list(namespace: string, env?: string)", summary: "List variable names in a profile.", caution: "can block on storage setup or an unlock prompt" },
    { name: "listNamespaces", kind: "method", signature: "listNamespaces()", summary: "List configured environment namespaces.", caution: "can block on storage setup or an unlock prompt" },
    { name: "show", kind: "method", signature: "show(namespace?: string)", summary: "Open the built-in environment-variable editor.", caution: "opens a visible editor and can block on storage setup or unlock" },
];

export function describeBoardVars(_instance: unknown): IAiVisionDescriptor {
    return {
        kind: "BoardVars",
        summary: "Administer board environment variables and secrets.",
        members: BOARD_VARS_MEMBERS,
        help: "Use this namespace to provision board variables deliberately; storage setup and unlock calls can wait for the user.",
        summarize: () => ({ kind: "BoardVars" }),
    };
}

export type { IBoardVars };
