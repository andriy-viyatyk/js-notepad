import React, { useCallback, useEffect, useMemo } from "react";
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
import { createTextElement } from "../../uikit/Text/text-style";
import { BoardsTree } from "../../editors/board/BoardsTree";
import { useBoardStandalone } from "../../editors/board/board-usage-cache";
import { fillSlot } from "../../uikit/shared/fill-slot";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { addPin, removePin, usePinnedRefs, type PinnedRef } from "./pinned-items";

export interface TrustedBoardsListProps {
    onClose?: () => void;
}

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
            icon={pinned ? "pin-filled" : "pin"}
            title={pinned ? "Unpin" : "Pin to menu"}
            onClick={(event) => {
                event.stopPropagation();
                onToggle(root);
            }}
        />
    );
}

function TrustedBoardsTreeSlot({ onClose }: TrustedBoardsListProps) {
    useEffect(() => {
        void boardTrust.load();
        void publishedBoards.load();
        void boardInstallRegistry.load();
    }, []);

    const paths = boardTrust.useTrustedPaths();
    const pinnedRefs = usePinnedRefs();
    const updates = useBoardUpdates();
    const pinnedRoots = useMemo(
        () => new Set(pinnedRefs.filter((ref) => ref.kind === "board").map((ref) => (ref as { root: string }).root)),
        [pinnedRefs],
    );

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

    const handleRemove = useCallback(async (root: string) => {
        await boardTrust.untrust(root);
        removePin({ kind: "board", root });
        ui.notify("Removed from trusted boards", "info");
    }, []);

    const renderTrailing = useCallback((root: string) => {
        const update = updates.get(fpNormalizeForCompare(root));
        const pinButton = (
            <BoardPinAction root={root} pinned={pinnedRoots.has(root)} onToggle={handleTogglePin} />
        );
        if (!update) return pinButton;
        return (
            <Panel name="board-trailing" direction="row" align="center" gap="xs">
                <Tag
                    label="Update"
                    size="sm"
                    title={`Update to v${update.latestVersion}`}
                    onClick={() => { void runBoardUpdate(update); }}
                />
                {pinButton}
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
        items.push(
            { label: "Copy board path", onClick: () => { void navigator.clipboard.writeText(root); } },
            {
                label: "Remove",
                onClick: () => { void handleRemove(root); },
                startGroup: true,
            },
        );
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
            emptyMessage={createTextElement("No trusted boards yet", { size: "sm", color: "light" })}
        />
    );
}

export class TrustedBoardsListView extends VanillaView<TrustedBoardsListProps> {
    private slotCleanup: (() => void) | undefined;

    public constructor(props: TrustedBoardsListProps) {
        super(props);
        this.root.dataset.type = "trusted-boards-list";
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        this.renderSlot();
    }

    protected onUpdate(): void {
        this.renderSlot();
    }

    protected onDispose(): void {
        this.slotCleanup?.();
        this.slotCleanup = undefined;
    }

    private renderSlot(): void {
        this.slotCleanup = fillSlot(
            this.root,
            React.createElement(TrustedBoardsTreeSlot, { onClose: this.props.onClose }),
        );
    }
}
