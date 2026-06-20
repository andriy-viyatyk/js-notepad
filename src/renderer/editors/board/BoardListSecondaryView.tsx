import type React from "react";
import { useMemo } from "react";
import { FileList, type FileListItem } from "../../components/file-list/FileList";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../ui/secondary-views/SideBarPanelHeader";
import { IconButton } from "../../uikit/IconButton";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Dot } from "../../uikit/Dot";
import { CloseIcon, RefreshIcon, LogIcon } from "../../theme/icons";
import { useOptionalState } from "../../core/state/state";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { fpJoin } from "../../core/utils/file-path";
import { BoardGlyph } from "./BoardGlyph";
import type { BoardEditorModel } from "./BoardEditorModel";

/**
 * "Boards" side panel (EPIC-034 / US-722) — the project's board switcher.
 * Selecting a board drives the main view (which hosts it). Management
 * (create / delete) lives in the main view per the epic. Mirrors the Mneme
 * "Wiki" panel's header + show-main / close actions.
 */
export default function BoardListSecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    const boardModel = model as BoardEditorModel;
    const { boards, selectedBoard, title, logHasErrors, persephonePath } = boardModel.state.use((s) => ({
        boards: s.boards,
        selectedBoard: s.selectedBoard,
        title: s.title,
        logHasErrors: s.logHasErrors,
        persephonePath: s.persephonePath,
    }));

    const openLog = async () => {
        const logPath = boardModel.getSelectedBoardLogPath();
        if (logPath) await app.events.openRawLink.sendAsync(createLinkData(logPath));
    };

    const items = useMemo<FileListItem[]>(
        () => boards.map((name) => ({
            filePath: name,
            title: name,
            // Board's own icon when present, else the default BoardIcon glyph
            // (US-744 — replaces the generic folder icon for boards).
            icon: <BoardGlyph boardRoot={fpJoin(persephonePath, "boards", name)} />,
        })),
        [boards, persephonePath],
    );

    // Subscribe to page.state so the show-main zone's "active" indicator tracks
    // whether this editor is the page's main view.
    const isMainEditor = useOptionalState(boardModel.page?.state, () => boardModel.isMain, false);

    // The show-main zone is "selected" (blue) only when the main view already IS
    // the board list — this editor is main AND no individual board is open.
    const showMainActive = isMainEditor && !selectedBoard;
    const actions = (
        <>
            {selectedBoard && (
                <>
                    <IconButton
                        name="board-refresh"
                        size="sm"
                        title="Reload board"
                        icon={<RefreshIcon width={14} height={14} />}
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            boardModel.reloadBoard();
                        }}
                    />
                    {logHasErrors && <Dot size="xs" color="error" />}
                    <IconButton
                        name="board-open-log"
                        size="sm"
                        title="Open board log"
                        icon={<LogIcon width={14} height={14} />}
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            void openLog();
                        }}
                    />
                </>
            )}
            <IconButton
                name="board-list-close"
                size="sm"
                title="Close"
                icon={<CloseIcon />}
                onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    void boardModel.requestClose();
                }}
            />
        </>
    );

    return (
        <>
            <SideBarPanelHeader
                headerRef={headerRef}
                icon={icon}
                title={title || "Boards"}
                actions={actions}
                showMainTitle="Back to boards"
                showMainActive={showMainActive}
                onShowMain={() => {
                    // Bring the boards list to the main view: promote if demoted,
                    // and deselect any open board. No-op when already showing the
                    // list as main (not main → promote; board open → deselect).
                    if (!isMainEditor) void boardModel.page?.promoteSecondaryToMain?.(boardModel);
                    boardModel.selectBoard(undefined);
                }}
            />
            {boards.length === 0 ? (
                <Panel padding="md">
                    <Text size="sm" color="light">No boards yet</Text>
                </Panel>
            ) : (
                <FileList
                    items={items}
                    onClick={(item) => {
                        // If the board editor was demoted to the sidebar, bring it
                        // back to the main view before opening the board.
                        if (!isMainEditor) void boardModel.page?.promoteSecondaryToMain?.(boardModel);
                        boardModel.selectBoard(item.filePath);
                    }}
                    selectedPath={selectedBoard}
                />
            )}
        </>
    );
}
