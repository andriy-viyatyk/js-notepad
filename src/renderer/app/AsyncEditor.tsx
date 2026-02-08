import styled from "@emotion/styled";
import { EditorPageModule } from "../editors/types";
import { PageModel } from "../editors/base";
import { useEffect, useState } from "react";
import { CircularProgress } from "../components/basic/CircularProgress";

const ProgressRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
});

// Module cache to avoid reloading and prevent height jumps during editor switches
const moduleCache = new Map<string, EditorPageModule>();

export interface AsyncEditorProps {
    getEditorModule: () => Promise<EditorPageModule>;
    model: PageModel;
    /** Unique identifier for caching the loaded module (e.g., editor type) */
    cacheKey?: string;
}

export function AsyncEditor({ getEditorModule, model, cacheKey }: AsyncEditorProps) {
    // Check cache first for instant render (only if cacheKey provided)
    const cachedModule = cacheKey ? moduleCache.get(cacheKey) : undefined;
    const [EditorModule, setEditorModule] = useState<EditorPageModule | null>(
        cachedModule ?? null
    );

    useEffect(() => {
        // Skip if already cached
        if (cacheKey) {
            const cached = moduleCache.get(cacheKey);
            if (cached) {
                if (EditorModule !== cached) {
                    setEditorModule(cached);
                }
                return;
            }
        }

        getEditorModule().then((module) => {
            if (cacheKey) {
                moduleCache.set(cacheKey, module);
            }
            setEditorModule(module);
        });
    }, [getEditorModule, cacheKey]);

    if (!EditorModule) {
        return (
            <ProgressRoot>
                <CircularProgress size={16}/>
            </ProgressRoot>
        );
    }

    return <EditorModule.Editor model={model} />;
}

export type AsyncEditorComponent = typeof AsyncEditor;
