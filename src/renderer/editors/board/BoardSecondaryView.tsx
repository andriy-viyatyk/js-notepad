import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { SideBarPanelHeader } from "../../ui/secondary-views/SideBarPanelHeader";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { boardTrust } from "../../api/board-trust";
import { parseBoardSecondaryPanelId } from "./board-secondary";
import { BoardWebview } from "./BoardWebview";
import type { BoardEditorModel } from "./BoardEditorModel";

// =============================================================================
// BoardSecondaryView — the generic component for the whole `board-secondary:*`
// panel family (EPIC-044 / US-853). One registration (see register-editors.ts)
// serves every declared secondary view; this component reads its own `panelId`
// to find WHICH view it is, then hosts a second `board://` iframe over the SAME
// BoardEditorModel as the main view — so the two frames stay synchronized through
// `persephone.state.*` (US-852). The frame is `isMain=false`: it does NOT own the
// board's automation target / CDP registration (D7), and does NOT reset ui.log.
//
// Trust is gated here exactly like BoardEditorView: an untrusted board contributes
// the panel shell but its code never runs in this sidebar frame until trusted.
// =============================================================================

export default function BoardSecondaryView({ model, panelId, headerRef, icon }: SecondaryViewProps) {
    const boardModel = model as unknown as BoardEditorModel;
    const s = boardModel.state.use((st) => ({
        boardRoot: st.boardRoot,
        selectedBoard: st.selectedBoard,
        reloadToken: st.reloadToken,
        defs: st.secondaryViewDefs,
    }));

    const viewId = parseBoardSecondaryPanelId(panelId);
    const def = s.defs?.find((d) => d.id === viewId);
    const selectedRoot = s.selectedBoard ? s.boardRoot : undefined;
    // Trust is per board (EPIC-035) — must be gated here too, or an untrusted board's
    // code would run in this sidebar frame. The hook runs unconditionally; "" (unresolved)
    // is never trusted.
    const trusted = boardTrust.useIsTrusted(selectedRoot ?? "");

    const title = def?.title ?? viewId ?? "View";

    return (
        <Panel direction="column" flex={1} width="100%" height={0} background="default">
            <SideBarPanelHeader name="board-secondary" headerRef={headerRef} icon={icon} title={title} />
            {selectedRoot && def && trusted ? (
                <BoardWebview
                    // Remount on Reload (matches the main frame) so edited files reload.
                    key={`${viewId}__${s.reloadToken}`}
                    model={boardModel}
                    boardRoot={selectedRoot}
                    entry={def.html ?? "index.html"}
                    view={def.id}
                    isMain={false}
                />
            ) : (
                <Panel flex={1} align="center" justify="center" padding="lg">
                    <Text color="light" align="center" size="sm">
                        {!selectedRoot
                            ? "Board not available"
                            : !trusted
                              ? "Trust the board to view this panel"
                              : "View not found"}
                    </Text>
                </Panel>
            )}
        </Panel>
    );
}
