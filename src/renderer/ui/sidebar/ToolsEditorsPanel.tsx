import { useCallback, useState } from "react";
import styled from "@emotion/styled";
import { pagesModel } from "../../api/pages";
import { NewWindowIcon } from "../../theme/icons";
import { IconButton, SegmentedControl } from "../../uikit";
import { PinnedRail } from "./PinnedRail";
import { BuiltinEditorsList } from "./BuiltinEditorsList";
import { TrustedBoardsList } from "./TrustedBoardsList";
import { TrustedToolsList } from "./TrustedToolsList";
import type { HubTab } from "../../editors/tools-hub";

// =============================================================================
// AppBar "Tools & Editors" slide-out panel. Thin composition over the shared
// PinnedRail + BuiltinEditorsList + Trusted{Boards,Tools}List. The full-page
// counterpart is the Tools & Editors hub (US-870) — reached via the header
// "Open in new tab" button. Chrome file — Emotion allowed (UIKit Rule 7).
// =============================================================================

type PanelTab = "editors" | "boards" | "tools";

/** Map the panel's current tab onto the hub's tab set when opening the hub. */
function panelTabToHubTab(tab: PanelTab): HubTab {
    return tab === "editors" ? "builtin" : tab === "boards" ? "boards" : "tools";
}

const PanelRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
}, { label: "ToolsEditorsPanelRoot" });

const HeaderBar = styled.div({
    display: "flex",
    justifyContent: "flex-end",
    padding: "4px 8px 0",
    flexShrink: 0,
}, { label: "ToolsEditorsHeaderBar" });

const TabsBar = styled.div({
    display: "flex",
    padding: "8px 12px",
    flexShrink: 0,
}, { label: "ToolsEditorsTabsBar" });

const TabBody = styled.div({
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    minHeight: 0,
}, { label: "ToolsEditorsTabBody" });

interface ToolsEditorsPanelProps {
    onClose?: () => void;
}

export function ToolsEditorsPanel({ onClose }: ToolsEditorsPanelProps) {
    const [tab, setTab] = useState<PanelTab>("editors");

    const openInNewTab = useCallback(() => {
        void pagesModel.showToolsHubPage({ tab: panelTabToHubTab(tab) });
        onClose?.();
    }, [tab, onClose]);

    return (
        <PanelRoot data-type="tools-editors-panel">
            <HeaderBar>
                <IconButton
                    name="tools-editors-open-in-tab"
                    size="sm"
                    icon={<NewWindowIcon />}
                    title="Open in new tab"
                    onClick={openInNewTab}
                />
            </HeaderBar>

            <PinnedRail layout="horizontal" onClose={onClose} />

            <TabsBar>
                <SegmentedControl
                    name="tools-editors-tabs"
                    size="sm"
                    value={tab}
                    onChange={(v) => setTab(v as PanelTab)}
                    items={[
                        { value: "editors", label: "Built-in Editors" },
                        { value: "boards", label: "Boards" },
                        { value: "tools", label: "Tools" },
                    ]}
                />
            </TabsBar>

            <TabBody>
                {tab === "editors" ? (
                    <BuiltinEditorsList onClose={onClose} />
                ) : tab === "boards" ? (
                    <TrustedBoardsList onClose={onClose} />
                ) : (
                    <TrustedToolsList onClose={onClose} />
                )}
            </TabBody>
        </PanelRoot>
    );
}
