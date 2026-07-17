import { Panel, SegmentedControl } from "../../uikit";
import { PinnedRail } from "../../ui/sidebar/PinnedRail";
import { BuiltinEditorsList } from "../../ui/sidebar/BuiltinEditorsList";
import { TrustedBoardsList } from "../../ui/sidebar/TrustedBoardsList";
import { TrustedToolsList } from "../../ui/sidebar/TrustedToolsList";
import { SearchBoardsTab } from "./SearchBoardsTab";
import type { ToolsHubEditor, HubTab } from "./ToolsHubEditor";

/**
 * Tools & Editors hub view (EPIC-045 / US-870). A page-sized composition: a content tab strip
 * (Built-in / Registered boards / Search boards / Tools) with a Pinned rail on the right. The
 * Built-in / Registered / Tools tabs reuse the exact same components as the AppBar panel, so
 * both surfaces stay in lock-step; only the Search-boards tab is hub-specific. Pure UIKit
 * composition (editors are app code — no Emotion, UIKit Rule 7).
 */
export function ToolsHubView({ model }: { model: ToolsHubEditor }) {
    const tab = model.state.use((s) => s.tab);

    return (
        <Panel data-type="tools-hub" direction="row" width="100%" height="100%" minHeight={0}>
            <Panel direction="column" flex={1} minWidth={0} minHeight={0}>
                <Panel direction="row" paddingX="lg" paddingY="md" shrink={false}>
                    <SegmentedControl
                        name="tools-hub-tabs"
                        value={tab}
                        onChange={(v) => model.setTab(v as HubTab)}
                        items={[
                            { value: "builtin", label: "Built-in" },
                            { value: "boards", label: "Registered boards" },
                            { value: "search", label: "Search boards" },
                            { value: "tools", label: "Tools" },
                        ]}
                    />
                </Panel>
                <Panel direction="column" flex={1} minHeight={0}>
                    {tab === "builtin" ? (
                        <BuiltinEditorsList />
                    ) : tab === "boards" ? (
                        <TrustedBoardsList />
                    ) : tab === "search" ? (
                        <SearchBoardsTab />
                    ) : (
                        <TrustedToolsList />
                    )}
                </Panel>
            </Panel>
            <PinnedRail layout="vertical" />
        </Panel>
    );
}
