import { createContext, useContext } from "react";
import type { LogViewEditor } from "./LogViewEditor";

const LogViewContext = createContext<LogViewEditor | null>(null);

export const LogViewProvider = LogViewContext.Provider;

export function useLogViewModel(): LogViewEditor {
    const vm = useContext(LogViewContext);
    if (!vm) throw new Error("LogViewContext not provided");
    return vm;
}
