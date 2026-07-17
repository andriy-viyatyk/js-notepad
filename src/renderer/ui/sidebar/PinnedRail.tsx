import { useCallback, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { TraitTypeId, setTraitDragData, hasTraitDragData } from "../../core/traits";
import color from "../../theme/color";
import { app } from "../../api/app";
import { settings } from "../../api/settings";
import { createLinkData } from "../../../shared/link-data";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { fpBasename } from "../../core/utils/file-path";
import { CreatableItem, getCreatableItems } from "./tools-editors-registry";
import { usePinnedRefs, removePin, movePin, type PinnedRef } from "./pinned-items";
import { PinFilledIcon } from "../../theme/icons";
import { IconButton } from "../../uikit";
import { BoardGlyph } from "../../editors/board/BoardGlyph";

// =============================================================================
// Shared "Pinned" rail for the Tools & Editors surfaces (EPIC-036 pins + US-870).
// The AppBar panel renders it horizontally at the top; the Tools & Editors hub
// page renders it as a vertical right rail. Same rows + drag-reorder, different
// container (the `layout` prop). Chrome file — Emotion allowed (UIKit Rule 7).
// =============================================================================

// Tracks which pinned index is being dragged for live reorder. One drag at a time.
let draggingPinnedIndex = -1;

// --- Shared row chrome (also consumed by BuiltinEditorsList) ---

export const RowStyled = styled.div({
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

const PinnedRegion = styled.div({
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    '&[data-layout="horizontal"]': {
        flex: "0 1 auto",
        maxHeight: "50%",
        borderBottom: `1px solid ${color.border.default}`,
    },
    '&[data-layout="vertical"]': {
        width: 240,
        flexShrink: 0,
        height: "100%",
        borderLeft: `1px solid ${color.border.default}`,
    },
}, { label: "ToolsEditorsPinned" });

const SectionHeader = styled.div({
    padding: "6px 12px 4px",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: color.text.light,
    flexShrink: 0,
}, { label: "ToolsEditorsSectionHeader" });

const PinnedScroll = styled.div({
    overflowY: "auto",
    minHeight: 0,
}, { label: "ToolsEditorsPinnedScroll" });

// --- Drag behavior (operates on the unified pinned index space) ---

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

// --- Pinned rows ---

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

// --- Component ---

interface PinnedRailProps {
    /** "horizontal" — top region in the AppBar panel; "vertical" — right rail in the hub page. */
    layout: "horizontal" | "vertical";
    /** Close the containing surface (AppBar panel) after activating a pinned item. Omit in the hub. */
    onClose?: () => void;
}

export function PinnedRail({ layout, onClose }: PinnedRailProps) {
    const browserProfiles = settings.use("browser-profiles");
    const pinnedRefs = usePinnedRefs();

    const editorById = useMemo(() => {
        const map = new Map<string, CreatableItem>();
        for (const item of getCreatableItems(browserProfiles)) map.set(item.id, item);
        return map;
    }, [browserProfiles]);

    const activateBoard = useCallback((root: string) => {
        void app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink(root)));
        onClose?.();
    }, [onClose]);

    const handleUnpin = useCallback((ref: PinnedRef) => { removePin(ref); }, []);

    if (pinnedRefs.length === 0) return null;

    return (
        <PinnedRegion data-type="tools-editors-pinned" data-layout={layout}>
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
    );
}
