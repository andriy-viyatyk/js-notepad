import { useCallback, useEffect, useMemo } from "react";
import { app } from "../../api/app";
import { ui } from "../../api/ui";
import { boardTrust } from "../../api/board-trust";
import { publishedBoards } from "../../api/published-boards";
import { boardInstallRegistry } from "../../api/board-install-registry";
import { useBoardUpdates, runBoardUpdate } from "../../api/board-updates";
import { createLinkData } from "../../../shared/link-data";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { fpDirname, fpNormalizeForCompare } from "../../core/utils/file-path";
import { IconButton, Panel, Tag } from "../../uikit";
import type { MenuItem } from "../../uikit";
import { Text } from "../../uikit/Text";
import { PinIcon, PinFilledIcon } from "../../theme/icons";
import { BoardsTree } from "../../editors/board/BoardsTree";
import { useBoardStandalone } from "../../editors/board/board-usage-cache";
import { usePinnedRefs, addPin, removePin, type PinnedRef } from "./pinned-items";

// Pin control for a board row — gated to standalone boards (EPIC-045 / US-870): file-viewer
// boards (masks, not standalone) are not pinnable, so no pin button shows for them. Renders
// null while the manifest is still being probed (usage unknown) and for non-standalone boards.
function BoardPinAction({ root, pinned, onToggle }: {
    root: string;
    pinned: boolean;
    onToggle: (root: string) => void;
}) {
    const standalone = useBoardStandalone(root);
    if (!standalone) return null;
    return (
        <IconButton
            size="sm"
            icon={pinned ? <PinFilledIcon /> : <PinIcon />}
            title={pinned ? "Unpin" : "Pin to menu"}
            onClick={(e) => {
                e.stopPropagation();
                onToggle(root);
            }}
        />
    );
}

// =============================================================================
// Global "Custom Boards & Editors" boards list (EPIC-036 / US-764). Renders the
// machine-wide trusted-boards registry via the shared `BoardsTree` in multi-root
// mode — the same tree component as the Explorer-sibling panel (US-761) and the
// in-board toolbar popover (US-763). Its pin / Remove affordances ride the tree's
// `renderTrailing` / `getBoardContextMenu` slots.
// =============================================================================

interface TrustedBoardsListProps {
    onClose?: () => void;
}

export function TrustedBoardsList({ onClose }: TrustedBoardsListProps) {
    // board-trust is a recent.ts-style global model; load() populates the shared
    // reactive state. Idempotent, so a re-mount or a concurrent editor load is safe.
    // The catalog + install registry back the "Update available" badge (US-865) — load
    // them here too so the badge shows without first opening a board.
    useEffect(() => {
        void boardTrust.load();
        void publishedBoards.load();
        void boardInstallRegistry.load();
    }, []);

    const paths = boardTrust.useTrustedPaths();
    const pinnedRefs = usePinnedRefs();
    const updates = useBoardUpdates();

    const pinnedRoots = useMemo(
        () => new Set(pinnedRefs.filter((r) => r.kind === "board").map((r) => (r as { root: string }).root)),
        [pinnedRefs],
    );

    // The global tab is not page-scoped → open in a NEW page (no pageId). Scope the opened board's
    // in-board switcher to its PARENT folder (explorerRoot) so its sibling boards are switchable
    // from the toolbar (US-763). The metadata lands in the board's persisted sourceLink.
    const openBoard = useCallback((root: string) => {
        void app.events.openRawLink.sendAsync(
            createLinkData(encodePersephoneBoardLink(root), { explorerRoot: fpDirname(root) }),
        );
        onClose?.();
    }, [onClose]);

    const handleTogglePin = useCallback((root: string) => {
        const ref: PinnedRef = { kind: "board", root };
        if (pinnedRoots.has(root)) removePin(ref);
        else addPin(ref);
    }, [pinnedRoots]);

    // "Remove" untrusts only — it forgets the board (and any pin), never deleting the folder on
    // disk. (The Explorer panel's "Delete Board" is the heavier folder-deleting action.)
    const handleRemove = useCallback(async (root: string) => {
        await boardTrust.untrust(root);
        removePin({ kind: "board", root });
        ui.notify("Removed from trusted boards", "info");
    }, []);

    const renderTrailing = useCallback((root: string) => {
        const update = updates.get(fpNormalizeForCompare(root));
        const pinBtn = (
            <BoardPinAction root={root} pinned={pinnedRoots.has(root)} onToggle={handleTogglePin} />
        );
        if (!update) return pinBtn;
        return (
            <Panel name="board-trailing" direction="row" align="center" gap="xs">
                <Tag
                    label="Update"
                    size="sm"
                    title={`Update to v${update.latestVersion}`}
                    onClick={() => { void runBoardUpdate(update); }}
                />
                {pinBtn}
            </Panel>
        );
    }, [updates, pinnedRoots, handleTogglePin]);

    const getBoardContextMenu = useCallback((root: string): MenuItem[] => {
        const update = updates.get(fpNormalizeForCompare(root));
        const items: MenuItem[] = [];
        if (update) {
            items.push({
                label: `Update to v${update.latestVersion}`,
                onClick: () => { void runBoardUpdate(update); },
            });
        }
        items.push({
            label: "Remove",
            onClick: () => { void handleRemove(root); },
        });
        return items;
    }, [updates, handleRemove]);

    return (
        <BoardsTree
            name="sidebar-trusted-boards-list"
            boards={paths}
            onOpenBoard={openBoard}
            renderTrailing={renderTrailing}
            trailingVisible={(root) =>
                pinnedRoots.has(root) || updates.has(fpNormalizeForCompare(root))
            }
            getBoardContextMenu={getBoardContextMenu}
            emptyMessage={<Text size="sm" color="light">No trusted boards yet</Text>}
        />
    );
}
