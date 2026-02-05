import { PageModel } from "../../../model/page-model";
import { pagesModel } from "../../../model/pages-model";

const lexicalObjects = `
    const React = globalThis.React;

    const Array = globalThis.Array;
    const Boolean = globalThis.Boolean;
    const Date = globalThis.Date;
    const Error = globalThis.Error;
    const EvalError = globalThis.EvalError;
    const Function = globalThis.Function;
    const Infinity = globalThis.Infinity;
    const JSON = globalThis.JSON;
    const Map = globalThis.Map;
    const Math = globalThis.Math;
    const NaN = globalThis.NaN;
    const Number = globalThis.Number;
    const Object = globalThis.Object;
    const Promise = globalThis.Promise;
    const RegExp = globalThis.RegExp;
    const Set = globalThis.Set;
    const String = globalThis.String;
    const Symbol = globalThis.Symbol;
    const TypeError = globalThis.TypeError;
    const URIError = globalThis.URIError;
    const WeakMap = globalThis.WeakMap;
    const WeakSet = globalThis.WeakSet;
    const BigInt = globalThis.BigInt;
    const BigInt64Array = globalThis.BigInt64Array;
    const BigUint64Array = globalThis.BigUint64Array;
    const Int8Array = globalThis.Int8Array;
    const Uint8Array = globalThis.Uint8Array;
    const Uint8ClampedArray = globalThis.Uint8ClampedArray;
    const Int16Array = globalThis.Int16Array;
    const Uint16Array = globalThis.Uint16Array;
    const Int32Array = globalThis.Int32Array;
    const Uint32Array = globalThis.Uint32Array;
    const Float32Array = globalThis.Float32Array;
    const Float64Array = globalThis.Float64Array;
    const SharedArrayBuffer = globalThis.SharedArrayBuffer;
    const ArrayBuffer = globalThis.ArrayBuffer;
    const DataView = globalThis.DataView;
    const Atomics = globalThis.Atomics;
    const Reflect = globalThis.Reflect;
    const Proxy = globalThis.Proxy;
    const TextEncoder = globalThis.TextEncoder;
    const TextDecoder = globalThis.TextDecoder;
    const URL = globalThis.URL;
    const URLSearchParams = globalThis.URLSearchParams;
    const AggregateError = globalThis.AggregateError;
    const FinalizationRegistry = globalThis.FinalizationRegistry;
    const WeakRef = globalThis.WeakRef;
`

class ScriptRunner {
    handlePromiseException = 0;

    run = async (script: string, page?: PageModel): Promise<any> => {
        this.handlePromiseException += 1;
        try {
            try {
                const contextModule = await import("./ScriptContext");
                const context = contextModule.createScriptContext(page);

                // Check if script contains statement keywords at the start
                const trimmedScript = script.trim();
                const statementKeywords =
                    /^(const|let|var|if|for|while|do|switch|function|class|try|throw|return)\s/;
                const hasStatements = statementKeywords.test(trimmedScript);

                if (!hasStatements) {
                    // Try as expression first (for simple cases like "5 + 5" or "'hello'")
                    const expressionScript = `
                    with (this) {
                        return (async function() {
                            ${lexicalObjects}
                            return (${script});
                        }).call(this);
                    }
                `;

                    try {
                        const fn = new Function(expressionScript);
                        const result = fn.call(context);

                        if (result && typeof result.then === "function") {
                            try {
                                return await result;
                            } catch (asyncError) {
                                return asyncError instanceof Error
                                    ? asyncError
                                    : new Error(String(asyncError));
                            }
                        }

                        return result;
                    } catch (expressionError) {
                        // Fall through to statement handling
                    }
                }

                // Try to extract the last expression and make it return
                // This handles cases like: const a = 5; a * 8
                const statementScript = this.wrapScriptWithImplicitReturn(script);

                const fn = new Function(statementScript);
                const result = fn.call(context);

                if (result && typeof result.then === "function") {
                    try {
                        return await result;
                    } catch (asyncError) {
                        return asyncError instanceof Error
                            ? asyncError
                            : new Error(String(asyncError));
                    }
                }

                return result;
            } catch (error) {
                return error instanceof Error ? error : new Error(String(error));
            }
        } finally {
            setTimeout(() => {
                this.handlePromiseException -= 1;
            }, 1000);
        }
    };

    runWithResult = async (
        pageId: string,
        script: string,
        page?: PageModel,
    ): Promise<string> => {
        const result = await this.run(script, page);
        const textAndLang = this.convertToText(result);

        if (pageId) {
            const groupedModel = pagesModel.requireGroupedText(pageId, textAndLang.language);
            groupedModel.changeContent(textAndLang.text);
        }

        return textAndLang.text;
    };

    private wrapScriptWithImplicitReturn(script: string): string {
        const lines = script.trim().split("\n");

        // If there's already a return statement, use as-is
        if (/\breturn\b/.test(script)) {
            return `
            with (this) {
                return (async function() {
                    ${lexicalObjects}
                    ${script}
                }).call(this);
            }
        `;
        }

        // Try to make the last line/statement return its value
        // This is a simplified approach - handles most common cases
        const lastLine = lines[lines.length - 1].trim();

        // Check if last line looks like an expression (not a statement)
        const isStatement =
            /^(const|let|var|if|for|while|do|switch|function|class|try|throw|return)\s/.test(
                lastLine
            );

        if (
            !isStatement &&
            lastLine &&
            !lastLine.endsWith(";") &&
            !lastLine.endsWith("}")
        ) {
            // Last line looks like an expression, make it return
            const beforeLast = lines.slice(0, -1).join("\n");
            return `
            with (this) {
                return (async function() {
                    ${beforeLast}
                    return (${lastLine});
                }).call(this);
            }
        `;
        } else if (!isStatement && lastLine && lastLine.endsWith(";")) {
            // Remove trailing semicolon and return
            const beforeLast = lines.slice(0, -1).join("\n");
            const expressionPart = lastLine.slice(0, -1); // Remove semicolon
            return `
            with (this) {
                return (async function() {
                    ${beforeLast}
                    return (${expressionPart});
                }).call(this);
            }
        `;
        }

        // Default: execute as-is (will return undefined)
        return `
        with (this) {
            return (async function() {
                ${script}
            }).call(this);
        }
    `;
    }

    private convertToText = (
        value: any
    ): { text: string; language: string } => {
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
            const arr = Array.from(value as any);
            if (arr.length > 100) {
                return {
                    text: `${typeName}(${arr.length} items): [${arr.slice(0, 100).join(", ")}, ...]`,
                    language: "plaintext",
                };
            }
            return { text: JSON.stringify(arr, null, 4), language: "json" };
        }

        // Handle Promise (shouldn't happen as run() awaits them, but just in case)
        if (value && typeof value.then === "function") {
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
                    text: `[Object: ${value.constructor?.name || "Unknown"}]`,
                    language: "plaintext",
                };
            }
        }
    };
}

export const scriptRunner = new ScriptRunner();
