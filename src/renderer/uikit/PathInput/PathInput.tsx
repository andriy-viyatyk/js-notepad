import React from "react";
import { mountVanilla } from "../shared/mount";
import { PathInputView } from "./PathInputView";
import type { PathInputProps } from "./PathInputModel";

export function PathInput({ ref, ...props }: PathInputProps & { ref?: React.Ref<HTMLInputElement> }) {
    return mountVanilla(PathInputView, { ...props, ref });
}

// Re-export the public type from its canonical location (the model file).
export type { PathInputProps } from "./PathInputModel";
