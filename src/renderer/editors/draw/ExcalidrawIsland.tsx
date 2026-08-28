// This is the single sanctioned React file in the renderer for the Excalidraw
// vendor island. @excalidraw/excalidraw@0.18.1 requires React through its
// react/react-dom peer dependencies and has no non-React entry point. Epic F
// will add an ESLint rule confining react imports to editors/draw/**.
//
// The existing source comments disagree about whether EXCALIDRAW_ASSET_PATH is
// read at vendor module-init time or before component mount. The observable
// working contract is the latter, but this island preserves today's ordering
// rather than resolving that uncertainty.
import { useCallback, useState } from "react";
import { Excalidraw, THEME, useHandleLibrary } from "@excalidraw/excalidraw";
import type {
    ExcalidrawImperativeAPI,
    ExcalidrawInitialDataState,
    ExcalidrawProps,
} from "@excalidraw/excalidraw/dist/types/excalidraw/types";
import type { LibraryPersistenceAdapter } from "@excalidraw/excalidraw/dist/types/excalidraw/data/library";
// eslint-disable-next-line import/no-unresolved -- CSS subpath; bundled by Vite, not by ESLint's TS resolver
import "@excalidraw/excalidraw/index.css";

const LIBRARY_RETURN_URL = "https://jsnotepad.excalidraw-library/";
const UI_OPTIONS: NonNullable<ExcalidrawProps["UIOptions"]> = {
    canvasActions: {
        loadScene: false,
        saveToActiveFile: false,
        export: false,
        toggleTheme: false,
    },
};

// Excalidraw reads these globals at module-init time. Augment Window so the
// assignments below typecheck without `any`.
declare global {
    interface Window {
        EXCALIDRAW_ASSET_PATH?: string;
        __EXCALIDRAW_ASSET_PATH_SET?: boolean;
    }
}

// Set Excalidraw asset path to local fonts (must be set before component mounts)
if (!window.__EXCALIDRAW_ASSET_PATH_SET) {
    window.EXCALIDRAW_ASSET_PATH = "app-asset://excalidraw/";
    window.__EXCALIDRAW_ASSET_PATH_SET = true;
}

export interface ExcalidrawIslandProps {
    theme: typeof THEME[keyof typeof THEME];
    initialData: ExcalidrawInitialDataState;
    libraryAdapter: LibraryPersistenceAdapter;
    onApi: NonNullable<ExcalidrawProps["excalidrawAPI"]>;
    onChange: NonNullable<ExcalidrawProps["onChange"]>;
}

export function ExcalidrawIsland({
    theme,
    initialData,
    libraryAdapter,
    onApi,
    onChange,
}: ExcalidrawIslandProps) {
    const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
    const handleApi = useCallback((api: ExcalidrawImperativeAPI) => {
        onApi(api);
        setExcalidrawAPI(api);
    }, [onApi]);

    useHandleLibrary({ excalidrawAPI, adapter: libraryAdapter });

    return (
        <Excalidraw
            excalidrawAPI={handleApi}
            libraryReturnUrl={LIBRARY_RETURN_URL}
            initialData={initialData}
            theme={theme}
            onChange={onChange}
            UIOptions={UI_OPTIONS}
        />
    );
}

export function createExcalidrawIslandElement(
    props: ExcalidrawIslandProps,
) {
    return <ExcalidrawIsland {...props} />;
}

export { LIBRARY_RETURN_URL };
