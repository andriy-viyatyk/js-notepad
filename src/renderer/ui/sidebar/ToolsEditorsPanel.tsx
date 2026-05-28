import { useCallback, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { TraitTypeId, setTraitDragData, hasTraitDragData } from "../../core/traits";
import { TraitSet, traited } from "../../core/traits/traits";
import color from "../../theme/color";
import { settings } from "../../api/settings";
import { CreatableItem, DEFAULT_PINNED_EDITORS, getCreatableItems } from "./tools-editors-registry";
import { PinIcon, PinFilledIcon } from "../../theme/icons";
import { ListBox, LIST_ITEM_KEY, IconButton } from "../../uikit";
import type { ListItemRenderContext } from "../../uikit";

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

/** Tracks which index is being dragged for live reorder. Only one drag at a time. */
let draggingPinnedEditorIndex = -1;

// =============================================================================
// Traits
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
// Row chrome (chrome exception per Rule 7 — see doc/tasks//README.md)
// =============================================================================

const RowStyled = styled.div({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 12px",
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    cursor: "pointer",
    color: color.text.default,
    fontSize: 13,
    "&:hover":             { background: color.background.light },
    "&[data-dragging]":    { opacity: 0.4 },
    "&[data-drag-over]":   { borderTop: `2px solid ${color.border.active}` },

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
        "& svg": { width: 16, height: 16 },
    },

    "& .pin-button-wrapper":       { display: "inline-flex", opacity: 0, flexShrink: 0 },
    "&:hover .pin-button-wrapper": { opacity: 1 },
}, { label: "ToolsEditorsRow" });

// =============================================================================
// Pinned row (draggable)
// =============================================================================

function PinnedRow({ item, index, onUnpin, onMove }: {
    item: CreatableItem;
    index: number;
    onUnpin: (id: string) => void;
    onMove: (dragIndex: number, hoverIndex: number) => void;
}) {
    const [isDragging, setIsDragging] = useState(false);
    const [isOver, setIsOver] = useState(false);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        e.stopPropagation();
        draggingPinnedEditorIndex = index;
        setTraitDragData(e.dataTransfer, TraitTypeId.PinnedEditor, { index });
        setIsDragging(true);
    }, [index]);

    const handleDragEnd = useCallback(() => {
        draggingPinnedEditorIndex = -1;
        setIsDragging(false);
        setIsOver(false);
    }, []);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        if (hasTraitDragData(e.dataTransfer) &&
            draggingPinnedEditorIndex >= 0 &&
            draggingPinnedEditorIndex !== index) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setIsOver(true);
        }
    }, [index]);

    // Live reorder during dragOver — matches React-DnD's hover() behavior
    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (draggingPinnedEditorIndex >= 0 && draggingPinnedEditorIndex !== index) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            onMove(draggingPinnedEditorIndex, index);
            draggingPinnedEditorIndex = index;
        }
    }, [index, onMove]);

    const handleDragLeave = useCallback(() => setIsOver(false), []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsOver(false);
    }, []);

    const handleUnpin = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onUnpin(item.id);
    }, [onUnpin, item.id]);

    return (
        <RowStyled
            data-type="tools-editor-row"
            data-dragging={isDragging || undefined}
            data-drag-over={isOver || undefined}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <span className="item-icon">{item.icon}</span>
            <span className="item-label">{item.label}</span>
            <span className="pin-button-wrapper">
                <IconButton
                    size="sm"
                    icon={<PinFilledIcon />}
                    title="Unpin"
                    onClick={handleUnpin}
                />
            </span>
        </RowStyled>
    );
}

// =============================================================================
// Unpinned row
// =============================================================================

function UnpinnedRow({ item, onPin }: {
    item: CreatableItem;
    onPin: (id: string) => void;
}) {
    const handlePin = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onPin(item.id);
    }, [onPin, item.id]);

    return (
        <RowStyled data-type="tools-editor-row">
            <span className="item-icon">{item.icon}</span>
            <span className="item-label">{item.label}</span>
            <span className="pin-button-wrapper">
                <IconButton
                    size="sm"
                    icon={<PinIcon />}
                    title="Pin to menu"
                    onClick={handlePin}
                />
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
    const pinnedIds: string[] = settings.use("pinned-editors") ?? DEFAULT_PINNED_EDITORS;

    const allItems = useMemo(
        () => getCreatableItems(browserProfiles),
        [browserProfiles],
    );

    // Drag reorder tracking — use a ref to avoid re-render loops during drag
    const dragOrderRef = useRef<string[] | null>(null);

    const pinnedItems = useMemo(() => {
        const ids = dragOrderRef.current ?? pinnedIds;
        return ids
            .map((id) => allItems.find((item) => item.id === id))
            .filter(Boolean) as CreatableItem[];
    }, [pinnedIds, allItems]);

    const unpinnedItems = useMemo(() => {
        const pinSet = new Set(pinnedIds);
        return allItems
            .filter((item) => !pinSet.has(item.id))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [pinnedIds, allItems]);

    const allRows = useMemo<RowSource[]>(() => {
        const out: RowSource[] = [];
        if (pinnedItems.length > 0) {
            out.push({ kind: "section", label: "Pinned" });
            out.push(...pinnedItems);
        }
        if (unpinnedItems.length > 0) {
            out.push({ kind: "section", label: "All Editors & Tools" });
            out.push(...unpinnedItems);
        }
        return out;
    }, [pinnedItems, unpinnedItems]);

    const tRows = useMemo(() => traited(allRows, rowTraits), [allRows]);

    const handlePin = useCallback((id: string) => {
        const current: string[] = settings.get("pinned-editors") ?? DEFAULT_PINNED_EDITORS;
        if (!current.includes(id)) {
            settings.set("pinned-editors", [...current, id]);
        }
        dragOrderRef.current = null;
    }, []);

    const handleUnpin = useCallback((id: string) => {
        const current: string[] = settings.get("pinned-editors") ?? DEFAULT_PINNED_EDITORS;
        settings.set("pinned-editors", current.filter((i) => i !== id));
        dragOrderRef.current = null;
    }, []);

    const handleMove = useCallback((dragIndex: number, hoverIndex: number) => {
        const current: string[] = dragOrderRef.current
            ?? [...(settings.get("pinned-editors") ?? DEFAULT_PINNED_EDITORS)];
        const [removed] = current.splice(dragIndex, 1);
        current.splice(hoverIndex, 0, removed);
        dragOrderRef.current = current;
        settings.set("pinned-editors", [...current]);
    }, []);

    const handleChange = useCallback((source: RowSource) => {
        if (!isSection(source)) {
            source.create();
            onClose?.();
        }
    }, [onClose]);

    const renderItem = useCallback((ctx: ListItemRenderContext<RowSource>) => {
        if (isSection(ctx.source)) return null;
        const src = ctx.source;
        const pIdx = pinnedItems.indexOf(src);
        return pIdx >= 0
            ? <PinnedRow item={src} index={pIdx} onUnpin={handleUnpin} onMove={handleMove} />
            : <UnpinnedRow item={src} onPin={handlePin} />;
    }, [pinnedItems, handleUnpin, handleMove, handlePin]);

    return (
        <ListBox<RowSource>
            name="sidebar-tools-list"
            items={tRows}
            rowHeight={28}
            whiteSpaceY={8}
            onChange={handleChange}
            renderItem={renderItem}
        />
    );
}
