import { getAiVision } from "./types";

/**
 * Turns whatever a path resolved to into something an agent can read (EPIC-083, decision 5):
 * primitives as they are, strings cut at `maxLength`, visible instances through `summarize()`,
 * arrays element-wise (capped), and class instances without a descriptor as `{ kind, note }` —
 * never a raw dump of internal state. Cycle- and depth-safe.
 */

export const DEFAULT_MAX_LENGTH = 20_000;
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 500;

export interface IShapedResult {
    result: unknown;
    truncated?: boolean;
    totalLength?: number;
}

export function shapeResult(value: unknown, maxLength: number = DEFAULT_MAX_LENGTH): IShapedResult {
    if (typeof value === "string" && value.length > maxLength) {
        return { result: value.slice(0, maxLength), truncated: true, totalLength: value.length };
    }
    return { result: shapeValue(value, 0, new WeakSet(), maxLength) };
}

function shapeValue(value: unknown, depth: number, seen: WeakSet<object>, maxLength: number): unknown {
    if (value === null || value === undefined) return value ?? null;
    switch (typeof value) {
        case "string":
            return value.length > maxLength ? `${value.slice(0, maxLength)}… [${value.length} chars total]` : value;
        case "number":
        case "boolean":
            return value;
        case "bigint":
            return value.toString();
        case "symbol":
            return value.toString();
        case "function":
            return { kind: "function", note: "Call it with () — see the members list for its signature." };
    }
    const object = value as object;
    if (seen.has(object)) return { kind: "circular" };
    const descriptor = getAiVision(object);
    if (descriptor) {
        return descriptor.summarize ? descriptor.summarize() : { kind: descriptor.kind };
    }
    if (depth >= MAX_DEPTH) return { kind: Array.isArray(object) ? "array" : "object", note: "depth limit" };
    seen.add(object);
    if (Array.isArray(object)) {
        const items = object.slice(0, MAX_ARRAY_ITEMS).map(item => shapeValue(item, depth + 1, seen, maxLength));
        if (object.length > MAX_ARRAY_ITEMS) items.push({ kind: "truncated", note: `${object.length - MAX_ARRAY_ITEMS} more items` });
        return items;
    }
    if (object instanceof Date) return object.toISOString();
    if (object instanceof Error) return { kind: "error", message: object.message };
    if (object instanceof Map) return shapeValue(Object.fromEntries(object), depth, seen, maxLength);
    if (object instanceof Set) return shapeValue([...object], depth, seen, maxLength);
    if (isPlainObject(object)) {
        const shaped: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(object)) {
            if (typeof item === "function") continue;
            shaped[key] = shapeValue(item, depth + 1, seen, maxLength);
        }
        return shaped;
    }
    // A class instance with no descriptor: do not dump its internals.
    const name = (object as { constructor?: { name?: string } }).constructor?.name || "object";
    return { kind: name, note: `No AiVision descriptor yet for ${name}; use $help on the parent, or execute_script.` };
}

function isPlainObject(value: object): boolean {
    const proto = Object.getPrototypeOf(value) as object | null;
    return proto === null || proto === Object.prototype;
}
