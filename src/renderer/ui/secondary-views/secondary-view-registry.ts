import type React from "react";
import type { EditorOrHost } from "../../editors/base";

/** Props passed to secondary view sidebar components. */
export interface SecondaryViewProps {
    model: EditorOrHost;
    /** The rendered panel's bare panel-id (e.g. "board-secondary:lists"). A component
     *  serving a prefix family (see `registerPrefix`) reads this to know WHICH view it
     *  is; single-id panels can ignore it. */
    panelId: string;
    /** Portal target for the panel header. Render title, buttons, etc. into this element via createPortal. */
    headerRef: HTMLDivElement | null;
    /** Resolved leading header icon (registry per-panel override ?? the owning editor's
     *  `EditorIcon`), supplied by the host. Forward to `SideBarPanelHeader`'s `icon` prop. */
    icon?: React.ReactNode;
    /** `true` when this panel is the currently-expanded one in the stack; `false`
     *  when collapsed to a header strip. Panels stay mounted while collapsed
     *  (`alwaysRenderContent`), so use this to drop header actions that only make
     *  sense when the panel body is visible. */
    expanded?: boolean;
}

/** Registration for a secondary view type. */
interface SecondaryViewDefinition {
    /** Unique ID matching IEditorState.secondaryView values. */
    id: string;
    /** Display label for the panel header. */
    label: string;
    /** Optional per-panel header icon. When set, it overrides the owning editor's
     *  icon for this panel — used by sidebar-only sub-panels that want their own
     *  glyph (e.g. the Explorer "search" panel → SearchIcon). Most panels omit this
     *  and fall back to the editor icon. */
    icon?: React.ReactNode;
    /** Dynamic import of the sidebar component. */
    loadComponent: () => Promise<{ default: React.ComponentType<SecondaryViewProps> }>;
}

class SecondaryViewRegistry {
    private editors = new Map<string, SecondaryViewDefinition>();
    /** Prefix → definition. A panel id that starts with a registered prefix resolves to
     *  that one definition; the component reads `SecondaryViewProps.panelId` to specialize
     *  (e.g. the whole `board-secondary:*` family → one generic `BoardSecondaryView`). */
    private prefixes = new Map<string, SecondaryViewDefinition>();

    register(definition: SecondaryViewDefinition): void {
        this.editors.set(definition.id, definition);
    }

    /** Register one definition for an entire id family (e.g. "board-secondary:"). */
    registerPrefix(prefix: string, definition: SecondaryViewDefinition): void {
        this.prefixes.set(prefix, definition);
    }

    get(id: string): SecondaryViewDefinition | undefined {
        const exact = this.editors.get(id);
        if (exact) return exact;
        for (const [prefix, def] of this.prefixes) {
            if (id.startsWith(prefix)) return def;
        }
        return undefined;
    }

    has(id: string): boolean {
        return this.get(id) !== undefined;
    }
}

export const secondaryViewRegistry = new SecondaryViewRegistry();
