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

/** Format an ISO date string as YYYY-MM-DD */
export function formatDate(isoString: string): string {
    const d = new Date(isoString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function splitWithSeparators(text: string, separators: string, withTrim = true): string[] {
    // Escape special regex characters in the separators string
    const escapedSeparators = separators.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Create a character class regex from the separators
    const regex = new RegExp(`[${escapedSeparators}]`);

    let res = text.split(regex);
    if (withTrim) {
        res = res.map(part => part.trim()).filter(part => part);
    }
    return res;
}
