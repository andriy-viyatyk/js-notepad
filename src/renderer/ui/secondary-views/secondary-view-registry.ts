import type React from "react";
import type { EditorOrHost } from "../../editors/base";

/** Props passed to secondary view sidebar components. */
export interface SecondaryViewProps {
    model: EditorOrHost;
    /** Portal target for the panel header. Render title, buttons, etc. into this element via createPortal. */
    headerRef: HTMLDivElement | null;
}

/** Registration for a secondary view type. */
interface SecondaryViewDefinition {
    /** Unique ID matching IEditorState.secondaryView values. */
    id: string;
    /** Display label for the panel header. */
    label: string;
    /** Dynamic import of the sidebar component. */
    loadComponent: () => Promise<{ default: React.ComponentType<SecondaryViewProps> }>;
}

class SecondaryViewRegistry {
    private editors = new Map<string, SecondaryViewDefinition>();

    register(definition: SecondaryViewDefinition): void {
        this.editors.set(definition.id, definition);
    }

    get(id: string): SecondaryViewDefinition | undefined {
        return this.editors.get(id);
    }

    has(id: string): boolean {
        return this.editors.has(id);
    }
}

export const secondaryViewRegistry = new SecondaryViewRegistry();
