import { buildHelp, buildHint, formatMembers, formatChildren, IHint } from "./hint";
import { formatPath, parsePath, PathSegment, PathSyntaxError } from "./path-parser";
import { DEFAULT_MAX_LENGTH, shapeResult } from "./result-shaper";
import { getAiVision, IAiVisionDescriptor } from "./types";
import { errMessage } from "../utils";

/**
 * The AiVision resolver — walks the live object tree from a root along a parsed path and returns
 * the value there plus a hint about the node it landed on (EPIC-083, decisions 2–5, 7).
 *
 * Process-agnostic: the renderer resolves against its `AiRoot`; the main process resolves
 * `windows`/`main` against its own root with the same code.
 *
 * Rules the walk enforces:
 * - Every hop is awaited, so async facades need no special syntax.
 * - A node's `restricted()` text stops the walk; only `$help` is still answered.
 * - When a node has a descriptor, a member name must appear in `members` (or be a live child
 *   segment) — otherwise the error carries the member list, which is the self-correcting mechanism.
 *   Nodes without a descriptor (plain data) allow plain property access.
 * - Only the member the agent named is touched. Discovery uses `members`/`children()` only.
 */

export type HintMode = "auto" | "always" | "never";

export interface ICallRequest {
    path: string;
    /** Arguments for the last segment when it is a call; overrides inline `()` literals. */
    args?: unknown[];
    /** Assign to the last segment (a writable property). */
    value?: unknown;
    hints?: HintMode;
    maxLength?: number;
}

export interface ICallResult {
    path: string;
    result?: unknown;
    /** The requested action is still running because a newly opened dialog needs an answer. */
    pending?: boolean;
    /** Visible renderer UI that needs the agent's attention before it can continue. */
    attention?: { text: string };
    truncated?: boolean;
    totalLength?: number;
    hint?: IHint;
    error?: string;
    /** On error: the longest prefix of the path that did resolve. */
    resolvedUpTo?: string;
}

/** Per-session memory of which kinds' member lists the agent has already received. */
export type SeenKinds = Set<string>;

export async function resolveCall(root: unknown, request: ICallRequest, seenKinds: SeenKinds = new Set()): Promise<ICallResult> {
    const path = request.path ?? "";
    let segments: PathSegment[];
    try {
        segments = parsePath(path);
    } catch (error) {
        const message = error instanceof PathSyntaxError ? error.message : String(error);
        return { path, error: `Invalid path: ${message}`, resolvedUpTo: "", hint: nodeHint("", root, seenKinds, "always") };
    }

    const hintMode = request.hints ?? "auto";
    const maxLength = request.maxLength ?? DEFAULT_MAX_LENGTH;
    const hasValue = Object.prototype.hasOwnProperty.call(request, "value") && request.value !== undefined;
    if (hasValue && request.args) {
        return { path, error: "\"args\" and \"value\" are mutually exclusive: call a method, or assign a property, not both." };
    }

    let current: unknown = root;
    const walked: PathSegment[] = [];

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const isLast = i === segments.length - 1;
        const descriptor = getAiVision(current);

        if (segment.type === "help") {
            if (!descriptor) {
                return { path, error: `"${formatPath(walked) || "(root)"}" has no AiVision descriptor; nothing to explain. Its value is shown instead.`, ...shapeResult(current, maxLength) };
            }
            return { path, result: buildHelp(formatPath(walked), descriptor) };
        }

        const restricted = descriptor?.restricted?.();
        if (restricted) {
            return { path, error: restricted, resolvedUpTo: formatPath(walked), hint: nodeHint(formatPath(walked), current, seenKinds, hintMode) };
        }

        try {
            if (segment.type === "index") {
                const next = indexInto(current, descriptor, segment.key);
                if (next === undefined) {
                    return errorAt(path, walked, current, seenKinds, hintMode, `No item ${JSON.stringify(segment.key)} in "${formatPath(walked) || "(root)"}".`);
                }
                current = await next;
            } else {
                const name = segment.name;
                if (current === null || current === undefined || (typeof current !== "object" && typeof current !== "function")) {
                    return errorAt(path, walked, current, seenKinds, hintMode, `"${formatPath(walked)}" is a primitive value; it has no member "${name}".`);
                }
                const member = descriptor?.members.find(m => m.name === name);
                if (descriptor && !member && !isLiveChildMember(descriptor, name)) {
                    return errorAt(path, walked, current, seenKinds, hintMode, `"${name}" is not a member of ${descriptor.kind}.`, true);
                }

                if (isLast && hasValue && segment.type === "member") {
                    if (descriptor && !member?.writable) {
                        return errorAt(path, walked, current, seenKinds, hintMode, `"${name}" is not writable on ${descriptor.kind}.`, true);
                    }
                    try {
                        (current as Record<string, unknown>)[name] = request.value;
                    } catch (error) {
                        // MCP clients parse `value` as JSON, so an agent that meant to write text often
                        // sends an object or array. Say so — the setter's own error rarely does.
                        const valueType = Array.isArray(request.value) ? "array" : typeof request.value;
                        return errorAt(path, walked, current, seenKinds, hintMode,
                            `Assigning ${valueType} to "${name}" failed: ${errMessage(error)}. If the property holds text, pass "value" as a string (JSON.stringify structured data first).`);
                    }
                    walked.push(segment);
                    return { path, result: { ok: true } };
                }

                const target = current;
                let value: unknown = (target as Record<string, unknown>)[name];
                if (segment.type === "call") {
                    if (typeof value !== "function") {
                        return errorAt(path, walked, current, seenKinds, hintMode, `"${name}" is a property, not a method — drop the "()".`, true);
                    }
                    const args = isLast && request.args ? request.args : segment.args;
                    value = (value as (...a: unknown[]) => unknown).apply(target, args);
                } else if (typeof value === "function" && member?.kind === "method") {
                    if (isLast && request.args) {
                        value = (value as (...a: unknown[]) => unknown).apply(target, request.args);
                    } else {
                        // Naming a method without calling it: describe it rather than invoking it.
                        walked.push(segment);
                        return {
                            path,
                            result: { kind: "method", signature: member.signature ?? `${name}()`, summary: member.summary, note: `Call it as "${formatPath(walked)}()" (or pass "args").` },
                        };
                    }
                }
                current = await value;
            }
        } catch (error) {
            return errorAt(path, walked, current, seenKinds, hintMode, errMessage(error));
        }
        walked.push(segment);
    }

    if (hasValue) {
        return { path, error: "\"value\" needs a path ending in a writable property name." };
    }
    if (segments.length === 0 && request.args) {
        return { path, error: "\"args\" needs a path ending in a method." };
    }

    const shaped = shapeResult(current, maxLength);
    const hint = nodeHint(formatPath(walked), current, seenKinds, hintMode);
    return { path, ...shaped, ...(hint ? { hint } : {}) };
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

function indexInto(current: unknown, descriptor: IAiVisionDescriptor | undefined, key: string | number): unknown {
    if (descriptor?.index) return descriptor.index(key);
    if (Array.isArray(current)) return typeof key === "number" ? current[key] : undefined;
    if (current && typeof current === "object") return (current as Record<string, unknown>)[String(key)];
    return undefined;
}

/** `children()` may list `.grouped` or `.asGrid()` — those names are valid even if not in `members`. */
function isLiveChildMember(descriptor: IAiVisionDescriptor, name: string): boolean {
    const children = descriptor.children?.() ?? [];
    return children.some(child => child.segment === `.${name}` || child.segment.startsWith(`.${name}(`));
}

function nodeHint(path: string, node: unknown, seenKinds: SeenKinds, mode: HintMode): IHint | undefined {
    if (mode === "never") return undefined;
    const descriptor = getAiVision(node);
    if (!descriptor) return undefined;
    const includeMembers = mode === "always" || !seenKinds.has(descriptor.kind);
    seenKinds.add(descriptor.kind);
    return buildHint(path, descriptor, includeMembers);
}

function errorAt(
    path: string,
    walked: readonly PathSegment[],
    node: unknown,
    seenKinds: SeenKinds,
    mode: HintMode,
    message: string,
    forceMembers = false,
): ICallResult {
    const resolvedUpTo = formatPath(walked);
    const descriptor = getAiVision(node);
    let hint: IHint | undefined;
    if (descriptor && forceMembers) {
        // The self-correcting case: always show what *is* valid here, regardless of dedupe.
        const parts = [`${descriptor.kind} — ${descriptor.summary}`, formatMembers(descriptor.members), formatChildren(resolvedUpTo, descriptor.children?.() ?? [])].filter(Boolean);
        hint = { kind: descriptor.kind, text: parts.join("\n") };
    } else {
        hint = nodeHint(resolvedUpTo, node, seenKinds, mode);
    }
    return { path, error: message, resolvedUpTo, ...(hint ? { hint } : {}) };
}
