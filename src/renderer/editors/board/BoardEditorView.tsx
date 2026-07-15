import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { WarningIcon } from "../../theme/icons";
import { boardTrust } from "../../api/board-trust";
import { showTrustBoardDialog } from "../../ui/dialogs/TrustBoardDialog";
import { BoardEditorModel } from "./BoardEditorModel";
import { UntrustedBoardView } from "./UntrustedBoardView";
import { BoardNotFoundView } from "./BoardNotFoundView";
import { BoardWebview } from "./BoardWebview";
import { BoardToolbar } from "./BoardToolbar";

// =============================================================================
// Component — single-board host region (EPIC-034 / EPIC-035 / EPIC-036). Gated by
// the per-board trust gate (EPIC-035): an untrusted board shows the placeholder +
// Trust button instead of rendering. A board whose folder/manifest is gone shows
// "Board not found". A trusted, resolved board renders its board:// webview.
// =============================================================================

export function BoardEditorView({ model }: { model: BoardEditorModel }) {
    const s = model.state.use((st) => ({
        boardRoot: st.boardRoot,
        selectedBoard: st.selectedBoard,
        reloadToken: st.reloadToken,
        contentHostError: st.contentHostError,
    }));
    // The board's folder is `boardRoot` directly (no sibling lookup). `selectedBoard`
    // gates whether a board is currently resolved — refreshBoards clears it for a
    // missing/invalid board.
    const selectedRoot = s.selectedBoard ? s.boardRoot : undefined;
    // Trust is per board (EPIC-035): the gate keys on this board's own root and fires
    // when the board is about to render (webview + execute). The hook must run
    // unconditionally; "" (unresolved) is never trusted.
    const boardTrusted = boardTrust.useIsTrusted(selectedRoot ?? "");

    if (!s.selectedBoard || !selectedRoot) {
        return <BoardNotFoundView path={s.boardRoot ?? ""} />;
    }

    // An untrusted board shows the trust placeholder instead of its webview —
    // nothing runs until the user trusts this specific board.
    if (!boardTrusted) {
        return (
            <UntrustedBoardView
                path={selectedRoot}
                onTrust={async () => {
                    if (await showTrustBoardDialog(selectedRoot)) {
                        await boardTrust.trust(selectedRoot);
                    }
                }}
            />
        );
    }

    // EPIC-043: the board is trusted and resolved, but its content HOST failed to restore
    // (e.g. the edited file was deleted). Show why, rather than a blank board.
    if (s.contentHostError) {
        return (
            <Panel direction="column" flex={1} align="center" justify="center" gap="md" padding="xl">
                <WarningIcon width={32} height={32} />
                <Text size="lg">Content unavailable</Text>
                <Text color="light" align="center">{s.contentHostError}</Text>
            </Panel>
        );
    }

    return (
        <Panel name="board-host" direction="column" flex={1} width="100%">
            <BoardToolbar model={model} />
            <Panel name="board-webview-wrap" direction="column" flex={1} width="100%" height={0}>
                <BoardWebview
                    key={`${s.selectedBoard}__${s.reloadToken}`}
                    model={model}
                    boardRoot={selectedRoot}
                />
            </Panel>
        </Panel>
    );
}
