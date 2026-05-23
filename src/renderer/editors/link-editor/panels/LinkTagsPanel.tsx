import { useSyncExternalStore } from "react";
import { CategoryList, Panel } from "../../../uikit";
import type { LinkSource } from "../linkTypes";

// =============================================================================
// Component
// =============================================================================

interface LinkTagsPanelProps {
    vm: LinkSource;
}

export function LinkTagsPanel({ vm }: LinkTagsPanelProps) {
    const pageState = useSyncExternalStore(
        (cb) => vm.state.subscribe(cb),
        () => vm.state.get(),
    );

    return (
        <Panel
            name="link-tags-panel"
            direction="row"
            flex={1}
            height={0}
            overflow="hidden"
            width="100%"
        >
            <CategoryList
                name="link-tags"
                items={pageState.tags}
                value={pageState.selectedTag}
                onChange={vm.setSelectedTag}
                getCount={vm.getTagCount}
            />
        </Panel>
    );
}
