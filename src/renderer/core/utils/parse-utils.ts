import JSON5 from 'json5';

/** True when v has a callable `.toString` (every non-null/undefined JS value
 *  has it via the prototype chain, but the defensive check matches the
 *  original any-based implementation). */
function hasToString(v: unknown): v is { toString(): string } {
    if (v === null || v === undefined) return false;
    return typeof (v as { toString?: unknown }).toString === "function";
}

export const parseString = (value: unknown): string | undefined => {
    if (!hasToString(value)) return undefined;
    return value.toString();
};

export const parseNumber = (value: unknown): number | undefined => {
    if (!hasToString(value)) return undefined;
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    const int = parseInt(value.toString(), 10);
    return isNaN(int) ? undefined : int;
};

export const parseBoolean = (value: unknown): boolean | undefined => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string" && ["false", "no", "0"].includes(value.toLowerCase())) return false;
    return Boolean(value);
};

export const parseObject = (value: unknown, onError?: (error: unknown) => void): unknown => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return undefined;
    try {
        return JSON.parse(value);
    } catch (error) {
        if (onError) onError(error);
        return undefined;
    }
}

export const parseJSON5 = (value: unknown, onError?: (error: unknown) => void): unknown => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return undefined;
    try {
        return JSON5.parse(value);
    } catch (error) {
        if (onError) onError(error);
        return undefined;
    }
}
