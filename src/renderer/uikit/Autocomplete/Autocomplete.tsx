import React from "react";
import { mountVanilla } from "../shared/mount";
import { AutocompleteView } from "./AutocompleteView";
import type { AutocompleteProps } from "./AutocompleteModel";

// =============================================================================
// Component
// =============================================================================

export function Autocomplete(
    props: AutocompleteProps & { ref?: React.Ref<HTMLInputElement> },
): React.ReactElement {
    return mountVanilla(AutocompleteView, props);
}

// Re-export public types from canonical location.
export type { AutocompleteProps } from "./AutocompleteModel";
