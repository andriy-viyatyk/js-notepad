import { SetStateAction } from "react";

export const isNullOrUndefined = (v: any) => v === null || v === undefined;

export function resolveState<S>(
    newState: SetStateAction<S>,
    getPrevState: () => S
): S {
    return typeof newState === "function"
        ? (newState as (prev: S) => S)(getPrevState())
        : newState;
}

export const range = (from: number, to: number) => from <= to
    ? Array.from({ length: to - from + 1 }, (_, i) => from + i)
    : Array.from({ length: from - to + 1 }, (_, i) => to + i);

export function toClipboard(text: string): void {
    navigator.clipboard.writeText(text);
}
