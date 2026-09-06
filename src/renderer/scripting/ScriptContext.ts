import { EditorOrHost } from "../editors/base";
import { pagesModel } from "../api/pages";
import { AppWrapper } from "./api-wrapper/AppWrapper";
import { PageWrapper } from "./api-wrapper/PageWrapper";
import { UiFacade } from "./api-wrapper/UiFacade";
import { styledText } from "./api-wrapper/StyledTextBuilder";
import { resolveLibraryModule } from "./library-require";
import { getOrCreateMcpLogViewEditor } from "../api/mcp/log-view-access";
import { fpResolve } from "../core/utils/file-path";
import { createIoNamespace } from "./api-wrapper/IoNamespace";
import { createAiNamespace } from "./api-wrapper/AiNamespace";

export interface ConsoleLogEntry {
    level: "log" | "error" | "warn" | "info";
    args: string[];
    timestamp: number;
}

function serializeArg(arg: unknown): string {
    if (arg === undefined) return "undefined";
    if (arg === null) return "null";
    if (typeof arg === "string") return arg;
    if (typeof arg === "number" || typeof arg === "boolean" || typeof arg === "bigint") return String(arg);
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    try {
        return JSON.stringify(arg);
    } catch {
        return String(arg);
    }
}

export interface ScriptOutputFlags {
    outputPrevented: boolean;
    groupedContentWritten: boolean;
}

const LIBRARY_PREFIX = "library/";
const nativeRequire = require;

/**
 * Script execution context. Owns all context state (app, page, customRequire,
 * console) and serves as the `this` object for script execution via
 * `fn.call(context)`.
 *
 * Each instance is independent — multiple contexts can coexist (e.g.,
 * long-lived autoload context + short-lived F5 context). The `ui` getter
 * on globalThis uses a stack-based save/restore to avoid conflicts.
 *
 * Usage:
 * - Regular scripts: create, fn.call(context), dispose in finally block.
 * - Autoload scripts: create, customRequire() each module, store instance,
 *   dispose on reload.
 */
export class ScriptContext {
    readonly releaseList: Array<() => void> = [];
    readonly outputFlags: ScriptOutputFlags = { outputPrevented: false, groupedContentWritten: false };

    // Context properties — available in scripts via prefix (var app=this.app, io=this.io, ...)
    readonly app: AppWrapper;
    readonly page: PageWrapper | undefined;
    readonly io = createIoNamespace();
    readonly ai = createAiNamespace();
    readonly styledText = styledText;
    readonly preventOutput: () => void;
    console: Console | Record<string, unknown>;
    readonly customRequire: NodeRequire;

    // Stack-based ui getter
    private previousUiDescriptor: PropertyDescriptor | undefined;

    constructor(page?: EditorOrHost, consoleLogs?: ConsoleLogEntry[], libraryPath?: string) {
        // consoleLogs is only passed for MCP-originated runs (execute_script, `call`) — that is the
        // provenance signal: browser pages such a run opens are "opened by agent".
        const isMcp = !!consoleLogs;
        this.page = page ? new PageWrapper(page, this.releaseList, this.outputFlags) : undefined;
        this.app = new AppWrapper(this.releaseList, isMcp, this.page);
        this.preventOutput = () => { this.outputFlags.outputPrevented = true; };
        this.customRequire = this.createCustomRequire(libraryPath);

        // MCP mode: basic console capture (replaced with forwarding when ui is accessed)
        if (consoleLogs) {
            this.console = {
                log: (...args: unknown[]) => { consoleLogs.push({ level: "log", args: args.map(serializeArg), timestamp: Date.now() }); },
                error: (...args: unknown[]) => { consoleLogs.push({ level: "error", args: args.map(serializeArg), timestamp: Date.now() }); },
                warn: (...args: unknown[]) => { consoleLogs.push({ level: "warn", args: args.map(serializeArg), timestamp: Date.now() }); },
                info: (...args: unknown[]) => { consoleLogs.push({ level: "info", args: args.map(serializeArg), timestamp: Date.now() }); },
            };
        } else {
            this.console = globalThis.console;
        }

        // Stack-based ui getter — save previous (e.g., autoload's) and define ours.
        // On dispose, restore previous. This ensures autoload's getter survives F5 runs.
        this.previousUiDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ui");
        let uiFacade: UiFacade | undefined;
        let uiLogPageId: string | undefined;

        const ensureFacade = () => {
            // Re-create facade if Log View page was closed by the user
            if (uiFacade && uiLogPageId && !pagesModel.findPage(uiLogPageId)) {
                uiFacade = undefined;
                uiLogPageId = undefined;
            }
            if (!uiFacade) {
                const result = initializeUiFacade(page, this.releaseList, this.outputFlags, isMcp);
                uiFacade = result.facade;
                uiLogPageId = result.pageId;
                installConsoleForwarding(uiFacade, this, consoleLogs);
            }
            return uiFacade;
        };

        // Callable proxy: await ui() yields to event loop (no Log View created),
        // ui.log() etc. lazily create the Log View facade on first property access.
        const yieldFn = () => new Promise<void>((r) => setTimeout(r, 0));
        const callableUi = new Proxy(yieldFn, {
            get: (_target, prop, receiver) => Reflect.get(ensureFacade(), prop, receiver),
            set: (_target, prop, value, receiver) => Reflect.set(ensureFacade(), prop, value, receiver),
        });

        Object.defineProperty(globalThis, "ui", {
            get: () => callableUi,
            enumerable: false,
            configurable: true,
        });
    }

    /**
     * Create a context-bound require function. Resolves `library/...` paths
     * to the Script Library folder. Sets `globalThis.__activeScriptContext__`
     * before calling native require so the extension handler can inject the
     * correct context prefix.
     *
     * Always clears the specific module from require.cache before loading
     * to ensure fresh compilation with this context's bindings.
     */
    private createCustomRequire(libraryPath?: string): NodeRequire {
        const req = ((id: string) => {
            if (typeof id === "string" && id.startsWith(LIBRARY_PREFIX)) {
                if (!libraryPath) {
                    throw new Error(
                        `Script library is not linked. Set the library folder in Settings → Script Library.`
                    );
                }
                const modulePath = id.slice(LIBRARY_PREFIX.length);
                const resolvedPath = fpResolve(resolveLibraryModule(libraryPath, modulePath));
                delete nativeRequire.cache[resolvedPath];
                globalThis.__activeScriptContext__ = this;
                try { return nativeRequire(resolvedPath); }
                finally { globalThis.__activeScriptContext__ = null; }
            }

            // Non-library require: clear cache if it's inside the library folder
            // (autoload scripts are loaded by absolute path, not library/ prefix)
            if (libraryPath) {
                try {
                    const resolved = fpResolve(nativeRequire.resolve(id));
                    if (resolved.startsWith(fpResolve(libraryPath))) {
                        delete nativeRequire.cache[resolved];
                    }
                } catch { /* resolve failed — let native require handle the error */ }
            }
            globalThis.__activeScriptContext__ = this;
            try { return nativeRequire(id); }
            finally { globalThis.__activeScriptContext__ = null; }
        }) as NodeRequire;

        req.resolve = nativeRequire.resolve;
        req.cache = nativeRequire.cache;
        req.extensions = nativeRequire.extensions;
        req.main = nativeRequire.main;
        return req;
    }

    /** Release all acquired resources (ViewModels, event subscriptions, etc.). */
    dispose() {
        // Restore previous ui getter (stack-based)
        if (this.previousUiDescriptor) {
            Object.defineProperty(globalThis, "ui", this.previousUiDescriptor);
        } else {
            Reflect.deleteProperty(globalThis, "ui");
        }

        for (const release of this.releaseList) {
            try { release(); } catch { /* don't block other releases */ }
        }
        this.releaseList.length = 0;
    }
}

// =============================================================================
// UI Facade Initialization
// =============================================================================

function initializeUiFacade(
    page: EditorOrHost | undefined,
    _releaseList: Array<() => void>,
    outputFlags: ScriptOutputFlags,
    isMcp = false,
): { facade: UiFacade; pageId: string } {
    const wasPresent = !!pagesModel.findPage("mcp-ui-log");
    const logEditor = getOrCreateMcpLogViewEditor();
    const logPageId = logEditor.page?.id ?? "mcp-ui-log";

    if (page && !wasPresent) {
        pagesModel.groupTabs(page.page?.id ?? page.id, logPageId, false);
    }

    // SF2 + LV9 — acquireViewModelSync + releaseList.push retire entirely
    // for log-view. The editor IS the consumable surface directly.

    outputFlags.groupedContentWritten = true;

    if (wasPresent) {
        logEditor.addEntry("log.info", "");
    }

    if (isMcp) {
        logEditor.addEntry("log.info", "Agent started script");
    } else {
        const title = page?.title ?? "untitled";
        logEditor.addEntry("log.info", `Script ${title} started`);
    }

    return { facade: new UiFacade(logEditor), pageId: logPageId };
}

// =============================================================================
// Console Forwarding
// =============================================================================

function installConsoleForwarding(
    facade: UiFacade,
    context: ScriptContext,
    consoleLogs?: ConsoleLogEntry[],
) {
    const formatArgs = (args: unknown[]) => args.map(serializeArg).join(" ");
    const nativeConsole = globalThis.console;

    const capture = consoleLogs
        ? (level: ConsoleLogEntry["level"], args: unknown[]) => {
            consoleLogs.push({ level, args: args.map(serializeArg), timestamp: Date.now() });
        }
        : undefined;

    context.console = {
        log: (...args: unknown[]) => {
            nativeConsole.log(...args);
            capture?.("log", args);
            if (!facade.consoleLogPrevented) facade.addConsoleEntry("log.log", formatArgs(args));
        },
        info: (...args: unknown[]) => {
            nativeConsole.info(...args);
            capture?.("info", args);
            if (!facade.consoleLogPrevented) facade.addConsoleEntry("log.info", formatArgs(args));
        },
        warn: (...args: unknown[]) => {
            nativeConsole.warn(...args);
            capture?.("warn", args);
            if (!facade.consoleWarnPrevented) facade.addConsoleEntry("log.warn", formatArgs(args));
        },
        error: (...args: unknown[]) => {
            nativeConsole.error(...args);
            capture?.("error", args);
            if (!facade.consoleErrorPrevented) facade.addConsoleEntry("log.error", formatArgs(args));
        },
        // Pass-through for non-forwarded methods
        debug: nativeConsole.debug.bind(nativeConsole),
        trace: nativeConsole.trace.bind(nativeConsole),
        dir: nativeConsole.dir.bind(nativeConsole),
        table: nativeConsole.table.bind(nativeConsole),
        clear: nativeConsole.clear.bind(nativeConsole),
        assert: nativeConsole.assert.bind(nativeConsole),
        count: nativeConsole.count.bind(nativeConsole),
        countReset: nativeConsole.countReset.bind(nativeConsole),
        group: nativeConsole.group.bind(nativeConsole),
        groupCollapsed: nativeConsole.groupCollapsed.bind(nativeConsole),
        groupEnd: nativeConsole.groupEnd.bind(nativeConsole),
        time: nativeConsole.time.bind(nativeConsole),
        timeEnd: nativeConsole.timeEnd.bind(nativeConsole),
        timeLog: nativeConsole.timeLog.bind(nativeConsole),
    };
}
