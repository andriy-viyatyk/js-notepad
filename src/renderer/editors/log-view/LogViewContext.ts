import { createContext, useContext } from "react";
import type { LogViewEditor } from "./LogViewEditor";

/**
 * Context exposes the active `LogViewEditor` (US-553 — formerly `LogViewModel`).
 * The hook name stays `useLogViewModel` for consumer simplicity; the type
 * change propagates automatically to every descendant view.
 */

const LogViewContext = createContext<LogViewEditor | null>(null);

export const LogViewProvider = LogViewContext.Provider;

export function useLogViewModel(): LogViewEditor {
    const vm = useContext(LogViewContext);
    if (!vm) throw new Error("LogViewContext not provided");
    return vm;
}
