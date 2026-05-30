/**
 * Convert any script result value to a text + language pair for display.
 */
export function convertToText(value: unknown): { text: string; language: string } {
    // Handle Error objects (including exceptions)
    if (value instanceof Error) {
        let errorText = `Error: ${value.message}\n`;
        if (value.stack) {
            errorText += `\nStack trace:\n${value.stack}`;
        }
        return { text: errorText, language: "plaintext" };
    }

    // Handle undefined
    if (value === undefined) {
        return { text: "undefined", language: "plaintext" };
    }

    // Handle null
    if (value === null) {
        return { text: "null", language: "plaintext" };
    }

    // Handle string
    if (typeof value === "string") {
        return { text: value, language: "plaintext" };
    }

    // Handle number
    if (typeof value === "number") {
        return { text: String(value), language: "plaintext" };
    }

    // Handle boolean
    if (typeof value === "boolean") {
        return { text: String(value), language: "plaintext" };
    }

    // Handle BigInt
    if (typeof value === "bigint") {
        return { text: value.toString() + "n", language: "plaintext" };
    }

    // Handle Symbol
    if (typeof value === "symbol") {
        return { text: value.toString(), language: "plaintext" };
    }

    // Handle Function
    if (typeof value === "function") {
        return { text: value.toString(), language: "javascript" };
    }

    // Handle Date
    if (value instanceof Date) {
        return { text: value.toISOString(), language: "plaintext" };
    }

    // Handle RegExp
    if (value instanceof RegExp) {
        return { text: value.toString(), language: "plaintext" };
    }

    // Handle Map
    if (value instanceof Map) {
        const entries = Array.from(value.entries());
        return { text: JSON.stringify(entries, null, 4), language: "json" };
    }

    // Handle Set
    if (value instanceof Set) {
        const items = Array.from(value);
        return { text: JSON.stringify(items, null, 4), language: "json" };
    }

    // Handle ArrayBuffer and TypedArrays
    if (value instanceof ArrayBuffer) {
        return {
            text: `ArrayBuffer(${value.byteLength} bytes)`,
            language: "plaintext",
        };
    }

    if (ArrayBuffer.isView(value)) {
        // TypedArray or DataView
        const typeName = value.constructor.name;
        if (value instanceof DataView) {
            return {
                text: `DataView(${value.byteLength} bytes)`,
                language: "plaintext",
            };
        }
        // For TypedArrays, show as JSON array
        const arr = Array.from(value as unknown as ArrayLike<unknown>);
        if (arr.length > 100) {
            return {
                text: `${typeName}(${arr.length} items): [${arr.slice(0, 100).join(", ")}, ...]`,
                language: "plaintext",
            };
        }
        return { text: JSON.stringify(arr, null, 4), language: "json" };
    }

    // Handle Promise (shouldn't happen as run() awaits them, but just in case)
    if (value && typeof (value as { then?: unknown }).then === "function") {
        return { text: "[Promise - not awaited]", language: "plaintext" };
    }

    // Handle DOM elements (in Electron renderer)
    if (
        typeof HTMLElement !== "undefined" &&
        value instanceof HTMLElement
    ) {
        return { text: value.outerHTML, language: "html" };
    }

    if (typeof Node !== "undefined" && value instanceof Node) {
        return {
            text: `[${value.constructor.name}]`,
            language: "plaintext",
        };
    }

    // Handle regular objects and arrays with JSON.stringify
    try {
        return { text: JSON.stringify(value, null, 4), language: "json" };
    } catch (error) {
        // Handle circular references or non-serializable objects
        try {
            // Try with a circular reference replacer
            const seen = new WeakSet();
            const json = JSON.stringify(
                value,
                (key, val) => {
                    if (typeof val === "object" && val !== null) {
                        if (seen.has(val)) {
                            return "[Circular Reference]";
                        }
                        seen.add(val);
                    }
                    return val;
                },
                4
            );
            return { text: json, language: "json" };
        } catch {
            // Last resort - use toString
            return {
                text: `[Object: ${(value as { constructor?: { name?: string } }).constructor?.name || "Unknown"}]`,
                language: "plaintext",
            };
        }
    }
}
