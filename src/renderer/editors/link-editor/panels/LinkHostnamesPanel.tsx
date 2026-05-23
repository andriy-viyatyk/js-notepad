import { useSyncExternalStore } from "react";
import { CategoryList, Panel } from "../../../uikit";
import type { LinkSource } from "../linkTypes";

// =============================================================================
// Component
// =============================================================================

interface LinkHostnamesPanelProps {
    vm: LinkSource;
}

export function LinkHostnamesPanel({ vm }: LinkHostnamesPanelProps) {
    const pageState = useSyncExternalStore(
        (cb) => vm.state.subscribe(cb),
        () => vm.state.get(),
    );

    return (
        <Panel
            name="link-hostnames-panel"
            direction="row"
            flex={1}
            height={0}
            overflow="hidden"
            width="100%"
        >
            <CategoryList
                name="link-hostnames"
                items={pageState.hostnames}
                value={pageState.selectedHostname}
                onChange={vm.setSelectedHostname}
                getCount={vm.getHostnameCount}
                separator={"\0"}
                rootLabel="All"
            />
        </Panel>
    );
}
