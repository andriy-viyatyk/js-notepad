import { useCallback, useRef, useState } from "react";
import { CollapsiblePanel, CollapsiblePanelStack, Panel, Splitter } from "../../uikit";
import type { EditorModel } from "../../editors/base/EditorModel";
import type { ISecondaryViewsState } from "./SecondaryViewsModel";
import { secondaryViewRegistry } from "./secondary-view-registry";
import { LazySecondaryView } from "./LazySecondaryView";

// =============================================================================
// Component
// =============================================================================

interface SecondaryViewsProps {
    /** Panel-contributing editors (= owner.panelEditors). The owner subscribes
     *  to editor/panel-list changes and hands a fresh array down; this component
     *  subscribes to nothing. */
    views: EditorModel[];
    /** Controlled layout state, owner-held. */
    state: ISecondaryViewsState;
    /** Owner-provided setState — carries side effects (onPanelExpanded,
     *  secondaryViewsToggled). */
    setState: (patch: Partial<ISecondaryViewsState>) => void;
}

/**
 * SecondaryViews — the controlled sidebar host. Purely presentational: it reads
 * `views`/`state`/`setState` from props and subscribes to no store. Self-contained
 * (owns its container Panel + Splitter) so it can be mounted by any host.
 */
export function SecondaryViews({ views, state, setState }: SecondaryViewsProps) {
    const headerRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [, setHeaderRefsVersion] = useState(0);

    const setHeaderRef = useCallback((refKey: string, el: HTMLDivElement | null) => {
        if (el && headerRefs.current[refKey] !== el) {
            headerRefs.current[refKey] = el;
            setHeaderRefsVersion((v) => v + 1);
        }
    }, []);

    if (!state.open) return null;

    return (
        <>
            <Panel
                name="secondary-views-container"
                direction="column"
                width={state.width}
                shrink={false}
                overflow="hidden"
                height="100%"
                background="default"
            >
                <CollapsiblePanelStack
                    name="secondary-views-stack"
                    activePanel={state.activePanel}
                    setActivePanel={(id) => setState({ activePanel: id })}
                    height="100%"
                >
                    {views.flatMap((model) => {
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
            <Splitter
                name="secondary-views-splitter"
                orientation="vertical"
                value={state.width}
                onChange={(w) => setState({ width: w })}
                side="before"
                min={120}
                border="after"
                background="default"
                hoverBackground="light"
            />
        </>
    );
}
