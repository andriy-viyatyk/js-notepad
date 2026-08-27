import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Icon } from "../../uikit/Icon/Icon";
import { boardTrust } from "../../api/board-trust";
import { showTrustBoardDialog } from "../../ui/dialogs/TrustBoardDialog";
import { BoardEditorModel } from "./BoardEditorModel";
import { UntrustedBoardView } from "./UntrustedBoardView";
import { BoardNotFoundView } from "./BoardNotFoundView";
import { BoardWebview } from "./BoardWebview";
import { BoardToolbar } from "./BoardToolbar";
import { ScriptPanel } from "../text/ScriptPanel";
import { ContentHostFooter } from "../base/ContentHostFooter";
import type { TextFileModel } from "../text/TextEditorModel";
import color from "../../theme/color";

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
                        const { confirmNamespaceNotColliding } = await import(
                            "../../api/board-vars/namespace"
                        );
                        if (await confirmNamespaceNotColliding(selectedRoot)) {
                            await boardTrust.trust(selectedRoot);
                        }
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
                <Icon name="warning" width={32} height={32} />
                <Text size="lg">Content unavailable</Text>
                <Text color="light" align="center">{s.contentHostError}</Text>
            </Panel>
        );
    }

    // Content-host boards (EPIC-043) wrap a real TextFileModel — give them the same
    // text-host footer (script toggle · provider · encoding) and Script panel the built-in
    // editors get from TextChrome (US-886). `contentHost` is null on plain boards, so those
    // stay footer-less.
    const host = model.contentHost as unknown as TextFileModel | null;

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
            {host?.script && <ScriptPanel model={host} />}
            {host && <ContentHostFooter host={host} footerContributions={<FooterStatus model={model} />} />}
        </Panel>
    );
}

/** Content-host footer status text set by the board via `persephone.setStatusText()` (US-892),
 *  e.g. a Todo board's "N items". Subscribes to `statusText` in isolation so a frequently-changing
 *  status (a live filter count) re-renders only this span, never the board's iframe subtree. */
function FooterStatus({ model }: { model: BoardEditorModel }) {
    const statusText = model.state.use((st) => st.statusText);
    if (!statusText) return null;
    return (
        <span style={{ color: color.text.light, fontSize: 13, padding: "0 4px" }}>{statusText}</span>
    );
}
