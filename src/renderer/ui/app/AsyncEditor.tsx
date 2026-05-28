import { EditorViewModule } from "../../editors/types";
import { EditorOrHost } from "../../editors/base";
import type { IContentHost } from "../../editors/base/IContentHost";
import { useEffect, useState } from "react";
import { Panel, Spinner } from "../../uikit";
import { EditorErrorBoundary } from "./EditorErrorBoundary";

// Module cache to avoid reloading and prevent height jumps during editor switches
const moduleCache = new Map<string, EditorViewModule>();

export interface AsyncEditorProps {
    getEditorModule: () => Promise<EditorViewModule>;
    model: EditorOrHost | IContentHost;
    /** Unique identifier for caching the loaded module (e.g., editor type) */
    cacheKey?: string;
}

interface LoadState {
    cacheKey: string | undefined;
    module: EditorViewModule;
}

export function AsyncEditor({ getEditorModule, model, cacheKey }: AsyncEditorProps) {
    // Fast path — synchronously read from the module cache. Guarantees the
    // module always matches the current `cacheKey`, with no stale-render
    // window during editor switches (grid-json → monaco etc.).
    const cachedModule = cacheKey ? moduleCache.get(cacheKey) : undefined;
    // Slow path — when `cacheKey` is uncached (cold module after app restart)
    // or absent, track the most-recently-loaded module ALONG WITH the key it
    // was loaded for. If `cacheKey` has since changed, the stored module is
    // ignored — render the spinner until the effect loads the new one.
    const [loaded, setLoaded] = useState<LoadState | null>(
        cachedModule ? { cacheKey, module: cachedModule } : null,
    );
    const loadedModule =
        loaded && loaded.cacheKey === cacheKey ? loaded.module : null;
    const EditorModule = cachedModule ?? loadedModule;

    useEffect(() => {
        if (cacheKey && moduleCache.has(cacheKey)) return;
        getEditorModule().then((module) => {
            if (cacheKey) {
                moduleCache.set(cacheKey, module);
            }
            setLoaded({ cacheKey, module });
        });
    }, [getEditorModule, cacheKey]);

    if (!EditorModule) {
        return (
            <Panel name="async-editor-loading" flex={1} align="center" justify="center">
                <Spinner name="async-editor" size={16} />
            </Panel>
        );
    }

    return (
        <EditorErrorBoundary>
            <EditorModule.Editor model={model} />
        </EditorErrorBoundary>
    );
}

export type AsyncEditorComponent = typeof AsyncEditor;
