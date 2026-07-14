import { useCallback, useMemo, useRef, useState } from "react";

import { app } from "../../api/app";
import { boardTrust } from "../../api/board-trust";
import { createLinkData } from "../../../shared/link-data";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { fpNormalizeForCompare } from "../../core/utils/file-path";
import { Panel } from "../../uikit/Panel";
import { IconButton } from "../../uikit/IconButton";
import { Text } from "../../uikit/Text";
import { Popover } from "../../uikit/Popover";
import { RefreshIcon, LogIcon, NavPanelIcon } from "../../theme/icons";
import { SwitchWidget } from "../base/PageToolbar";
import { BoardsTree } from "./BoardsTree";
import type { BoardEditorModel } from "./BoardEditorModel";

// =============================================================================
// In-board toolbar (EPIC-036 / US-763). Re-homes the Reload / Show-log actions
// (previously on the project Board editor's side-panel header, removed by US-762)
// above the board webview, and adds the board path + a boards-switcher popover.
//
// The switcher's scope (the Explorer root) is carried as link metadata captured
// at open — read back from the board's persisted `state.sourceLink.explorerRoot`,
// exactly how every no-host editor carries its opening link. There is no live
// `page.panelEditors` lookup. A board opened standalone (no `explorerRoot`) shows
// a plain, non-interactive path label.
// =============================================================================

export function BoardToolbar({ model }: { model: BoardEditorModel }) {
    const { boardRoot, explorerRoot } = model.state.use((s) => ({
        boardRoot: s.boardRoot,
        explorerRoot: s.sourceLink?.explorerRoot,
    }));

    const pathRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const canSwitch = !!explorerRoot;

    const allPaths = boardTrust.useTrustedPaths();
    const boards = useMemo(() => {
        if (!explorerRoot) return [];
        const rootKey = fpNormalizeForCompare(explorerRoot);
        return allPaths.filter((p) => {
            const k = fpNormalizeForCompare(p);
            return k === rootKey || k.startsWith(rootKey + "/");
        });
    }, [allPaths, explorerRoot]);

    // Switch boards from inside the board: open in the CURRENT page (pageId swaps
    // the main editor, no new tab) and propagate the same explorerRoot so the next
    // board keeps the switcher.
    const openBoard = useCallback((root: string) => {
        setOpen(false);
        app.events.openRawLink.sendAsync(
            createLinkData(encodePersephoneBoardLink(root), {
                pageId: model.page?.id ?? "",
                sourceId: "board-toolbar",
                explorerRoot,
            }),
        );
    }, [model, explorerRoot]);

    const openLog = useCallback(async () => {
        const logPath = model.getSelectedBoardLogPath();
        if (logPath) await app.events.openRawLink.sendAsync(createLinkData(logPath));
    }, [model]);

    return (
        <Panel name="board-toolbar" direction="row" align="center" gap="sm" padding="xs" shrink={false}>
            {/* File Explorer — opens the sidebar Explorer panel (toggles if one already exists).
                First open roots it at the board's PARENT folder: toggleNavigator takes fpDirname of
                the path it's given, so passing boardRoot yields the parent. Mirrors the standard
                editor toolbar's NavPanel button (PageToolbar). */}
            <IconButton
                name="board-toolbar-explorer"
                size="sm"
                title="File Explorer"
                icon={<NavPanelIcon width={14} height={14} />}
                onClick={() => void model.page?.toggleNavigator(null, boardRoot)}
            />
            {/* Full board path → switcher anchor. The click handler is on the Text (the label)
                itself — not this flex container — so clicking the empty space to the right of a
                short path does NOT open the popover. The Panel bounds the truncation and anchors
                the popover. The icon + name are omitted — the page tab already shows them. */}
            <Panel
                ref={pathRef}
                name="board-toolbar-path"
                direction="row"
                align="center"
                flex={1}
                width={0}
                overflow="hidden"
            >
                <Text
                    size="sm"
                    color="light"
                    truncate
                    hoverUnderline={canSwitch}
                    onClick={canSwitch ? () => setOpen((o) => !o) : undefined}
                >
                    {boardRoot ?? ""}
                </Text>
            </Panel>
            <IconButton
                name="board-toolbar-reload"
                size="sm"
                title="Reload board"
                icon={<RefreshIcon width={14} height={14} />}
                onClick={() => model.reloadBoard()}
            />
            <IconButton
                name="board-toolbar-log"
                size="sm"
                title="Open board log"
                icon={<LogIcon width={14} height={14} />}
                onClick={() => void openLog()}
            />
            {/* Editor-switch widget (EPIC-042) — shown only when this board is acting as a
                file editor (findCompatibleEditors yields the built-in + this board). Reuses the
                exact PageToolbar widget so a board↔Monaco switch looks identical to every other
                editor switch. Renders nothing for a plainly-opened board (its own guard). */}
            <SwitchWidget model={model} />
            {canSwitch && (
                <Popover
                    name="board-toolbar-switcher"
                    open={open}
                    elementRef={pathRef.current}
                    onClose={() => setOpen(false)}
                    placement="bottom-start"
                >
                    <Panel direction="column" width={360} padding="xs">
                        <Panel direction="column" height={320}>
                            <Panel direction="column" flex={1} height={0}>
                                <BoardsTree
                                    name="board-toolbar-boards"
                                    boards={boards}
                                    baseRoot={explorerRoot}
                                    onOpenBoard={openBoard}
                                />
                            </Panel>
                        </Panel>
                    </Panel>
                </Popover>
            )}
        </Panel>
    );
}
