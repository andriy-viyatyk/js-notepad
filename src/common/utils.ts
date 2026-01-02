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

export const windowUtils = window.utils;

export function debounce<T extends (...args: any[]) => void>(
    func: T,
    delay: number,
    canRun?: () => boolean
): (...args: Parameters<T>) => void {
    let timeoutId: any = null;

    return (...args: Parameters<T>) => {
        const run = () => {
            if (!canRun || canRun()) {
                func(...args);
                return;
            }
            timeoutId = setTimeout(run, delay);
        };

        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(run, delay);
    };
}
