import * as electron from "electron";
import { shapeResult } from "../../../shared/ai-vision/result-shaper";
import { errMessage } from "../../../shared/utils";
import { boardDownloadService } from "../../board-download-service";
import { getBoardRegistrationSnapshot } from "../../board-protocol-service";
import { getNetworkLogMetadata, getNetworkLogSnapshot, clearNetworkLog } from "../../network-logger";
import { downloadService } from "../../download-service";
import { openWindows } from "../../open-windows";
import { publishedBoardsService } from "../../published-boards-service";
import { torService } from "../../tor-service";

export const MAIN_SCRIPT_TIMEOUT_MS = 10_000;

export interface MainConsoleLogEntry {
    level: "log" | "error" | "warn" | "info";
    args: string[];
    timestamp: number;
}

export interface MainScriptResult {
    result: unknown;
    isError: boolean;
    timedOut?: boolean;
    consoleLogs: MainConsoleLogEntry[];
}

function serializeArg(arg: unknown): string {
    if (arg === undefined) return "undefined";
    if (arg === null) return "null";
    if (typeof arg === "string") return arg;
    if (typeof arg === "number" || typeof arg === "boolean" || typeof arg === "bigint") return String(arg);
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    try {
        return JSON.stringify(arg) ?? String(arg);
    } catch (error) {
        return errMessage(error, "Unserializable value");
    }
}

function createConsole(consoleLogs: MainConsoleLogEntry[]): Console {
    const write = (level: MainConsoleLogEntry["level"], args: unknown[]) => {
        consoleLogs.push({ level, args: args.map(serializeArg), timestamp: Date.now() });
    };
    return {
        log: (...args: unknown[]) => write("log", args),
        error: (...args: unknown[]) => write("error", args),
        warn: (...args: unknown[]) => write("warn", args),
        info: (...args: unknown[]) => write("info", args),
    } as Console;
}

function findLastTopLevelSemicolon(script: string): number {
    let quote: "'" | '"' | "`" | undefined;
    let escaped = false;
    let depth = 0;
    let last = -1;
    for (let index = 0; index < script.length; index++) {
        const character = script[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === quote) quote = undefined;
            continue;
        }
        if (character === "'" || character === '"' || character === "`") {
            quote = character;
        } else if ("([{".includes(character)) {
            depth++;
        } else if (")]}".includes(character)) {
            depth = Math.max(0, depth - 1);
        } else if (character === ";" && depth === 0) {
            last = index;
        }
    }
    return last;
}

function hasTopLevelReturn(script: string): boolean {
    return script.split("\n").some(line => /^\s*return\b/.test(line));
}

function isExpression(text: string): boolean {
    return !!text && !/^(const|let|var|if|for|while|do|switch|function|class|try|throw|return)\b/.test(text) && !/[}\]]\s*$/.test(text);
}

function statementBody(script: string): string {
    const trimmed = script.trim();
    if (hasTopLevelReturn(trimmed)) return trimmed;

    let end = trimmed.length;
    while (end > 0 && /\s/.test(trimmed[end - 1])) end--;
    if (trimmed[end - 1] === ";") end--;
    const withoutTrailingSemicolon = trimmed.slice(0, end).trimEnd();
    const semicolon = findLastTopLevelSemicolon(withoutTrailingSemicolon);
    const lastExpression = withoutTrailingSemicolon.slice(semicolon + 1).trim();
    if (!isExpression(lastExpression)) return trimmed;
    return `${trimmed}\nreturn (${lastExpression});`;
}

function evaluateMainScript(code: string, scope: Record<string, unknown>): Promise<unknown> {
    const names = Object.keys(scope);
    const values = Object.values(scope);
    const expressionSource = `return (async function () { return (${code}); }).call(this);`;
    let evaluator: (...args: unknown[]) => Promise<unknown>;
    try {
        evaluator = new Function(...names, expressionSource) as (...args: unknown[]) => Promise<unknown>;
    } catch {
        const statementSource = `return (async function () { ${statementBody(code)} }).call(this);`;
        evaluator = new Function(...names, statementSource) as (...args: unknown[]) => Promise<unknown>;
    }
    return evaluator(...values);
}

function createScope(consoleLogs: MainConsoleLogEntry[]): Record<string, unknown> {
    const boardProtocol = {
        getRegistrations: getBoardRegistrationSnapshot,
    };
    const networkLogger = {
        getSnapshot: getNetworkLogSnapshot,
        get: getNetworkLogMetadata,
        clear: clearNetworkLog,
    };
    return {
        electron,
        openWindows,
        torService,
        downloadService,
        boardDownloadService,
        publishedBoardsService,
        boardProtocol,
        networkLogger,
        console: createConsole(consoleLogs),
    };
}

type EvaluationOutcome =
    | { type: "value"; value: unknown }
    | { type: "error"; error: unknown }
    | { type: "timeout" };

export async function executeMainScript(code: string): Promise<MainScriptResult> {
    const consoleLogs: MainConsoleLogEntry[] = [];
    const evaluation = Promise.resolve().then(() => evaluateMainScript(code, createScope(consoleLogs)));
    const observed: Promise<EvaluationOutcome> = evaluation.then(
        value => ({ type: "value", value }),
        error => ({ type: "error", error }),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<EvaluationOutcome>(resolve => {
        timer = setTimeout(() => resolve({ type: "timeout" }), MAIN_SCRIPT_TIMEOUT_MS);
    });

    try {
        const outcome = await Promise.race([observed, timeout]);
        if (outcome.type === "timeout") {
            return {
                result: "Main-process script timed out after 10 seconds; an async evaluation may still be running because a JavaScript promise cannot be cancelled by Promise.race.",
                isError: true,
                timedOut: true,
                consoleLogs,
            };
        }
        if (outcome.type === "error") {
            return { result: errMessage(outcome.error), isError: true, consoleLogs };
        }
        return { result: shapeResult(outcome.value).result, isError: false, consoleLogs };
    } catch (error) {
        return { result: errMessage(error), isError: true, consoleLogs };
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}
