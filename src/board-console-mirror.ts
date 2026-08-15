import { errMessage } from "./shared/utils";

/** Install diagnostics that the board frame reports to its host renderer. */
export function installBoardDiagnostics(hostPostTarget: string): void {
    const postHostError = (message: string): void => {
        try {
            window.parent.postMessage({ __persephone: "board:error", message }, hostPostTarget);
        } catch {
            // parent gone — nothing to report to
        }
    };

    document.addEventListener("securitypolicyviolation", (event) => {
        postHostError(`CSP violation: ${event.violatedDirective} blocked ${event.blockedURI || "(inline)"}`);
    });
    window.addEventListener("error", (event) => {
        postHostError(`script error: ${event.message}${event.filename ? ` (${event.filename}:${event.lineno})` : ""}`);
    });
    window.addEventListener("unhandledrejection", (event) => {
        postHostError(`unhandled rejection: ${errMessage((event as PromiseRejectionEvent).reason)}`);
    });

    const formatConsoleArg = (arg: unknown): string => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return arg.stack || arg.message;
        try { return JSON.stringify(arg); } catch { return String(arg); }
    };
    const mirrorConsole = (level: "warn" | "error"): void => {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]) => {
            original(...args);
            try {
                const message = args.map(formatConsoleArg).join(" ").slice(0, 4000);
                window.parent.postMessage({ __persephone: "board:log", level, message: `console.${level}: ${message}` }, hostPostTarget);
            } catch { /* parent gone */ }
        };
    };
    mirrorConsole("warn");
    mirrorConsole("error");
}
