import { joinChildPath, parsePath } from "./path-parser";
import { formatMember } from "./hint";
import { getAiVision } from "./types";
import type { IAiVisionDescriptor } from "./types";

/**
 * `helpSearch(query)` — full-text search over the descriptor graph (EPIC-083, long-term table).
 *
 * Walks from the root through `children()` and through properties a descriptor marked `node: true`,
 * so the walk is side-effect free by construction: it visits only what a node declared safe. Matches every query token
 * against member name/summary/signature and node kind/summary/help. Instance paths (containing an
 * index) rank above kind-level ones so the agent gets a path it can call right away.
 */

export interface IHelpSearchHit {
    path: string;
    kind: string;
    matchedLine: string;
}

const MAX_NODES = 300;
const MAX_DEPTH = 5;

export async function helpSearch(root: unknown, query: string, limit = 20): Promise<IHelpSearchHit[]> {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const hits: IHelpSearchHit[] = [];
    const seenKinds = new Set<string>();
    const queue: Array<{ node: unknown; path: string; depth: number }> = [{ node: root, path: "", depth: 0 }];
    let visited = 0;

    while (queue.length && visited < MAX_NODES) {
        const { node, path, depth } = queue.shift()!;
        const descriptor = getAiVision(node);
        if (!descriptor) continue;
        visited++;

        // Kind-level lines only once per kind — a member match on Page reads the same for every page.
        if (!seenKinds.has(descriptor.kind)) {
            seenKinds.add(descriptor.kind);
            collectKindHits(path, descriptor, tokens, hits);
        }

        if (depth >= MAX_DEPTH || descriptor.restricted?.()) continue;
        for (const member of descriptor.members) {
            // `node: true` is the author's statement that *reading* this property is safe; a
            // `caution` on it describes what its members do (fs writes), not the read itself.
            if (member.kind !== "property" || member.node !== true) continue;
            const childNode = await stepTo(node, `.${member.name}`);
            if (getAiVision(childNode)) {
                queue.push({ node: childNode, path: joinChildPath(path, `.${member.name}`), depth: depth + 1 });
            }
        }
        for (const child of descriptor.children?.() ?? []) {
            const childPath = joinChildPath(path, child.segment);
            const childLine = `${childPath} — ${child.kind}: ${child.summary}`;
            if (matches(childLine, tokens)) hits.push({ path: childPath, kind: child.kind, matchedLine: childLine });
            if (child.restricted) continue;
            const childNode = await stepTo(node, child.segment);
            if (childNode !== undefined) queue.push({ node: childNode, path: childPath, depth: depth + 1 });
        }
    }

    hits.sort((a, b) => Number(b.path.includes("[")) - Number(a.path.includes("[")));
    return dedupe(hits).slice(0, limit);
}

function collectKindHits(path: string, descriptor: IAiVisionDescriptor, tokens: string[], hits: IHelpSearchHit[]): void {
    const nodeLine = `${descriptor.kind} — ${descriptor.summary}`;
    if (matches(nodeLine, tokens)) hits.push({ path: path || "(root)", kind: descriptor.kind, matchedLine: nodeLine });
    for (const member of descriptor.members) {
        const line = formatMember(member).trim();
        if (matches(`${member.name} ${line}`, tokens)) {
            const memberPath = joinChildPath(path, member.kind === "method" ? `${member.name}()` : member.name);
            hits.push({ path: memberPath, kind: descriptor.kind, matchedLine: line });
        }
    }
    const help = typeof descriptor.help === "function" ? descriptor.help() : descriptor.help;
    if (help) {
        for (const line of help.split("\n")) {
            if (line.trim() && matches(line, tokens)) {
                hits.push({ path: path ? `${path}.$help` : "$help", kind: descriptor.kind, matchedLine: line.trim() });
            }
        }
    }
}

/** Follow one child segment from a node — an index or a single member/call. */
async function stepTo(node: unknown, segment: string): Promise<unknown> {
    try {
        const segments = parsePath(segment.startsWith(".") ? segment.slice(1) : `x${segment}`);
        let current: unknown = node;
        for (const step of segments) {
            const descriptor = getAiVision(current);
            if (step.type === "index") {
                current = descriptor?.index ? descriptor.index(step.key) : (current as Record<string, unknown>)?.[String(step.key)];
            } else if (step.type === "member") {
                if (step.name === "x" && segment.startsWith("[")) continue; // the synthetic prefix
                current = (current as Record<string, unknown>)?.[step.name];
            } else if (step.type === "call") {
                const fn = (current as Record<string, unknown>)?.[step.name];
                if (typeof fn !== "function") return undefined;
                current = (fn as (...a: unknown[]) => unknown).apply(current, step.args);
            } else {
                return undefined;
            }
            current = await current;
            if (current === undefined || current === null) return undefined;
        }
        return current;
    } catch {
        return undefined;
    }
}

function matches(text: string, tokens: string[]): boolean {
    const lower = text.toLowerCase();
    return tokens.every(token => lower.includes(token));
}

function dedupe(hits: IHelpSearchHit[]): IHelpSearchHit[] {
    const seen = new Set<string>();
    return hits.filter(hit => {
        const key = `${hit.path}|${hit.matchedLine}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
