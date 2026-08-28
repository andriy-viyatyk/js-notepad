import { getSucraseTransform } from "./transpile";

const fs = require("fs") as typeof import("fs");
import { fpJoin, fpResolve } from "../core/utils/file-path";

let extensionsRegistered = false;

/**
 * Prefix injected at the top of every library module loaded via require().
 * Reads context from globalThis.__activeScriptContext__ which is set by
 * ScriptContext.customRequire() before calling native require().
 *
 * `ui` is NOT included — it's a lazy getter on globalThis (stack-based per context).
 */
const MODULE_CONTEXT_PREFIX =
    "var __ctx=globalThis.__activeScriptContext__" +
    ",app=__ctx?.app,page=__ctx?.page,io=__ctx?.io,ai=__ctx?.ai" +
    ",styledText=__ctx?.styledText,preventOutput=__ctx?.preventOutput" +
    ",require=__ctx?.customRequire||require" +
    ",console=__ctx?.console||console;\n";

/**
 * Register custom extension handlers for Node.js require():
 * - `.ts` — transpiles TypeScript + ES module imports via sucrase
 * - `.js` — transpiles ES module imports via sucrase (for library files using export/import)
 *
 * Both handlers inject context globals so library modules have access to the
 * same context as the calling script. Context is read from
 * globalThis.__activeScriptContext__ (set by ScriptContext.customRequire).
 *
 * The `.js` handler only applies to files inside the library folder to avoid
 * breaking non-library CommonJS modules.
 *
 * Must be called after `ensureSucraseLoaded()`.
 */
export function registerLibraryExtensions(libraryPath: string): void {
    if (extensionsRegistered) return;
    extensionsRegistered = true;

    const originalJsHandler = require.extensions[".js"];
    const normalizedLibPath = fpResolve(libraryPath);

    require.extensions[".ts"] = (module: NodeModule, filename: string) => {
        const transform = getSucraseTransform();
        if (!transform || !globalThis.__activeScriptContext__) {
            originalJsHandler(module, filename);
            return;
        }

        const code = fs.readFileSync(filename, "utf-8");
        const { code: compiled } = transform(code, {
            transforms: ["typescript", "imports"],
            filePath: filename,
        });
        (module as NodeModule & { _compile(code: string, filename: string): void })._compile(MODULE_CONTEXT_PREFIX + compiled, filename);
    };

    require.extensions[".js"] = (module: NodeModule, filename: string) => {
        // Only transpile .js files inside the library folder
        const transform = getSucraseTransform();
        if (transform && globalThis.__activeScriptContext__ && fpResolve(filename).startsWith(normalizedLibPath)) {
            const code = fs.readFileSync(filename, "utf-8");
            const { code: compiled } = transform(code, {
                transforms: ["imports"],
                filePath: filename,
            });
            (module as NodeModule & { _compile(code: string, filename: string): void })._compile(MODULE_CONTEXT_PREFIX + compiled, filename);
            return;
        }

        // Non-library .js files use the original handler
        originalJsHandler(module, filename);
    };
}

/**
 * Clear all require.cache entries under the library folder.
 * Called when library files change (file watcher).
 */
export function clearLibraryRequireCache(libraryPath: string): void {
    const normalizedLibPath = fpResolve(libraryPath);
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(normalizedLibPath)) {
            delete require.cache[key];
        }
    }
}

/**
 * Resolve a library module path to an absolute file path.
 * Tries: exact, .ts, .js, /index.ts, /index.js
 */
export function resolveLibraryModule(libraryPath: string, modulePath: string): string {
    const basePath = fpJoin(libraryPath, modulePath);

    // Try exact path first
    const candidates = [
        basePath,
        basePath + ".ts",
        basePath + ".js",
        fpJoin(basePath, "index.ts"),
        fpJoin(basePath, "index.js"),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
        }
    }

    throw new Error(
        `Library module not found: "library/${modulePath}"\n` +
        `Searched in: ${basePath} (.ts, .js, /index.ts, /index.js)`
    );
}
