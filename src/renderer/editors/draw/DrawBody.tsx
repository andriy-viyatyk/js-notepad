import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, FONT_FAMILY, THEME, useHandleLibrary } from "@excalidraw/excalidraw";
import type {
    ExcalidrawImperativeAPI,
    AppState,
    BinaryFiles,
    LibraryItemsSource,
} from "@excalidraw/excalidraw/dist/types/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/dist/types/excalidraw/element/types";
// eslint-disable-next-line import/no-unresolved -- CSS subpath; bundled by Vite, not by ESLint's TS resolver
import "@excalidraw/excalidraw/index.css";
import { Panel } from "../../uikit/Panel";
import { Spinner } from "../../uikit/Spinner";
import { EditorError } from "../base/EditorError";
import { ui } from "../../api/ui";
import { pagesModel } from "../../api/pages";
import { browserUrlChanged } from "../../core/state/events";
import type { DrawEditor } from "./DrawEditor";
import { createLibraryAdapter, initDefaultLibraryPath } from "./drawLibrary";
import { errMessage } from "../../../shared/utils";

const LIBRARY_RETURN_URL = "https://jsnotepad.excalidraw-library/";

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

interface DrawBodyProps {
    model: DrawEditor;
}

export function DrawBody({ model: editor }: DrawBodyProps) {
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
    const { loading, error, darkMode } = editor.state.use((s) => ({
        loading: s.loading,
        error: s.error,
        darkMode: s.darkMode,
    }));

    const excalidrawTheme = darkMode ? THEME.DARK : THEME.LIGHT;

    // Cleanup on unmount — clear debounce timer + release editor's API ref.
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            editor.clearExcalidrawApi();
        };
    }, [editor]);

    // ── Library persistence (DR15 — view-local effect) ─────────────────
    const libraryAdapter = useMemo(() => createLibraryAdapter(), []);
    useEffect(() => { initDefaultLibraryPath(); }, []);
    useHandleLibrary({ excalidrawAPI, adapter: libraryAdapter });

    // Intercept "Browse libraries" <a> click → open in internal browser.
    const handleWrapperClick = useCallback((e: React.MouseEvent) => {
        const anchor = (e.target as HTMLElement).closest("a.library-menu-browse-button");
        if (anchor) {
            e.preventDefault();
            const href = anchor.getAttribute("href");
            if (href) pagesModel.openUrlInBrowserTab(href);
        }
    }, []);

    // Listen for browser URL changes → handle Excalidraw library install URLs.
    useEffect(() => {
        const sub = browserUrlChanged.subscribe((event) => {
            const api = editor.excalidrawApi;
            if (!event || event.handled || !api) return;
            const { url } = event;
            if (!url.startsWith(LIBRARY_RETURN_URL)) return;
            const hashIndex = url.indexOf("#");
            if (hashIndex === -1) return;
            const params = new URLSearchParams(url.slice(hashIndex + 1));
            const libraryUrl = params.get("addLibrary");
            if (!libraryUrl) return;
            event.handled = true;
            const hostId = editor.host?.state.get().id;
            if (hostId) pagesModel.showPage(hostId);
            const decoded = decodeURIComponent(libraryUrl);
            fetch(decoded)
                .then((res) => res.blob())
                .then((blob) => {
                    api.updateLibrary({
                        libraryItems: blob as unknown as LibraryItemsSource,
                        merge: true,
                        prompt: true,
                        openLibraryMenu: true,
                    });
                })
                .catch((err) => {
                    ui.notify(`Failed to install library: ${errMessage(err)}`, "error");
                });
        });
        return () => sub.unsubscribe();
    }, [editor]);

    // Debounced Excalidraw onChange → editor.updateFromExcalidraw.
    const handleChange = useCallback(
        (
            elements: readonly OrderedExcalidrawElement[],
            appState: AppState,
            files: BinaryFiles,
        ) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                editor.updateFromExcalidraw(elements, appState, files);
            }, 500);
        },
        [editor],
    );

    if (error) return <EditorError>{error}</EditorError>;
    if (loading) return <Spinner />;

    return (
        <Panel name="draw-root" direction="column" flex={1} overflow="hidden" position="relative">
            <div
                style={{ flex: "1 1 auto", width: "100%", height: "100%" }}
                onContextMenu={(e) => e.stopPropagation()}
                onClick={handleWrapperClick}
            >
                <Excalidraw
                    excalidrawAPI={(excApi) => {
                        editor.setExcalidrawApi(excApi);
                        setExcalidrawAPI(excApi);
                    }}
                    libraryReturnUrl={LIBRARY_RETURN_URL}
                    initialData={{
                        elements: editor.elements,
                        appState: {
                            ...editor.appState,
                            currentItemFontFamily: editor.appState.currentItemFontFamily ?? FONT_FAMILY.Helvetica,
                        },
                        files: editor.files,
                    }}
                    theme={excalidrawTheme}
                    onChange={handleChange}
                    UIOptions={{
                        canvasActions: {
                            loadScene: false,
                            saveToActiveFile: false,
                            export: false,
                            toggleTheme: false,
                        },
                    }}
                />
            </div>
        </Panel>
    );
}
