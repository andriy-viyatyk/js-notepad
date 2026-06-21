import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Button } from "../../uikit/Button";
import { IconButton } from "../../uikit/IconButton";
import { SplitButton } from "../../uikit/SplitButton";
import { Spacer } from "../../uikit/Spacer";
import { PlusIcon, DeleteIcon, BoardIcon } from "../../theme/icons";
import { boardTrust } from "../../api/board-trust";
import { ui } from "../../api/ui";
import { showTrustBoardDialog } from "../../ui/dialogs/TrustBoardDialog";
import { showInputDialog } from "../../ui/dialogs/InputDialog";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import { BoardEditorModel } from "./BoardEditorModel";
import { UntrustedBoardView } from "./UntrustedBoardView";
import { BoardWebview } from "./BoardWebview";
import { BoardGlyph } from "./BoardGlyph";

// =============================================================================
// Component — board management + host region (US-722). Gated by the per-project
// trust gate (US-721): an untrusted project shows the placeholder + Trust
// button. Trusted: a board list with create/delete; selecting a board shows the
// host region (a placeholder until the board:// webview lands in US-723).
// =============================================================================

export function BoardEditorView({ model }: { model: BoardEditorModel }) {
    const s = model.state.use((st) => ({
        boardsDir: st.boardsDir,
        boardRoot: st.boardRoot,
        boards: st.boards,
        selectedBoard: st.selectedBoard,
        reloadToken: st.reloadToken,
        title: st.title,
    }));
    // Trust is per board (EPIC-035): the gate keys on the currently-selected
    // board's own root, and fires when that board is about to render (webview +
    // execute) — NOT on the board list, which runs no board code. The hook must
    // run unconditionally; "" (nothing selected) is never trusted.
    const selectedRoot = s.selectedBoard ? model.boardRootOf(s.selectedBoard) : undefined;
    const boardTrusted = boardTrust.useIsTrusted(selectedRoot ?? "");

    const handleCreate = async () => {
        const res = await showInputDialog({
            title: "Create board",
            message: "Board name (becomes the folder name):",
            value: "",
            buttons: ["Create", "Cancel"],
        });
        if (res?.button !== "Create") return;
        const name = res.value.trim();
        if (!name) return;
        try {
            await model.createBoard(name);
        } catch (err) {
            ui.notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const handleCreateDemo = async () => {
        const res = await showInputDialog({
            title: "Create Demo board",
            message: "Board name (becomes the folder name):",
            value: "Demo",
            buttons: ["Create", "Cancel"],
        });
        if (res?.button !== "Create") return;
        const name = res.value.trim();
        if (!name) return;
        try {
            await model.createDemoBoard(name);
        } catch (err) {
            ui.notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const handleDelete = async (name: string) => {
        const answer = await showConfirmationDialog({
            title: "Delete board",
            message: `Delete board "${name}"? This permanently removes its folder and all its files.`,
            buttons: ["Delete", "Cancel"],
        });
        if (answer !== "Delete") return;
        await model.deleteBoard(name);
    };

    // A selected board takes the full editor area — no toolbar (the board owns its
    // own page). Back to the list is via the side-panel ">" button. An untrusted
    // board shows the trust placeholder instead of its webview — nothing runs until
    // the user trusts this specific board.
    if (s.selectedBoard && selectedRoot) {
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
        return (
            <Panel name="board-webview-wrap" direction="column" flex={1} width="100%">
                <BoardWebview
                    key={`${s.selectedBoard}__${s.reloadToken}`}
                    model={model}
                    boardRoot={selectedRoot}
                />
            </Panel>
        );
    }

    return (
        // NOTE: board-root and board-list-scroll are plain <div>s with inline style
        // rather than <Panel> (a deliberate Rule-7 exception for this editor). In this
        // app's runtime the Panel `overflow` prop did not reach the DOM for these cached
        // editor nodes, so the toolbar scrolled away with the content. A plain element
        // commits the style directly. height:100% + overflow:hidden pins the root to the
        // visible height so only board-list-scroll scrolls; the toolbar (shrink=false)
        // stays put.
        <div
            data-name="board-root"
            style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden" }}
        >
            {/* Toolbar (board list) */}
            <Panel
                name="board-toolbar"
                direction="row"
                gap="sm"
                align="center"
                background="dark"
                borderBottom
                shrink={false}
                paddingX="sm"
                paddingY="xs"
            >
                <Text size="md">{s.title}</Text>
                <Spacer />
                <SplitButton
                    name="board-create"
                    size="sm"
                    icon={<PlusIcon />}
                    onClick={() => void handleCreate()}
                    menuTitle="More board options"
                    items={[
                        {
                            label: "Create Demo board",
                            icon: <BoardIcon width={14} height={14} />,
                            onClick: () => void handleCreateDemo(),
                        },
                    ]}
                >
                    New board
                </SplitButton>
            </Panel>

            {/* Body */}
            {s.boards.length === 0 ? (
                <Panel name="board-empty" flex={1} direction="column" align="center" justify="center" gap="md" padding="xl">
                    <Text color="light" align="center">No boards yet. Create one to get started.</Text>
                    <Panel name="board-empty-actions" direction="row" gap="sm">
                        <Button
                            name="board-create-empty"
                            variant="primary"
                            icon={<PlusIcon />}
                            onClick={() => void handleCreate()}
                        >
                            Create board
                        </Button>
                        <Button
                            name="board-create-demo-empty"
                            icon={<BoardIcon width={16} height={16} />}
                            onClick={() => void handleCreateDemo()}
                        >
                            Create Demo board
                        </Button>
                    </Panel>
                </Panel>
            ) : (
                <div
                    data-name="board-list-scroll"
                    className="scroll-container"
                    style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}
                >
                    {/* minHeight 100% + shrink=false: a short list stays vertically
                        centered; a long list grows past the viewport and scrolls from
                        the top (no flex-centering clip), while the toolbar stays put. */}
                    <Panel
                        name="board-list"
                        direction="column"
                        align="center"
                        justify="center"
                        gap="sm"
                        width="100%"
                        minHeight="100%"
                        shrink={false}
                        paddingY="lg"
                    >
                        {s.boards.map((name) => (
                            <Panel
                                key={name}
                                name="board-tile"
                                direction="row"
                                align="center"
                                gap="sm"
                                width="50%"
                                height={34}
                                paddingX="lg"
                                border
                                rounded="md"
                                borderColor="subtle"
                                clickable
                                onClick={() => model.selectBoard(name)}
                                revealChildrenOnHover
                            >
                                <BoardGlyph boardRoot={model.boardRootOf(name)} size={16} />
                                <Panel name="board-tile-title" flex={1} overflow="hidden" minWidth={0}>
                                    <Text size="sm" truncate title={name}>{name}</Text>
                                </Panel>
                                <IconButton
                                    name="board-tile-delete"
                                    size="sm"
                                    title="Delete board"
                                    icon={<DeleteIcon />}
                                    hideUntilParentHover
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        void handleDelete(name);
                                    }}
                                />
                            </Panel>
                        ))}
                    </Panel>
                </div>
            )}
        </div>
    );
}
