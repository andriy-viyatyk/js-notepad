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
