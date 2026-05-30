import { transpileIfNeeded, ensureSucraseLoaded } from "./transpile";
import { registerLibraryExtensions, clearLibraryRequireCache } from "./library-require";
import { settings } from "../api/settings";
import type { ScriptContext } from "./ScriptContext";

/**
 * Prefix for top-level scripts executed via fn.call(context).
 * Reads context properties from `this` (the ScriptContext instance).
 * `ui` is NOT included — it's a lazy getter on globalThis (stack-based per context).
 */
const SCRIPT_PREFIX =
    "var app=this.app,page=this.page,io=this.io,ai=this.ai,React=this.React" +
    ",styledText=this.styledText,preventOutput=this.preventOutput" +
    ",require=this.customRequire" +
    ",console=this.console;\n";

/**
 * Core script execution engine. Handles TypeScript transpilation, Script Library
 * registration, expression/statement detection, implicit return wrapping,
 * and async await. Stateless singleton — context is passed as a parameter.
 *
 * Two injection mechanisms:
 * - Top-level scripts: fn.call(context) with SCRIPT_PREFIX reading from `this`
 * - Library modules: extension handler reads globalThis.__activeScriptContext__
 *   (set by ScriptContext.customRequire before native require)
 */
export class ScriptRunnerBase {
    protected libraryDirty = true;

    /** Mark library cache as dirty. Called by file watcher when library files change. */
    invalidateLibraryCache = () => {
        this.libraryDirty = true;
    };

    /**
     * Prepare and execute a script string with a given context.
     * Handles transpilation (TS → JS) and Script Library registration
     * before executing. Returns the script result.
     */
    protected async execute(script: string, context: ScriptContext, language?: string): Promise<unknown> {
        const prepared = await this.prepare(script, language);
        return this.executeInternal(prepared, context);
    }

    /**
     * Transpile TypeScript, ensure sucrase loaded for library require(),
     * and register Script Library extensions.
     */
    protected async prepare(script: string, language?: string): Promise<string> {
        script = await transpileIfNeeded(script, language);

        await ensureSucraseLoaded();

        const libraryPath = settings.get("script-library.path") as string | undefined;
        if (libraryPath) {
            registerLibraryExtensions(libraryPath);
            // Only clear cache when files actually changed (file watcher sets libraryDirty)
            if (this.libraryDirty) {
                clearLibraryRequireCache(libraryPath);
                this.libraryDirty = false;
            }
        }

        return script;
    }

    /**
     * Execute a prepared (already transpiled) script string with a given context.
     * Context globals are injected via SCRIPT_PREFIX reading from `this` (context).
     * Handles expression/statement detection, implicit return, and async await.
     */
    private async executeInternal(script: string, context: ScriptContext): Promise<unknown> {
        // Check if script contains statement keywords at the start
        const trimmedScript = script.trim();
        const statementKeywords =
            /^(const|let|var|if|for|while|do|switch|function|class|try|throw|return)\s/;
        const hasStatements = statementKeywords.test(trimmedScript);

        if (!hasStatements) {
            // Try as expression first (for simple cases like "5 + 5" or "'hello'")
            const expressionScript = `return (async function() {\n${SCRIPT_PREFIX}return (${script});\n}).call(this);`;

            try {
                const fn = new Function(expressionScript);
                const scriptResult = fn.call(context);
                return this.isPromiseLike(scriptResult)
                    ? await scriptResult
                    : scriptResult;
            } catch (expressionError) {
                // Fall through to statement handling
            }
        }

        // Try to extract the last expression and make it return
        const statementScript = this.wrapScriptWithImplicitReturn(script);
        const fn = new Function(statementScript);
        const scriptResult = fn.call(context);
        return this.isPromiseLike(scriptResult)
            ? await scriptResult
            : scriptResult;
    }

    private wrapScriptWithImplicitReturn(script: string): string {
        const lines = script.trim().split("\n");

        // If there's a top-level return statement, use as-is
        if (this.hasTopLevelReturn(script)) {
            return `return (async function() {\n${SCRIPT_PREFIX}${script}\n}).call(this);`;
        }

        // Try to make the last line/statement return its value
        const lastLine = lines[lines.length - 1].trim();

        // Check if last line looks like an expression (not a statement or block closer)
        const isStatement =
            /^(const|let|var|if|for|while|do|switch|function|class|try|throw|return)\s/.test(
                lastLine
            );
        const isBlockCloser = /^[}\]]/.test(lastLine);

        if (
            !isStatement &&
            !isBlockCloser &&
            lastLine &&
            !lastLine.endsWith(";") &&
            !lastLine.endsWith("}")
        ) {
            // Last line looks like an expression, make it return
            const beforeLast = lines.slice(0, -1).join("\n");
            return `return (async function() {\n${SCRIPT_PREFIX}${beforeLast}\nreturn (${lastLine});\n}).call(this);`;
        } else if (!isStatement && !isBlockCloser && lastLine && lastLine.endsWith(";")) {
            // Remove trailing semicolon and return
            const beforeLast = lines.slice(0, -1).join("\n");
            const expressionPart = lastLine.slice(0, -1);
            return `return (async function() {\n${SCRIPT_PREFIX}${beforeLast}\nreturn (${expressionPart});\n}).call(this);`;
        }

        // If last line is a statement/block but has a trailing expression after the
        // last '}', extract it as the return value.
        // e.g., "function foo() { return 1; } foo();" → return foo()
        if ((isStatement || isBlockCloser) && /\}\s*\S/.test(lastLine)) {
            const lastBraceIdx = lastLine.lastIndexOf("}");
            const trailing = lastLine.substring(lastBraceIdx + 1).trim().replace(/;$/, "").trim();
            if (trailing &&
                !/^[}\]]/.test(trailing) &&
                !/^(const|let|var|if|for|while|do|switch|function|class|try|throw|return)\s/.test(trailing)
            ) {
                const declPart = lines.slice(0, -1).join("\n") +
                    (lines.length > 1 ? "\n" : "") +
                    lastLine.substring(0, lastBraceIdx + 1);
                return `return (async function() {\n${SCRIPT_PREFIX}${declPart}\nreturn (${trailing});\n}).call(this);`;
            }
        }

        // Default: execute as-is (will return undefined)
        return `return (async function() {\n${SCRIPT_PREFIX}${script}\n}).call(this);`;
    }

    /**
     * Check if a value is a genuine Promise-like object (not just any object with a .then method).
     * StyledLogBuilder has a .then() method for chaining styled text segments — it is NOT a Promise.
     */
    private isPromiseLike(value: unknown): boolean {
        if (value instanceof Promise) return true;
        if (!value || typeof value !== "object") return false;
        const v = value as { then?: unknown; catch?: unknown };
        return typeof v.then === "function" && typeof v.catch === "function";
    }

    /** Check if script has a top-level `return` (not inside a function/arrow body). */
    private hasTopLevelReturn(script: string): boolean {
        if (!/\breturn\b/.test(script)) return false;

        let funcDepth = 0;
        const tokens = script.match(
            /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\b(?:return|function)\b|=>|\{|\}/g
        ) || [];

        let expectFuncBody = false;
        for (const token of tokens) {
            if (token.startsWith("//") || token.startsWith("/*") ||
                token.startsWith("'") || token.startsWith('"') || token.startsWith("`")) {
                continue;
            }
            if (token === "function") { expectFuncBody = true; continue; }
            if (token === "=>") { expectFuncBody = true; continue; }
            if (token === "{") {
                if (expectFuncBody) funcDepth++;
                expectFuncBody = false;
            } else if (token === "}") {
                if (funcDepth > 0) funcDepth--;
                expectFuncBody = false;
            } else if (token === "return" && funcDepth === 0) {
                return true;
            } else {
                expectFuncBody = false;
            }
        }
        return false;
    }
}
