import { useCallback, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { TraitTypeId, setTraitDragData, hasTraitDragData } from "../../core/traits";
import { TraitSet, traited } from "../../core/traits/traits";
import color from "../../theme/color";
import { app } from "../../api/app";
import { settings } from "../../api/settings";
import { createLinkData } from "../../../shared/link-data";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { fpBasename } from "../../core/utils/file-path";
import { CreatableItem, getCreatableItems } from "./tools-editors-registry";
import {
    usePinnedRefs, addPin, removePin, movePin, type PinnedRef,
} from "./pinned-items";
import { PinIcon, PinFilledIcon } from "../../theme/icons";
import { ListBox, LIST_ITEM_KEY, IconButton, SegmentedControl } from "../../uikit";
import type { ListItemRenderContext } from "../../uikit";
import { BoardGlyph } from "../../editors/board/BoardGlyph";
import { TrustedBoardsList } from "./TrustedBoardsList";
import { TrustedToolsList } from "./TrustedToolsList";

// =============================================================================
// Types
// =============================================================================

type SectionMarker = { kind: "section"; label: string };
type RowSource = CreatableItem | SectionMarker;

const isSection = (x: RowSource): x is SectionMarker =>
    "kind" in x && x.kind === "section";

// =============================================================================
// Module-level drag state
// =============================================================================

/** Tracks which pinned index is being dragged for live reorder. One drag at a time. */
let draggingPinnedIndex = -1;

// =============================================================================
// Traits (editors tab list)
// =============================================================================

const rowTraits = new TraitSet().add(LIST_ITEM_KEY, {
    value: (item: unknown) => {
        const it = item as RowSource;
        return isSection(it) ? `section-${it.label}` : it.id;
    },
    label: (item: unknown) => (item as RowSource).label,
    icon: (item: unknown) => {
        const it = item as RowSource;
        return isSection(it) ? undefined : it.icon;
    },
    section: (item: unknown) => isSection(item as RowSource),
});

// =============================================================================
// Layout chrome (chrome exception per UIKit Rule 7)
// =============================================================================

const PanelRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
}, { label: "ToolsEditorsPanelRoot" });

const PinnedRegion = styled.div({
    display: "flex",
    flexDirection: "column",
    flex: "0 1 auto",
    minHeight: 0,
    maxHeight: "50%",
    borderBottom: `1px solid ${color.border.default}`,
}, { label: "ToolsEditorsPinned" });

const PinnedScroll = styled.div({
    overflowY: "auto",
    minHeight: 0,
}, { label: "ToolsEditorsPinnedScroll" });

const SectionHeader = styled.div({
    padding: "6px 12px 4px",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: color.text.light,
    flexShrink: 0,
}, { label: "ToolsEditorsSectionHeader" });

const TabsBar = styled.div({
    display: "flex",
    padding: "8px 12px",
    flexShrink: 0,
}, { label: "ToolsEditorsTabsBar" });

const TabBody = styled.div({
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    minHeight: 0,
}, { label: "ToolsEditorsTabBody" });

const RowStyled = styled.div({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 12px",
    width: "100%",
    height: 28,
    boxSizing: "border-box",
    cursor: "pointer",
    color: color.text.default,
    fontSize: 13,
    "&:hover": { background: color.background.light },
    "&[data-dragging]": { opacity: 0.4 },
    "&[data-drag-over]": { borderTop: `2px solid ${color.border.active}` },

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
        "& svg": { width: 16, height: 16 },
    },
    "& .pin-button-wrapper": { display: "inline-flex", opacity: 0, flexShrink: 0 },
    "&:hover .pin-button-wrapper": { opacity: 1 },
}, { label: "ToolsEditorsRow" });

// =============================================================================
// Shared pinned-row drag behavior (operates on the unified pinned index space)
// =============================================================================

function usePinnedDrag(index: number, onMove: (drag: number, hover: number) => void) {
    const [isDragging, setIsDragging] = useState(false);
    const [isOver, setIsOver] = useState(false);

    const handlers = {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
            e.stopPropagation();
            draggingPinnedIndex = index;
            setTraitDragData(e.dataTransfer, TraitTypeId.PinnedEditor, { index });
            setIsDragging(true);
        },
        onDragEnd: () => {
            draggingPinnedIndex = -1;
            setIsDragging(false);
            setIsOver(false);
        },
        onDragEnter: (e: React.DragEvent) => {
            if (hasTraitDragData(e.dataTransfer) &&
                draggingPinnedIndex >= 0 &&
                draggingPinnedIndex !== index) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setIsOver(true);
            }
        },
        // Live reorder during dragOver — matches React-DnD's hover() behavior.
        onDragOver: (e: React.DragEvent) => {
            if (draggingPinnedIndex >= 0 && draggingPinnedIndex !== index) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                onMove(draggingPinnedIndex, index);
                draggingPinnedIndex = index;
            }
        },
        onDragLeave: () => setIsOver(false),
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setIsOver(false);
        },
    };

    return { isDragging, isOver, handlers };
}

// =============================================================================
// Pinned rows
// =============================================================================

function PinnedEditorRow({ item, index, onMove, onUnpin, onActivate }: {
    item: CreatableItem;
    index: number;
    onMove: (drag: number, hover: number) => void;
    onUnpin: () => void;
    onActivate: () => void;
}) {
    const { isDragging, isOver, handlers } = usePinnedDrag(index, onMove);
    const handleUnpin = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onUnpin();
    }, [onUnpin]);

    return (
        <RowStyled
            data-type="tools-editor-row"
            data-dragging={isDragging || undefined}
            data-drag-over={isOver || undefined}
            onClick={onActivate}
            {...handlers}
        >
            <span className="item-icon">{item.icon}</span>
            <span className="item-label">{item.label}</span>
            <span className="pin-button-wrapper">
                <IconButton size="sm" icon={<PinFilledIcon />} title="Unpin" onClick={handleUnpin} />
            </span>
        </RowStyled>
    );
}

function PinnedBoardRow({ root, index, onMove, onUnpin, onActivate }: {
    root: string;
    index: number;
    onMove: (drag: number, hover: number) => void;
    onUnpin: () => void;
    onActivate: () => void;
}) {
    const { isDragging, isOver, handlers } = usePinnedDrag(index, onMove);
    const handleUnpin = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onUnpin();
    }, [onUnpin]);

    return (
        <RowStyled
            data-type="tools-board-row"
            data-dragging={isDragging || undefined}
            data-drag-over={isOver || undefined}
            onClick={onActivate}
            {...handlers}
        >
            <span className="item-icon"><BoardGlyph boardRoot={root} /></span>
            <span className="item-label">{fpBasename(root)}</span>
            <span className="pin-button-wrapper">
                <IconButton size="sm" icon={<PinFilledIcon />} title="Unpin" onClick={handleUnpin} />
            </span>
        </RowStyled>
    );
}

// =============================================================================
// Unpinned row (editors tab)
// =============================================================================

function UnpinnedRow({ item, onPin }: { item: CreatableItem; onPin: (id: string) => void }) {
    const handlePin = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onPin(item.id);
    }, [onPin, item.id]);

    return (
        <RowStyled data-type="tools-editor-row">
            <span className="item-icon">{item.icon}</span>
            <span className="item-label">{item.label}</span>
            <span className="pin-button-wrapper">
                <IconButton size="sm" icon={<PinIcon />} title="Pin to menu" onClick={handlePin} />
            </span>
        </RowStyled>
    );
}

// =============================================================================
// Panel
// =============================================================================

interface ToolsEditorsPanelProps {
    onClose?: () => void;
}

export function ToolsEditorsPanel({ onClose }: ToolsEditorsPanelProps) {
    const browserProfiles = settings.use("browser-profiles");
    const pinnedRefs = usePinnedRefs();
    const [tab, setTab] = useState<"editors" | "boards" | "tools">("editors");

    const allItems = useMemo(
        () => getCreatableItems(browserProfiles),
        [browserProfiles],
    );

    const editorById = useMemo(() => {
        const map = new Map<string, CreatableItem>();
        for (const item of allItems) map.set(item.id, item);
        return map;
    }, [allItems]);

    const pinnedEditorIds = useMemo(
        () => new Set(pinnedRefs.filter((r) => r.kind === "editor").map((r) => (r as { id: string }).id)),
        [pinnedRefs],
    );

    const unpinnedItems = useMemo(() => {
        return allItems
            .filter((item) => !pinnedEditorIds.has(item.id))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [allItems, pinnedEditorIds]);

    const tUnpinned = useMemo(() => traited(unpinnedItems as RowSource[], rowTraits), [unpinnedItems]);

    const activateBoard = useCallback((root: string) => {
        void app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink(root)));
        onClose?.();
    }, [onClose]);

    const handlePin = useCallback((id: string) => {
        addPin({ kind: "editor", id });
    }, []);

    const handleUnpin = useCallback((ref: PinnedRef) => {
        removePin(ref);
    }, []);

    const handleChangeUnpinned = useCallback((source: RowSource) => {
        if (!isSection(source)) {
            source.create();
            onClose?.();
        }
    }, [onClose]);

    const renderUnpinned = useCallback((ctx: ListItemRenderContext<RowSource>) => {
        if (isSection(ctx.source)) return null;
        return <UnpinnedRow item={ctx.source} onPin={handlePin} />;
    }, [handlePin]);

    return (
        <PanelRoot data-type="tools-editors-panel">
            {pinnedRefs.length > 0 && (
                <PinnedRegion>
                    <SectionHeader>Pinned</SectionHeader>
                    <PinnedScroll>
                        {pinnedRefs.map((ref, i) => {
                            if (ref.kind === "board") {
                                return (
                                    <PinnedBoardRow
                                        key={`b:${ref.root}`}
                                        root={ref.root}
                                        index={i}
                                        onMove={movePin}
                                        onUnpin={() => handleUnpin(ref)}
                                        onActivate={() => activateBoard(ref.root)}
                                    />
                                );
                            }
                            const item = editorById.get(ref.id);
                            if (!item) return null; // stale pin (e.g. removed browser profile)
                            return (
                                <PinnedEditorRow
                                    key={`e:${ref.id}`}
                                    item={item}
                                    index={i}
                                    onMove={movePin}
                                    onUnpin={() => handleUnpin(ref)}
                                    onActivate={() => { item.create(); onClose?.(); }}
                                />
                            );
                        })}
                    </PinnedScroll>
                </PinnedRegion>
            )}

            <TabsBar>
                <SegmentedControl
                    name="tools-editors-tabs"
                    size="sm"
                    value={tab}
                    onChange={(v) => setTab(v as "editors" | "boards" | "tools")}
                    items={[
                        { value: "editors", label: "Built-in Editors" },
                        { value: "boards", label: "Boards" },
                        { value: "tools", label: "Tools" },
                    ]}
                />
            </TabsBar>

            <TabBody>
                {tab === "editors" ? (
                    <ListBox<RowSource>
                        name="sidebar-tools-list"
                        items={tUnpinned}
                        rowHeight={28}
                        whiteSpaceY={8}
                        onChange={handleChangeUnpinned}
                        renderItem={renderUnpinned}
                    />
                ) : tab === "boards" ? (
                    <TrustedBoardsList onClose={onClose} />
                ) : (
                    <TrustedToolsList onClose={onClose} />
                )}
            </TabBody>
        </PanelRoot>
    );
}
