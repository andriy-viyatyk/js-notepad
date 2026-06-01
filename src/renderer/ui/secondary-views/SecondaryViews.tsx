import { useCallback, useEffect, useRef, useState } from "react";
import { CollapsiblePanel, CollapsiblePanelStack, Panel } from "../../uikit";
import type { PageModel } from "../../api/pages/PageModel";
import { secondaryViewRegistry } from "./secondary-view-registry";
import { LazySecondaryView } from "./LazySecondaryView";

// =============================================================================
// Component
// =============================================================================

interface SecondaryViewsProps {
    page: PageModel;
}

export function SecondaryViews({ page }: SecondaryViewsProps) {
    // Subscribe to page.state — re-renders on attach/detach and panel-list flips
    // (walkthrough 03 / N2).
    const { version: _version } = page.state.use();
    const panelEditors = page.panelEditors;
    const headerRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [, setHeaderRefsVersion] = useState(0);
    const [activePanel, setActivePanelLocal] = useState(page.activePanel);

    const setHeaderRef = useCallback((refKey: string, el: HTMLDivElement | null) => {
        if (el && headerRefs.current[refKey] !== el) {
            headerRefs.current[refKey] = el;
            setHeaderRefsVersion((v) => v + 1);
        }
    }, []);

    // Sync local activePanel when PageModel changes.
    useEffect(() => {
        if (page.activePanel !== activePanel) {
            setActivePanelLocal(page.activePanel);
        }
    }, [page.activePanel, _version]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSetActivePanel = useCallback((panelId: string) => {
        if (panelId === activePanel) return;
        page.setActivePanel(panelId);
        setActivePanelLocal(panelId);
    }, [page, activePanel]);

    return (
        <Panel
            name="secondary-views-root"
            direction="column"
            height="100%"
            overflow="hidden"
            background="default"
        >
            <CollapsiblePanelStack
                name="secondary-views-stack"
                activePanel={activePanel}
                setActivePanel={handleSetActivePanel}
                height="100%"
            >
                {panelEditors.flatMap((model) => {
                    const panelIds = (model.state.get() as { secondaryView?: string[] }).secondaryView;
                    if (!panelIds?.length) return [];
                    return panelIds.map((panelId) => {
                        const def = secondaryViewRegistry.get(panelId);
                        if (!def) return null;
                        const refKey = `${model.id}-${panelId}`;
                        return (
                            <CollapsiblePanel
                                key={refKey}
                                id={panelId}
                                name={panelId}
                                headerRef={(el) => setHeaderRef(refKey, el)}
                                alwaysRenderContent
                            >
                                <LazySecondaryView
                                    model={model as never}
                                    editorId={panelId}
                                    headerRef={headerRefs.current[refKey] ?? null}
                                />
                            </CollapsiblePanel>
                        );
                    });
                })}
            </CollapsiblePanelStack>
        </Panel>
    );
}
