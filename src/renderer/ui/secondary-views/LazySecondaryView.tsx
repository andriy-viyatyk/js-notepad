import { useEffect, useState, type ComponentType } from "react";
import { secondaryViewRegistry, type SecondaryViewProps } from "./secondary-view-registry";
import type { EditorOrHost } from "../../editors/base";
import color from "../../theme/color";

interface LazySecondaryViewProps {
    model: EditorOrHost;
    /** Panel-type id — the registry key (NOT an editor instance id). */
    panelId: string;
    headerRef: HTMLDivElement | null;
}

/** Loads a secondary view component from the registry and renders it. */
export function LazySecondaryView({ model, panelId, headerRef }: LazySecondaryViewProps) {
    const [Component, setComponent] = useState<ComponentType<SecondaryViewProps> | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const def = secondaryViewRegistry.get(panelId);
        if (!def) {
            setError(`Unknown secondary view: "${panelId}"`);
            return;
        }
        let cancelled = false;
        def.loadComponent().then((mod) => {
            if (!cancelled) setComponent(() => mod.default);
        }).catch((err) => {
            if (!cancelled) setError(String(err));
        });
        return () => { cancelled = true; };
    }, [panelId]);

    if (error) return <div style={{ padding: 8, color: color.text.light }}>{error}</div>;
    if (!Component) return null;
    return <Component model={model} headerRef={headerRef} />;
}
