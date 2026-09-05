import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const PROCESS_MEMBERS: readonly IAiMember[] = [
    { name: "execute", kind: "method", signature: "execute(command: string, options?: IExecuteOptions)", summary: "Spawn a shell or direct child process and return a streaming/one-shot handle.", caution: "runs an external process with the user's privileges" },
];

export function describeProcess(_instance: unknown): IAiVisionDescriptor {
    return {
        kind: "Process",
        summary: "Spawn and manage child processes.",
        members: PROCESS_MEMBERS,
        help: "Use execute only when running an external process with the user's privileges is intended.",
        summarize: () => ({ kind: "Process" }),
    };
}
