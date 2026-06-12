import { useMemo } from "react";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../../ui/secondary-views/SideBarPanelHeader";
import { Panel } from "../../../uikit";
import { traited } from "../../../core/traits/traits";
import {
    RequestTree,
    buildGroupedTree,
    requestTreeItemTraits,
    type RequestTreeItem,
} from "../RestClientShared";
import { RestClientEditor } from "../RestClientEditor";

export default function RestPanelSecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    // Type-guard early return must precede any hooks; the hook-using body lives
    // in an inner component (same pattern as TodoSecondaryView).
    if (!(model instanceof RestClientEditor)) return null;
    return <RestPanelBody editor={model} headerRef={headerRef} icon={icon} />;
}

function RestPanelBody({
    editor,
    headerRef,
    icon,
}: {
    editor: RestClientEditor;
    headerRef: SecondaryViewProps["headerRef"];
    icon: SecondaryViewProps["icon"];
}) {
    const state = editor.state.use((s) => ({
        requests: s.data.requests,
        selectedRequestId: s.selectedRequestId,
    }));

    // Root-wrapped tree — moved verbatim from RestClientBody. The "__root__"
    // node renders the "REQUESTS" label + "+" add button inside the tree.
    const rootItem = useMemo<RequestTreeItem>(
        () => ({ id: "__root__", isRoot: true, items: buildGroupedTree(state.requests) }),
        [state.requests],
    );
    const tItems = useMemo(() => traited([rootItem], requestTreeItemTraits), [rootItem]);

    return (
        <>
            <SideBarPanelHeader headerRef={headerRef} icon={icon} title="Rest" />
            <Panel
                name="rest-panel-pane"
                direction="column"
                flex={1}
                overflow="auto"
                minHeight={0}
                minWidth={0}
            >
                <RequestTree vm={editor} items={tItems} selectedId={state.selectedRequestId} />
            </Panel>
        </>
    );
}
