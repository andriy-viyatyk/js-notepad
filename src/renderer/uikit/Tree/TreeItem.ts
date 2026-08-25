import type React from "react";
import { mountVanilla } from "../shared/mount";
import type { IconRef, SlotText } from "../shared/slots";
import { TreeItemView } from "./TreeItemView";

// --- Types ---

export interface TreeItemProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onContextMenu"> {
    ref?: React.Ref<HTMLDivElement>;
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Stable id used for `aria-activedescendant` wiring. */
    id?: string;
    /** Depth — 0 for root rows, +1 per level. */
    level: number;
    /** True when the row is currently expanded. */
    expanded: boolean;
    /** True when the row has children — drives chevron visibility. */
    hasChildren: boolean;
    /** Leading icon (rendered after the chevron). */
    icon?: IconRef;
    /** Direct DOM icon used by framework-free owners; takes precedence over `icon`. */
    iconElement?: Node;
    /** Label content. Rich tree rows remain supported; string labels are highlighted. */
    label: React.ReactNode | Node;
    /** Highlight matches in string labels. */
    searchText?: string;
    /** True when this item is the current selection of its Tree. */
    selected?: boolean;
    /** True when this item is the current `activeIndex` of its Tree. */
    active?: boolean;
    /** True when this row is the source of an active drag. */
    dragging?: boolean;
    /** True when this row is the drop target under the drag cursor. */
    dropActive?: boolean;
    /** True when `loadChildren` is currently in flight for this row. */
    loading?: boolean;
    /** True when this item should not respond to clicks. */
    disabled?: boolean;
    /**
     * Tooltip body shown after the standard hover delay. When `null`, `undefined`, `false`,
     * or empty string, no tooltip is rendered.
     */
    tooltip?: SlotText;
    /** Indentation step in pixels per level. Default: 16. */
    indentSize?: number;
    /**
     * When true, no chevron and no chevron-stub placeholder are rendered for this row.
     * The icon sits flush after the row's indents. Use for non-collapsible rows
     * (e.g. a single permanent root in a tree-provider view) to avoid a leading column
     * of empty space.
     */
    hideChevron?: boolean;
    /**
     * Called when the user clicks the chevron. Tree's model owns expansion state — pass
     * `(e) => model.onChevronClick(e, idx)` from the View.
     */
    onChevronClick?: (event: MouseEvent) => void;
    /** Called when the user opens this row's context menu. */
    onContextMenu?: (event: MouseEvent) => void;
    /**
     * Optional right-aligned trailing content (e.g. a per-row action IconButton).
     * Rendered after the label, which is `flex:1 1 auto` and pushes this to the row's
     * right edge. The trailing content owns its own click handling — to avoid also
     * triggering the row's onClick, its handlers should `stopPropagation()`.
     */
    trailing?: React.ReactNode | Node;
    /**
     * When the trailing content is shown. `"always"` (default) keeps it visible at all times —
     * the original behavior, so existing consumers are unchanged. `"hover"` hides it at rest and
     * reveals it on row hover or keyboard focus-within (e.g. a per-row action that should not
     * clutter the row until pointed at). Per-row sticky state (e.g. a pinned row that should keep
     * its action visible) is expressed by passing `"always"` for that row.
     */
    trailingVisibility?: "always" | "hover";
}

// --- Component ---

export function TreeItem(props: TreeItemProps): React.ReactElement {
    return mountVanilla(TreeItemView, props);
}
