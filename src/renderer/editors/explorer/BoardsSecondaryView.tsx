import { useCallback, useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";

import { app } from "../../api/app";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { boardTrust } from "../../api/board-trust";
import { toolsTrust } from "../../api/tools/tools-trust";
import { registeredTools } from "../../api/tools/registered-tools";
import { createLinkData } from "../../../shared/link-data";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { openToolset } from "../../content/persephone-toolset-link";
import { showCreateBoardDialog } from "../../ui/dialogs/CreateBoardDialog";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import { fpBasename, fpNormalizeForCompare } from "../../core/utils/file-path";
import { removePin } from "../../ui/sidebar/pinned-items";
import type { MenuItem } from "../../uikit";
import { SegmentedControl } from "../../uikit";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../ui/secondary-views/SideBarPanelHeader";
import type { ExplorerEditor } from "./ExplorerEditorModel";
import { IconButton } from "../../uikit/IconButton";
import { SplitButton } from "../../uikit/SplitButton";
import { Button } from "../../uikit/Button";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { CloseIcon, PlusIcon, BoardIcon, DeleteIcon, OpenLinkIcon, RemoveIcon, CopyIcon } from "../../theme/icons";
import color from "../../theme/color";
import { BoardsTree } from "../board/BoardsTree";
import { ToolsTree } from "../tools/ToolsTree";
import { useBusyBoardRoots } from "../board/busy-boards";
import { errMessage } from "../../../shared/utils";

/** "Running" indicator for a busy board (US-799) — its spawned processes are
 *  alive (possibly with the board itself unloaded). */
const RunningDot = styled.span(
    {
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: color.misc.green,
        flexShrink: 0,
    },
    { label: "RunningDot" },
);

/** Inner Boards/Tools switch row (US-805) — hosts the SegmentedControl and, in Boards mode,
 *  the "+ New board" button (moved here from the panel header). */
const SwitchBar = styled.div(
    {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        flexShrink: 0,
    },
    { label: "BoardsToolsSwitchBar" },
);

// The Boards sibling panel (EPIC-036 / US-761). Backed by ExplorerEditor (like Search), so it
// inherits the Explorer `rootPath` as its scope and `page.id` for navigation. Lists the trusted
// boards under the root via the shared BoardsTree; the "+ New board" SplitButton creates a board
// (US-760 dialog scaffolds + auto-trusts) and opens it; clicking a board opens it in the current
// page via persephone-board://.
export default function BoardsSecondaryView({ model: rawModel, headerRef, icon, expanded }: SecondaryViewProps) {
    const model = rawModel as ExplorerEditor;
    const { rootPath } = model.state.use();
    const pageId = model.page?.id ?? "";

    // board-trust is a global reactive model; load() populates the shared state (idempotent).
    useEffect(() => {
        void boardTrust.load();
    }, []);

    // Boards/Tools switch (US-805). Local-only, matching the global Tools & Editors panel
    // (not persisted — T-C9).
    const [tab, setTab] = useState<"boards" | "tools">("boards");

    // registered-tools is a global reactive model; ensureInitialized() loads the registry then
    // enumerates (idempotent).
    useEffect(() => {
        void registeredTools.ensureInitialized();
    }, []);

    const allPaths = boardTrust.useTrustedPaths();
    const allToolsets = registeredTools.useToolsets();

    // Filter the trusted registry to boards under the current Explorer root (C2). Includes the
    // root itself when it is a board (C-761.4) — BoardsTree renders a board-equals-base as a
    // single top-level leaf.
    const boards = useMemo(() => {
        if (!rootPath) return [];
        const rootKey = fpNormalizeForCompare(rootPath);
        return allPaths.filter((p) => {
            const k = fpNormalizeForCompare(p);
            return k === rootKey || k.startsWith(rootKey + "/");
        });
    }, [allPaths, rootPath]);

    // Registered toolsets under the current Explorer root (same subtree filter as boards),
    // mapped to { root, name } for the ToolsTree (name = authoritative manifest name).
    const toolsets = useMemo(() => {
        if (!rootPath) return [];
        const rootKey = fpNormalizeForCompare(rootPath);
        return allToolsets
            .filter((t) => {
                const k = fpNormalizeForCompare(t.root);
                return k === rootKey || k.startsWith(rootKey + "/");
            })
            .map((t) => ({ root: t.root, name: t.name }));
    }, [allToolsets, rootPath]);

    const openToolsetInPage = useCallback((root: string) => {
        openToolset(root, { pageId, sourceId: "explorer" });
    }, [pageId]);

    const handleRemoveToolset = useCallback(async (root: string) => {
        await toolsTrust.untrust(root);
        ui.notify("Removed from tools", "info");
    }, []);

    const getToolsetContextMenu = useCallback((root: string): MenuItem[] => [
        {
            label: "Remove from Tools",
            icon: <RemoveIcon width={14} height={14} />,
            onClick: () => { void handleRemoveToolset(root); },
        },
    ], [handleRemoveToolset]);

    // Open in the CURRENT page — pageId swaps the page's main editor instead of spawning a new tab.
    // explorerRoot rides as link metadata so the opened board can scope its in-board switcher to
    // this root (US-763); it lands in the board's persisted sourceLink.
    const openBoard = useCallback((root: string) => {
        app.events.openRawLink.sendAsync(
            createLinkData(encodePersephoneBoardLink(root), {
                pageId,
                sourceId: "explorer",
                explorerRoot: rootPath,
            }),
        );
    }, [pageId, rootPath]);

    // Open in a NEW tab — omitting pageId routes through openFile (a dedicated page)
    // instead of navigatePageTo (which swaps this page's main editor and disposes the
    // previous board, killing any dev-server processes it spawned). A board in its own
    // tab keeps its iframe — and its spawned processes — alive while the user works in
    // other tabs (inactive tabs are hidden, never unmounted), until that tab is closed.
    // explorerRoot still rides along so the opened board keeps its in-board switcher.
    const openBoardInNewTab = useCallback((root: string) => {
        app.events.openRawLink.sendAsync(
            createLinkData(encodePersephoneBoardLink(root), {
                sourceId: "explorer",
                explorerRoot: rootPath,
            }),
        );
    }, [rootPath]);

    const handleCreate = useCallback(async () => {
        const root = await showCreateBoardDialog({
            title: "Create board",
            template: "board-template",
            defaultFolder: rootPath,
        });
        if (root) openBoard(root);
    }, [rootPath, openBoard]);

    const handleCreateDemo = useCallback(async () => {
        const root = await showCreateBoardDialog({
            title: "Create Demo board",
            template: "demo-board",
            defaultName: "Demo",
            defaultFolder: rootPath,
        });
        if (root) openBoard(root);
    }, [rootPath, openBoard]);

    // Delete a board: when its folder still exists, confirm then remove the folder + the registry
    // entry (+ any pin). When the folder is already gone (a stale registry entry, e.g. deleted
    // outside Persephone), confirm a lighter "remove from the list" and just untrust. The trusted
    // list is reactive, so the row vanishes from this panel on untrust.
    const handleDelete = useCallback(async (root: string) => {
        const name = fpBasename(root);
        const onDisk = await fs.exists(root);
        const confirmed = await showConfirmationDialog({
            title: onDisk ? "Delete board" : "Remove board",
            message: onDisk
                ? `Delete board "${name}"? This permanently removes its folder and all its files.`
                : `Board "${name}" no longer exists on disk. Remove it from the list?`,
            buttons: [onDisk ? "Delete" : "Remove", "Cancel"],
        });
        if (confirmed === "Cancel" || !confirmed) return;
        try {
            if (onDisk) await fs.removeDir(root, true);
        } catch (err) {
            ui.notify(errMessage(err), "error");
            return;
        }
        await boardTrust.untrust(root);
        removePin({ kind: "board", root });
    }, []);

    // "Running" dot for boards whose processes are alive (busy, US-799) — including
    // boards running invisibly after the user navigated their page elsewhere.
    const busyRoots = useBusyBoardRoots();
    const renderTrailing = useCallback((root: string) => {
        if (!busyRoots.includes(fpNormalizeForCompare(root))) return undefined;
        return <RunningDot title="Board processes are running" />;
    }, [busyRoots]);

    const getBoardContextMenu = useCallback((root: string): MenuItem[] => [
        {
            label: "Open in New Tab",
            icon: <OpenLinkIcon width={14} height={14} />,
            onClick: () => openBoardInNewTab(root),
        },
        {
            label: "Copy board path",
            icon: <CopyIcon width={14} height={14} />,
            onClick: () => { void navigator.clipboard.writeText(root); },
        },
        {
            label: "Delete Board",
            icon: <DeleteIcon width={14} height={14} />,
            onClick: () => { void handleDelete(root); },
            startGroup: true,
        },
    ], [openBoardInNewTab, handleDelete]);

    // The header keeps only the close button (US-805) — the "+ New board" control and the
    // Boards/Tools switch moved into the body's SwitchBar. The header stays "Boards" + BoardIcon
    // in both modes (user decision).
    const actions = (
        <IconButton
            name="boards-close"
            size="sm"
            title="Close Panel"
            icon={<CloseIcon />}
            onClick={(e) => { e.stopPropagation(); model.closeBoards(); }}
        />
    );

    const boardsBody = boards.length === 0 ? (
        <Panel
            name="boards-empty"
            flex={1}
            direction="column"
            align="center"
            justify="center"
            gap="md"
            padding="xl"
        >
            <Text color="light" align="center">No boards under this folder.</Text>
            <Panel name="boards-empty-actions" direction="column" gap="sm" align="stretch">
                <Button
                    name="boards-create-empty"
                    variant="primary"
                    icon={<PlusIcon />}
                    onClick={() => void handleCreate()}
                >
                    Create board
                </Button>
                <Button
                    name="boards-create-demo-empty"
                    icon={<BoardIcon width={16} height={16} />}
                    onClick={() => void handleCreateDemo()}
                >
                    Create Demo board
                </Button>
            </Panel>
        </Panel>
    ) : (
        <BoardsTree
            name="explorer-boards"
            boards={boards}
            baseRoot={rootPath}
            onOpenBoard={openBoard}
            renderTrailing={renderTrailing}
            getBoardContextMenu={getBoardContextMenu}
        />
    );

    const toolsBody = (
        <ToolsTree
            name="explorer-tools"
            toolsets={toolsets}
            baseRoot={rootPath}
            onOpenToolset={openToolsetInPage}
            getContextMenu={getToolsetContextMenu}
            emptyMessage={<Text size="sm" color="light">No registered tools under this folder.</Text>}
        />
    );

    return (
        <>
            <SideBarPanelHeader headerRef={headerRef} icon={icon} title="Boards" actions={actions} />
            {expanded && (
                <SwitchBar>
                    <SegmentedControl
                        name="boards-tools-switch"
                        size="sm"
                        value={tab}
                        onChange={(v) => setTab(v as "boards" | "tools")}
                        items={[
                            { value: "boards", label: "Boards" },
                            { value: "tools", label: "Tools" },
                        ]}
                    />
                    {tab === "boards" && (
                        <SplitButton
                            name="boards-create"
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
                    )}
                </SwitchBar>
            )}
            {tab === "boards" ? boardsBody : toolsBody}
        </>
    );
}
