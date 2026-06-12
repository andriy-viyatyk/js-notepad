import { useCallback, useRef, useState } from "react";
import { CollapsiblePanel, CollapsiblePanelStack, Panel, Splitter } from "../../uikit";
import type { EditorModel } from "../../editors/base/EditorModel";
import type { ISecondaryViewsState } from "./SecondaryViewsModel";
import { secondaryViewRegistry } from "./secondary-view-registry";
import { LazySecondaryView } from "./LazySecondaryView";
import { panelKey, isCompositePanelKey } from "./panel-key";
import { EditorIcon } from "../../components/icons/EditorIcon";

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

    // Enumerate every (model, panelId) pair the page's models expose — no
    // restriction on panel-id uniqueness (US-619). A rendered panel's identity
    // is the composite `${model.id}::${panelId}`, so two models contributing the
    // same panel type (e.g. two git repos' "Changes") render as independent,
    // independently-expandable panels. The registry lookup stays on the BARE
    // panelId, so one registered component serves every instance.
    const rendered = views.flatMap((model) => {
        const panelIds = (model.state.get() as { secondaryView?: string[] }).secondaryView;
        if (!panelIds?.length) return [];
        return panelIds
            .filter((panelId) => secondaryViewRegistry.has(panelId))
            .map((panelId) => ({
                model,
                panelId,
                key: panelKey(model.id, panelId),
                refKey: `${model.id}-${panelId}`,
            }));
    });

    // Resolve a bare `activePanel` (the default "explorer" seed, or any
    // pre-US-619 persisted bare id) to its composite so the right panel is
    // expanded. After any user toggle, `state.activePanel` is already composite.
    let activeKey = state.activePanel;
    if (!isCompositePanelKey(activeKey)) {
        const hit = rendered.find((p) => p.panelId === activeKey);
        if (hit) activeKey = hit.key;
    }

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
                    activePanel={activeKey}
                    setActivePanel={(id) => setState({ activePanel: id })}
                    height="100%"
                >
                    {rendered.map(({ model, panelId, key, refKey }) => {
                        // Panel header icon: a registry per-panel override (e.g. the
                        // Explorer "search" panel's SearchIcon) wins; otherwise the
                        // owning editor's icon — the same glyph that editor shows on
                        // its page tab — so panels from different editors are
                        // distinguishable at a glance.
                        const panelIcon =
                            secondaryViewRegistry.get(panelId)?.icon ?? (
                                <EditorIcon editor={model} />
                            );
                        return (
                            <CollapsiblePanel
                                key={refKey}
                                id={key}
                                name={panelId}
                                icon={panelIcon}
                                headerRef={(el) => setHeaderRef(refKey, el)}
                                alwaysRenderContent
                            >
                                <LazySecondaryView
                                    model={model as never}
                                    panelId={panelId}
                                    headerRef={headerRefs.current[refKey] ?? null}
                                />
                            </CollapsiblePanel>
                        );
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
