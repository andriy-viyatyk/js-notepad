import { useEffect, useState, type ComponentType } from "react";
import { secondaryEditorRegistry, type SecondaryEditorProps } from "./secondary-editor-registry";
import type { EditorOrHost } from "../../editors/base";
import color from "../../theme/color";

interface LazySecondaryEditorProps {
    model: EditorOrHost;
    editorId: string;
    headerRef: HTMLDivElement | null;
}

/** Loads a secondary editor component from the registry and renders it. */
export function LazySecondaryEditor({ model, editorId, headerRef }: LazySecondaryEditorProps) {
    const [Component, setComponent] = useState<ComponentType<SecondaryEditorProps> | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const def = secondaryEditorRegistry.get(editorId);
        if (!def) {
            setError(`Unknown secondary editor: "${editorId}"`);
            return;
        }
        let cancelled = false;
        def.loadComponent().then((mod) => {
            if (!cancelled) setComponent(() => mod.default);
        }).catch((err) => {
            if (!cancelled) setError(String(err));
        });
        return () => { cancelled = true; };
    }, [editorId]);

    if (error) return <div style={{ padding: 8, color: color.text.light }}>{error}</div>;
    if (!Component) return null;
    return <Component model={model} headerRef={headerRef} />;
}
