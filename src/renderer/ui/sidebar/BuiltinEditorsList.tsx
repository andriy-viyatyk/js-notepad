import { useCallback, useMemo } from "react";
import { TraitSet, traited } from "../../core/traits/traits";
import { CreatableItem, getCreatableItems } from "./tools-editors-registry";
import { usePinnedRefs, addPin } from "./pinned-items";
import { settings } from "../../api/settings";
import { PinIcon } from "../../theme/icons";
import { ListBox, LIST_ITEM_KEY, IconButton } from "../../uikit";
import type { ListItemRenderContext } from "../../uikit";
import { RowStyled } from "./PinnedRail";

// =============================================================================
// Built-in creatable-editors list (EPIC-036 / US-870). The unpinned half of the
// creatable-items registry, each row pinnable + create-on-click. Shared by the
// AppBar panel's "Built-in" tab and the hub page's "Built-in" tab. Chrome file —
// Emotion allowed (UIKit Rule 7); shares `RowStyled` with the pinned rail.
// =============================================================================

type SectionMarker = { kind: "section"; label: string };
type RowSource = CreatableItem | SectionMarker;

const isSection = (x: RowSource): x is SectionMarker =>
    "kind" in x && x.kind === "section";

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

interface BuiltinEditorsListProps {
    /** Close the containing surface (AppBar panel) after creating a page. Omit in the hub. */
    onClose?: () => void;
}

export function BuiltinEditorsList({ onClose }: BuiltinEditorsListProps) {
    const browserProfiles = settings.use("browser-profiles");
    const pinnedRefs = usePinnedRefs();

    const allItems = useMemo(() => getCreatableItems(browserProfiles), [browserProfiles]);

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

    const handlePin = useCallback((id: string) => { addPin({ kind: "editor", id }); }, []);

    const handleChange = useCallback((source: RowSource) => {
        if (!isSection(source)) {
            source.create();
            onClose?.();
        }
    }, [onClose]);

    const renderItem = useCallback((ctx: ListItemRenderContext<RowSource>) => {
        if (isSection(ctx.source)) return null;
        return <UnpinnedRow item={ctx.source} onPin={handlePin} />;
    }, [handlePin]);

    return (
        <ListBox<RowSource>
            name="tools-builtin-list"
            items={tUnpinned}
            rowHeight={28}
            whiteSpaceY={8}
            onChange={handleChange}
            renderItem={renderItem}
        />
    );
}
