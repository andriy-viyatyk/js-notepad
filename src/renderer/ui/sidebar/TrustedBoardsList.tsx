import { useCallback, useEffect, useMemo } from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { app } from "../../api/app";
import { boardTrust } from "../../api/board-trust";
import { createLinkData } from "../../../shared/link-data";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { fpBasename, fpDirname } from "../../core/utils/file-path";
import { TraitSet, traited } from "../../core/traits/traits";
import { ListBox, LIST_ITEM_KEY, IconButton } from "../../uikit";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import type { ListItemRenderContext, MenuItem } from "../../uikit";
import { PinIcon, PinFilledIcon } from "../../theme/icons";
import { BoardGlyph } from "../../editors/board/BoardGlyph";
import { usePinnedRefs, addPin, removePin, type PinnedRef } from "./pinned-items";

// =============================================================================
// Types
// =============================================================================

type FolderSection = { kind: "section"; label: string };
type BoardRow = { kind: "board"; root: string };
type RowSource = FolderSection | BoardRow;

const isSection = (x: RowSource): x is FolderSection => x.kind === "section";

// =============================================================================
// Traits
// =============================================================================

// Folder headers and board rows are both rendered via `renderItem` (so the folder
// label can be left-aligned and the boards indented like a tree) — hence `section`
// is always false; the built-in centered SectionItem is not used.
const rowTraits = new TraitSet().add(LIST_ITEM_KEY, {
    value: (item: unknown) => {
        const it = item as RowSource;
        return isSection(it) ? `section-${it.label}` : it.root;
    },
    label: (item: unknown) => {
        const it = item as RowSource;
        return isSection(it) ? it.label : fpBasename(it.root);
    },
    section: () => false,
});

// =============================================================================
// Row chrome (chrome exception per UIKit Rule 7)
// =============================================================================

const FolderHeaderStyled = styled.div({
    display: "flex",
    alignItems: "center",
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    padding: "5px 12px",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: color.text.light,
    cursor: "default",
    userSelect: "none",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
}, { label: "TrustedBoardsFolderHeader" });

function FolderHeader({ label }: { label: string }) {
    return (
        <FolderHeaderStyled data-type="trusted-boards-folder" title={label}>
            {label}
        </FolderHeaderStyled>
    );
}

const RowStyled = styled.div({
    display: "flex",
    alignItems: "center",
    gap: 8,
    // Extra left padding indents boards under their folder header (tree-like).
    padding: "5px 12px 5px 28px",
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    cursor: "pointer",
    color: color.text.default,
    fontSize: 13,
    "&:hover": { background: color.background.light },

    "& .item-label": {
        flex: "1 1 auto",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    "& .item-icon": {
        display: "inline-flex",
        width: 18,
        height: 18,
        flexShrink: 0,
        alignItems: "center",
    },
    "& .pin-button-wrapper": { display: "inline-flex", opacity: 0, flexShrink: 0 },
    "&:hover .pin-button-wrapper": { opacity: 1 },
    '&[data-pinned="true"] .pin-button-wrapper': { opacity: 1 },
}, { label: "TrustedBoardRow" });

function BoardRowView({ root, pinned, onTogglePin }: {
    root: string;
    pinned: boolean;
    onTogglePin: (root: string) => void;
}) {
    const handlePin = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onTogglePin(root);
    }, [onTogglePin, root]);

    return (
        <RowStyled data-type="trusted-board-row" data-pinned={pinned ? "true" : undefined}>
            <span className="item-icon"><BoardGlyph boardRoot={root} /></span>
            <span className="item-label">{fpBasename(root)}</span>
            <span className="pin-button-wrapper">
                <IconButton
                    size="sm"
                    icon={pinned ? <PinFilledIcon /> : <PinIcon />}
                    title={pinned ? "Unpin" : "Pin to menu"}
                    onClick={handlePin}
                />
            </span>
        </RowStyled>
    );
}

// =============================================================================
// Panel
// =============================================================================

interface TrustedBoardsListProps {
    onClose?: () => void;
}

export function TrustedBoardsList({ onClose }: TrustedBoardsListProps) {
    // board-trust is a recent.ts-style global model; load() populates the shared
    // reactive state. Idempotent, so a re-mount or a concurrent editor load is safe.
    useEffect(() => {
        void boardTrust.load();
    }, []);

    const paths = boardTrust.useTrustedPaths();
    const pinnedRefs = usePinnedRefs();

    const pinnedRoots = useMemo(
        () => new Set(pinnedRefs.filter((r) => r.kind === "board").map((r) => (r as { root: string }).root)),
        [pinnedRefs],
    );

    const rows = useMemo<RowSource[]>(() => {
        // Group by containing folder, sort folders, then boards within each by name.
        const byFolder = new Map<string, string[]>();
        for (const p of paths) {
            const dir = fpDirname(p);
            const list = byFolder.get(dir) ?? [];
            list.push(p);
            byFolder.set(dir, list);
        }
        const out: RowSource[] = [];
        const folders = [...byFolder.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        for (const [folder, boards] of folders) {
            out.push({ kind: "section", label: folder });
            boards.sort((a, b) => fpBasename(a).localeCompare(fpBasename(b)));
            for (const root of boards) out.push({ kind: "board", root });
        }
        return out;
    }, [paths]);

    const tRows = useMemo(() => traited(rows, rowTraits), [rows]);

    const openBoard = useCallback((root: string) => {
        void app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink(root)));
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
        app.ui.notify("Removed from trusted boards", "info");
    }, []);

    const handleChange = useCallback((source: RowSource) => {
        if (!isSection(source)) openBoard(source.root);
    }, [openBoard]);

    const getContextMenu = useCallback((source: RowSource): MenuItem[] | undefined => {
        if (isSection(source)) return undefined;
        const root = source.root;
        return [
            {
                label: "Remove",
                onClick: () => { void handleRemove(root); },
            },
        ];
    }, [handleRemove]);

    const renderItem = useCallback((ctx: ListItemRenderContext<RowSource>) => {
        const src = ctx.source;
        if (isSection(src)) return <FolderHeader label={src.label} />;
        return <BoardRowView root={src.root} pinned={pinnedRoots.has(src.root)} onTogglePin={handleTogglePin} />;
    }, [pinnedRoots, handleTogglePin]);

    if (paths.length === 0) {
        return (
            <Panel padding="md">
                <Text size="sm" color="light">No trusted boards yet</Text>
            </Panel>
        );
    }

    return (
        <ListBox<RowSource>
            name="sidebar-trusted-boards-list"
            items={tRows}
            rowHeight={28}
            whiteSpaceY={8}
            onChange={handleChange}
            getContextMenu={getContextMenu}
            renderItem={renderItem}
        />
    );
}
