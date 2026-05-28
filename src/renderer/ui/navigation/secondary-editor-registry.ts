import type React from "react";
import type { EditorOrHost } from "../../editors/base";

/** Props passed to secondary editor sidebar components. */
export interface SecondaryEditorProps {
    model: EditorOrHost;
    /** Portal target for the panel header. Render title, buttons, etc. into this element via createPortal. */
    headerRef: HTMLDivElement | null;
}

/** Registration for a secondary editor type. */
interface SecondaryEditorDefinition {
    /** Unique ID matching IEditorState.secondaryEditor values. */
    id: string;
    /** Display label for the panel header. */
    label: string;
    /** Dynamic import of the sidebar component. */
    loadComponent: () => Promise<{ default: React.ComponentType<SecondaryEditorProps> }>;
}

class SecondaryEditorRegistry {
    private editors = new Map<string, SecondaryEditorDefinition>();

    register(definition: SecondaryEditorDefinition): void {
        this.editors.set(definition.id, definition);
    }

    get(id: string): SecondaryEditorDefinition | undefined {
        return this.editors.get(id);
    }

    has(id: string): boolean {
        return this.editors.has(id);
    }
}

export const secondaryEditorRegistry = new SecondaryEditorRegistry();
