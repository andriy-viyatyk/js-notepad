import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel, Text, Button, Tag, Input, IconButton } from "../../uikit";
import { publishedBoards } from "../../api/published-boards";
import { boardInstallRegistry } from "../../api/board-install-registry";
import { useBoardUpdates } from "../../api/board-updates";
import { openBoardInfoPage } from "../board-info/open-board-info";
import { boardUsageGroup, type BoardUsageGroup, type BoardManifest } from "../board/board-manifest";
import { fpNormalizeForCompare } from "../../core/utils/file-path";
import { formatBytes } from "../../core/utils/format-bytes";
import { RefreshIcon } from "../../theme/icons";
import type { PublishedBoardInfo } from "../../../ipc/api-param-types";

// =============================================================================
// Search boards tab (EPIC-045 / US-870) — the sole catalog-browsing surface.
// Lists the cached published catalog grouped by usage, filters by
// name/description/mask, and opens the Board Info page for Install / Update /
// Properties. Pure UIKit composition (editor code — no Emotion, UIKit Rule 7).
// =============================================================================

const GROUP_ORDER: BoardUsageGroup[] = ["file-viewer", "file-editor", "tool"];
const GROUP_LABELS: Record<BoardUsageGroup, string> = {
    "file-viewer": "File viewers",
    "file-editor": "File editors",
    "tool": "Tools & apps",
};

function usageGroupOf(b: PublishedBoardInfo): BoardUsageGroup {
    // The catalog entry duplicates masks + standalone, so the group derives without a disk read.
    return boardUsageGroup({ fileMasks: b.fileMasks, standalone: b.standalone } as BoardManifest);
}

export function SearchBoardsTab() {
    useEffect(() => {
        void publishedBoards.load();
        void boardInstallRegistry.load();
    }, []);

    const catalog = publishedBoards.useCatalog();
    const installed = boardInstallRegistry.useInstalled();
    const updates = useBoardUpdates();
    const [query, setQuery] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try { await publishedBoards.refresh(); } finally { setRefreshing(false); }
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return catalog;
        return catalog.filter((b) => {
            const hay = [b.name, b.description ?? "", ...(b.fileMasks ?? [])].join(" ").toLowerCase();
            return hay.includes(q);
        });
    }, [catalog, query]);

    const groups = useMemo(() => {
        const map = new Map<BoardUsageGroup, PublishedBoardInfo[]>();
        for (const b of filtered) {
            const g = usageGroupOf(b);
            (map.get(g) ?? map.set(g, []).get(g)!).push(b);
        }
        return map;
    }, [filtered]);

    return (
        <Panel data-type="search-boards-tab" direction="column" flex={1} minHeight={0}>
            <Panel direction="row" align="center" gap="sm" paddingX="lg" paddingBottom="md" shrink={false}>
                <Input
                    name="search-boards-filter"
                    size="sm"
                    value={query}
                    onChange={setQuery}
                    placeholder="Search boards…"
                    tone={query ? "accent" : "default"}
                    maxWidth={360}
                />
                <IconButton
                    name="search-boards-refresh"
                    size="sm"
                    icon={<RefreshIcon />}
                    title="Refresh catalog"
                    disabled={refreshing}
                    onClick={() => { void refresh(); }}
                />
            </Panel>

            <Panel direction="column" flex={1} minHeight={0} overflowY="auto" gap="lg" paddingX="lg" paddingBottom="lg">
                {catalog.length === 0 ? (
                    <Text size="sm" color="light">No published boards available.</Text>
                ) : filtered.length === 0 ? (
                    <Text size="sm" color="light">No boards match “{query}”.</Text>
                ) : (
                    GROUP_ORDER.filter((g) => groups.has(g)).map((g) => (
                        <Panel key={g} direction="column" gap="sm">
                            <Text size="sm" color="light" bold>{GROUP_LABELS[g]}</Text>
                            {groups.get(g)!.map((b) => (
                                <BoardCard
                                    key={b.id}
                                    board={b}
                                    installed={installed}
                                    updates={updates}
                                />
                            ))}
                        </Panel>
                    ))
                )}
            </Panel>
        </Panel>
    );
}

function BoardCard({ board, installed, updates }: {
    board: PublishedBoardInfo;
    installed: ReturnType<typeof boardInstallRegistry.useInstalled>;
    updates: ReturnType<typeof useBoardUpdates>;
}) {
    const inst = installed.find((e) => e.id === board.id);
    const update = inst ? updates.get(fpNormalizeForCompare(inst.root)) : undefined;
    const compatible = publishedBoards.isCompatible(board.minAppVersion);

    const openInstall = useCallback(() => {
        void openBoardInfoPage({ catalogId: board.id });
    }, [board.id]);
    const openProperties = useCallback(() => {
        if (inst) void openBoardInfoPage({ boardRoot: inst.root });
    }, [inst]);

    return (
        <Panel
            data-type="board-card"
            direction="column"
            gap="sm"
            padding="md"
            border
            rounded="md"
        >
            <Panel direction="row" align="center" gap="sm">
                <Text bold>{board.name}</Text>
                <Text size="sm" color="light">{`v${board.version}`}</Text>
                <Text size="sm" color="light">{formatBytes(board.archive.size)}</Text>
                <Panel flex={1} minWidth={0} />
                {inst && update && (
                    <Tag label="Update available" size="sm" title={`Update to v${update.latestVersion}`} />
                )}
                {inst && !update && (
                    <Tag label={`Installed v${inst.version}`} size="sm" variant="outlined" />
                )}
            </Panel>

            {board.description && <Text size="sm">{board.description}</Text>}

            {board.fileMasks && board.fileMasks.length > 0 && (
                <Panel direction="row" wrap gap="xs" align="center">
                    <Text size="sm" color="light">Files:</Text>
                    {board.fileMasks.map((m) => (
                        <Tag key={m} label={m} size="sm" variant="outlined" />
                    ))}
                </Panel>
            )}

            {!compatible && (
                <Text size="sm" color="light">{`Requires Persephone ≥ ${board.minAppVersion}`}</Text>
            )}

            <Panel direction="row" gap="sm" align="center">
                {!inst ? (
                    <Button size="sm" disabled={!compatible} onClick={openInstall}>Install…</Button>
                ) : (
                    <>
                        {update && <Button size="sm" onClick={openProperties}>Update…</Button>}
                        <Button size="sm" variant="ghost" onClick={openProperties}>Properties</Button>
                    </>
                )}
            </Panel>
        </Panel>
    );
}
