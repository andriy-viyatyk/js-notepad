import React from "react";

import { mountVanilla, type VanillaViewCtor } from "../shared/mount";
import { DataGridView } from "./DataGridView";
import type { DataGridProps } from "./types";

/**
 * The React boundary for `DataGridView`.
 *
 * Three lines on purpose: no Emotion, no JSX of its own, no memoization. `mountVanilla` already
 * keeps the view alive across renders — it replaces the view only when the constructor identity
 * changes — and every prop-forwarding decision belongs to `DataGridView`, which is the file a
 * vanilla consumer uses directly.
 */
export function DataGrid<R = any>(props: DataGridProps<R>): React.ReactElement {
    return mountVanilla(
        DataGridView as VanillaViewCtor<DataGridProps<R>>,
        props,
    );
}
