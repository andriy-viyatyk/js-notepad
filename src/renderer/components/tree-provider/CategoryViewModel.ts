import { TComponentModel } from "../../core/state/model";
import type { ITreeProvider, ITreeProviderItem } from "../../api/types/io.tree";
import type { MenuItem } from "../../uikit/Menu";
import { ContextMenuEvent } from "../../api/events/events";
import { app } from "../../api/app";
import {
    supportsOsClipboard,
} from "./os-clipboard";
import {
    buildMultiItemMenuItems,
    deleteItemsBatch,
    pruneNestedItems,
    supportsMultiSelect,
} from "./plural-actions";
import {
    dropOsFilesInto,
    moveItemsInto,
    type DropTarget,
} from "./tree-drop-actions";
import { fpBasename } from "../../core/utils/file-path";
import {
    getTraitDragDataFromEvent,
    hasTraitDragData,
    isFileDrag,
} from "../../core/traits";
import { api } from "../../../ipc/renderer/api";
import {
    createNewFile,
    createNewFolder,
    deleteItemAction,
    pasteIntoDir,
    renameItem,
    type ItemCrudContext,
} from "./item-crud-actions";
import {
    getBackgroundMenuItems,
    getFileMenuItems,
    getFolderMenuItems,
    type ItemMenuActions,
} from "./item-menus";
import { getTraitDropAction } from "./drop-dispatch";
import { DragEnterCounter } from "../../uikit/shared/drag-enter-counter";
import { sameHref, sameHrefs } from "./href-utils";
import type { GridModelCapability } from "../../uikit/VirtualGrid";

// =============================================================================
// Types
// =============================================================================

/** All modes defined for future use. Only "list" is implemented initially. */
export type CategoryViewMode =
    | "list"
    | "tiles-landscape"
    | "tiles-landscape-big"
    | "tiles-portrait"
    | "tiles-portrait-big";

/** Presentation callbacks owned by a folder page and rendered by its editor-level host. */
export interface CategoryItemsRendererProps {
    items: ITreeProviderItem[];
    viewMode: CategoryViewMode;
    selectedId?: string;
    selectedIds?: ReadonlySet<string>;
    searchText: string;
    onSelect: (item: ITreeProviderItem, event?: MouseEvent) => void;
    onDoubleClick: (item: ITreeProviderItem) => void;
    onEdit?: (item: ITreeProviderItem) => void;
    onDelete?: (item: ITreeProviderItem, skipConfirm: boolean) => void;
    onContextMenu: (e: MouseEvent, item: ITreeProviderItem) => void;
    onGridModel: (model: GridModelCapability | null) => void;
    onItemDragEnter?: (item: ITreeProviderItem, e: DragEvent) => void;
    onItemDragOver?: (item: ITreeProviderItem, e: DragEvent) => void;
    onItemDragLeave?: (item: ITreeProviderItem, e: DragEvent) => void;
    onItemDrop?: (item: ITreeProviderItem, e: DragEvent) => void;
    dropTargetId?: string | null;
    dragSourceId?: string;
    onDragStartOverride?: (item: ITreeProviderItem, event: DragEvent) => boolean;
}

export interface CategoryViewProps {
    provider: ITreeProvider;
    /** Category path to display items for */
    category: string;
    /** Called when user clicks a non-directory item */
    onItemClick?: (item: ITreeProviderItem) => void;
    /** Called when user double-clicks a non-directory item */
    onItemDoubleClick?: (item: ITreeProviderItem) => void;
    /** Called when user clicks a directory item (navigate into) */
    onFolderClick?: (item: ITreeProviderItem) => void;
    /** Currently selected item href */
    selectedHref?: string;
    /** View mode. Default: "list" */
    viewMode?: CategoryViewMode;
    /** Called when view mode changes */
    onViewModeChange?: (mode: CategoryViewMode) => void;
    /** Portal target for search controls. When set, search renders there instead of own toolbar. */
    toolbarPortalRef?: HTMLElement | null;
    /** Allow Ctrl/Shift-click multi-selection and plural actions. Passed only where a plural
     *  file operation is meaningful (`supportsMultiSelect`) — every other provider's folder
     *  page stays single-select. */
    multiSelect?: boolean;
    /** Editor-level renderer for the Link-style folder items. */
    renderItems: (props: CategoryItemsRendererProps) => Node;
    /** Called before the current rendered item Node is removed from the bridge host. */
    onItemsDisposed?: () => void;
}

export interface CategoryViewState {
    items: ITreeProviderItem[];
    filteredItems: ITreeProviderItem[];
    searchText: string;
    loading: boolean;
    error: string | null;
    /**
     * The view's own selection, as hrefs. Transient: cleared when the category or provider
     * changes, never persisted — a folder page is re-listed from scratch each time it opens.
     * `props.selectedHref` remains the *primary* item and is what the Explorer tree shares;
     * this set is local to the content view.
     */
    selectedHrefs: string[];
    /** href of the row/tile currently under a drag, or null. */
    dropTargetHref: string | null;
    /** True while a drag the view accepts is anywhere inside it. Paired with a null
     *  `dropTargetHref` this is the whitespace-drop highlight — "the open folder". */
    dropOverView: boolean;
}

export const defaultCategoryViewState: CategoryViewState = {
    items: [],
    filteredItems: [],
    searchText: "",
    loading: false,
    error: null,
    selectedHrefs: [],
    dropTargetHref: null,
    dropOverView: false,
};

// =============================================================================
// Model
// =============================================================================

export class CategoryViewModel extends TComponentModel<
    CategoryViewState,
    CategoryViewProps
> {
    /** Shift+click / Shift-range anchor, held as an href rather than an index — the visible
     *  order changes with the search filter, which would silently move an index anchor.
     *  Transient on purpose: it must not trigger a render. */
    private anchorHref: string | null = null;

    /** Live-refresh subscription on the provider's optional `watch`. See `subscribeWatch`. */
    private watchSubscription?: { unsubscribe: () => void };

    setProps = () => {
        // Captured: both flags are reset before the deferred callback below runs.
        const first = this.isFirstUse;
        const providerChanged = first || this.oldProps?.provider !== this.props.provider;
        const navigated = !first && (
            this.oldProps?.category !== this.props.category
            || this.oldProps?.provider !== this.props.provider
        );
        const { selectedHref, multiSelect } = this.props;
        // The primary item changed from the outside: first render, a new folder, or the
        // Explorer tree navigating. Ctrl/Shift gestures never trigger this — a plain click
        // sets the local set to exactly `[selectedHref]`, so the seed below finds it present
        // and leaves the set alone (which is what keeps Ctrl-deselecting the primary from
        // snapping it back).
        const seed = multiSelect
            && !!selectedHref
            && (first || navigated || this.oldProps?.selectedHref !== selectedHref);

        if (!first && !navigated && !seed) return;

        // Deferred — setProps runs during render, where a state write is not allowed.
        Promise.resolve().then(() => {
            if (!this.isLive) return;
            if (providerChanged) this.subscribeWatch();
            if (navigated) this.resetSelection();
            if (seed
                && selectedHref
                && !this.state.get().selectedHrefs.some((h) => sameHref(h, selectedHref))
            ) {
                this.anchorHref = selectedHref;
                this.setSelection([selectedHref]);
            }
            if (first || navigated) void this.loadItems();
        });
    };

    // ── Data loading ─────────────────────────────────────────────────────

    /**
     * Subscribe to the provider's optional `watch` so the listing tracks changes made
     * anywhere else — the Explorer tree, another window, Windows Explorer, or an agent.
     * Without it the folder page keeps showing whatever `list` returned when it opened,
     * even though the tree beside it refreshes.
     *
     * `watch` is an opt-in provider capability rather than part of `ITreeProvider`, hence
     * the duck-typed check (same as the tree's). Providers that implement it: file (a
     * recursive `fs.watch`, debounced 500ms), mneme (`resources/list_changed`) and link
     * collections (the editor's `links` array identity). Archive providers have none, so
     * their folder pages behave exactly as before.
     *
     * Re-listing is cheap and never flashes: `loadItems` keeps the old items on screen
     * (the loading placeholder is gated on an empty listing) and re-validates the
     * selection against what still exists.
     */
    private subscribeWatch = () => {
        this.watchSubscription?.unsubscribe();
        this.watchSubscription = undefined;
        const provider = this.props.provider as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (typeof provider.watch === "function") {
            this.watchSubscription = provider.watch(() => {
                // A debounced callback can still arrive after the page closed.
                if (this.isLive) void this.loadItems();
            });
        }
    };

    dispose = () => {
        this.watchSubscription?.unsubscribe();
        this.watchSubscription = undefined;
    };

    loadItems = async () => {
        this.state.update((s) => { s.loading = true; s.error = null; });

        try {
            const items = await this.props.provider.list(this.props.category);
            const { searchText, selectedHrefs } = this.state.get();
            const filteredItems = filterItems(items, searchText);
            // Drop anything that no longer exists — a file deleted here or removed
            // externally must not stay selected and be acted on by the next batch action.
            const kept = selectedHrefs.filter(
                (href) => items.some((i) => sameHref(i.href, href)),
            );

            this.state.update((s) => {
                s.items = items;
                s.filteredItems = filteredItems;
                s.loading = false;
                s.error = null;
                if (kept.length !== selectedHrefs.length) s.selectedHrefs = kept;
            });
        } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            this.state.update((s) => {
                s.items = [];
                s.filteredItems = [];
                s.loading = false;
                s.error = err.message || "Failed to load items";
            });
        }
    };

    // ── Selection ────────────────────────────────────────────────────────

    private resetSelection = () => {
        this.anchorHref = null;
        if (this.state.get().selectedHrefs.length) {
            this.state.update((s) => { s.selectedHrefs = []; });
        }
    };

    setSelection = (hrefs: string[]) => {
        if (sameHrefs(this.state.get().selectedHrefs, hrefs)) return;
        this.state.update((s) => { s.selectedHrefs = hrefs; });
    };

    /**
     * The items a plural action operates on: the selection intersected with what is currently
     * visible, in visible order. Rows hidden by the search filter never participate — the
     * content view's form of "only visible items can be acted on". Not pruned; each action
     * prunes at its own entry point.
     */
    selectionItems = (): ITreeProviderItem[] => {
        const { filteredItems, selectedHrefs } = this.state.get();
        return filteredItems.filter(
            (i) => selectedHrefs.some((href) => sameHref(href, i.href)),
        );
    };

    /** The anchor as an index into the visible items, or null when it no longer resolves
     *  (search changed, file deleted). Callers fall back to the clicked row. */
    private anchorIndex = (): number | null => {
        // Captured into a local so the closure below narrows without a `!` — TS cannot narrow
        // a mutable class property across a callback boundary.
        const anchor = this.anchorHref;
        if (!anchor) return null;
        const idx = this.state.get().filteredItems
            .findIndex((i) => sameHref(i.href, anchor));
        return idx < 0 ? null : idx;
    };

    // ── Search ───────────────────────────────────────────────────────────

    setSearchText = (text: string) => {
        const { items } = this.state.get();
        const filteredItems = filterItems(items, text);
        this.state.update((s) => {
            s.searchText = text;
            s.filteredItems = filteredItems;
        });
    };

    // ── Click handlers ───────────────────────────────────────────────────

    /**
     * Row / tile click. Single-select (the default) is unchanged: notify the parent, which
     * navigates.
     *
     * In `multiSelect` mode the modifier decides, and Shift is tested BEFORE Ctrl — that
     * ordering is what makes Ctrl+Shift+click a range extend rather than needing a third rule.
     * A Ctrl or Shift click builds the set only: it must not navigate, or a five-item selection
     * would open five tabs.
     *
     * `e` is optional because the row's own action buttons call this to mean "select this row"
     * without forwarding their own modifiers.
     */
    onItemClick = (item: ITreeProviderItem, e?: MouseEvent) => {
        if (!this.props.multiSelect) {
            this.props.onItemClick?.(item);
            return;
        }

        const { filteredItems, selectedHrefs } = this.state.get();
        const index = filteredItems.findIndex((i) => sameHref(i.href, item.href));
        if (index < 0) return;

        if (e?.shiftKey) {
            const from = this.anchorIndex() ?? index;
            const [lo, hi] = from <= index ? [from, index] : [index, from];
            this.setSelection(filteredItems.slice(lo, hi + 1).map((i) => i.href));
            return; // anchor unchanged — successive Shift+clicks pivot on the same row
        }
        if (e?.ctrlKey) {
            const isSelected = selectedHrefs.some((h) => sameHref(h, item.href));
            this.anchorHref = item.href;
            // Append rather than rebuild from the visible order: rebuilding would drop hrefs
            // hidden by the search filter, and they must survive so clearing the search brings
            // them back highlighted. Set order carries no meaning here — the primary item is
            // `props.selectedHref`, and `selectionItems()` re-derives visible order anyway.
            this.setSelection(
                isSelected
                    ? selectedHrefs.filter((h) => !sameHref(h, item.href))
                    : [...selectedHrefs, item.href],
            );
            return;
        }
        this.anchorHref = item.href;
        this.setSelection([item.href]);
        this.props.onItemClick?.(item);
    };

    /** Keys handled while the item grid has focus. No-op unless multiSelect is on, so
     *  single-select folder pages keep native behavior. */
    onKeyDown = (e: KeyboardEvent) => {
        if (!this.props.multiSelect) return;
        // The search input (or any editable element) keeps native key behavior.
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;

        const { provider } = this.props;

        if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "a") {
            e.preventDefault();
            this.setSelection(this.state.get().filteredItems.map((i) => i.href));
            return;
        }
        if (e.ctrlKey || e.altKey || e.shiftKey) return;

        if (e.key === "Delete" && provider.writable && provider.deleteItem) {
            const items = this.selectionItems();
            if (!items.length) return;
            e.preventDefault();
            void this.deleteItemsAction(items);
            return;
        }
        if (e.key === "Escape") {
            const { selectedHref } = this.props;
            if (this.state.get().selectedHrefs.length <= 1) return;
            e.preventDefault();
            this.anchorHref = selectedHref ?? null;
            this.setSelection(selectedHref ? [selectedHref] : []);
        }
    };

    onItemDoubleClick = (item: ITreeProviderItem) => {
        if (item.isDirectory) {
            this.props.onFolderClick?.(item);
        } else {
            this.props.onItemDoubleClick?.(item);
        }
    };

    // ── Drag out (US-944) ────────────────────────────────────────────────

    /** Whether rows can be dragged out. Same gate as `acceptsDrops`: the drag-out path is a
     *  native OS file drag, which needs hrefs that are absolute local paths. */
    get allowsDrag(): boolean {
        const { provider } = this.props;
        return !!provider.writable && supportsMultiSelect(provider);
    }

    /**
     * The items a drag starting on `item` should carry: the whole selection when the row is part
     * of it, otherwise just that row — Windows Explorer behavior, where dragging an unselected
     * row does not silently carry the selection. Pruned, so a folder dragged together with items
     * inside it carries the folder only. Deliberately does NOT write the selection.
     */
    dragItemsFor = (item: ITreeProviderItem): ITreeProviderItem[] => {
        const selected = this.selectionItems();
        const dragsSelection = !!this.props.multiSelect
            && selected.length > 1
            && selected.some((i) => sameHref(i.href, item.href));
        return pruneNestedItems(dragsSelection ? selected : [item]);
    };

    /**
     * Replace the HTML5 drag with a native OS file drag. `webContents.startDrag` is the only
     * payload both Windows Explorer and Teams accept cleanly, and a native drag dropped back
     * inside a Persephone window re-enters as an ordinary OS file drop — so this one gesture
     * serves external and internal targets alike, with no modifier and no second code path.
     *
     * Returns false when there is nothing to drag, letting the caller fall back to the
     * in-process trait drag.
     */
    handleOsDragStart = (item: ITreeProviderItem, e: DragEvent): boolean => {
        if (!supportsOsClipboard(this.props.provider)) return false;
        const paths = this.dragItemsFor(item).map((i) => i.href);
        if (!paths.length) return false;
        e.preventDefault();
        // startDrag renders the icon of paths[0] only — Windows shows no count badge for a
        // multi-file drag and Electron exposes no way to compose one.
        void api.startOsFileDrag(paths);
        return true;
    };

    // ── Drop (US-943) ────────────────────────────────────────────────────
    //
    // Two kinds of target: a folder row/tile, and the view itself (whitespace, the
    // "Empty folder" placeholder, the gaps between tiles) which means the open folder.
    // A file row is the same target as whitespace — a file's parent IS the open folder.
    //
    // dragenter/dragleave are counted per target rather than tracked with a boolean: child
    // elements fire spurious dragleave as the pointer crosses them, so a boolean flickers.
    // Row events are NOT stopped, so the view's own counter stays positive for the whole
    // time the drag is inside it; the whitespace highlight is then "inside the view AND no
    // row targeted". Only `drop` stops propagation.

    // Keyed by the target's href, with `null` for the view itself. A `Map` takes `null` as a
    // key perfectly well, which is better than manufacturing an "impossible href" sentinel
    // string — there is no such thing, and the question of whether some path could collide
    // with it simply does not arise this way.
    private readonly dragEnterCounts = new DragEnterCounter<string | null>();

    /** Whether this view takes drops at all. Gated to the local file provider: the drop
     *  actions below are the file-move / file-import pair, and a catalog provider would need
     *  the `importLinks` branch the Explorer tree has. */
    get acceptsDrops(): boolean {
        const { provider } = this.props;
        return !!provider.writable && supportsMultiSelect(provider);
    }

    /**
     * Whether to accept the drag *at hover time*. Type-level only: `dataTransfer` will not
     * release its data during dragenter/dragover (Chrome's protected mode), so the payload —
     * and with it the folder-into-itself check — can only be inspected at drop time. Mirrors
     * `TreeModel.acceptsDrag`.
     */
    private acceptsDrag = (dataTransfer: DataTransfer): boolean => {
        if (!this.acceptsDrops) return false;
        if (hasTraitDragData(dataTransfer)) return true;
        return !!this.props.provider.importFiles && isFileDrag(dataTransfer);
    };

    /** The drag target's key: a folder row's href, or `null` for the view itself (whitespace,
     *  and any non-folder row — a file's parent IS the open folder). */
    private dropKey = (item: ITreeProviderItem | null): string | null =>
        item?.isDirectory ? item.href : null;

    private setDragState = (
        update: (s: CategoryViewState) => void,
    ) => {
        // Deferred: a state write straight out of a drag handler can land mid-render.
        queueMicrotask(() => {
            if (!this.isLive) return;
            this.state.update(update);
        });
    };

    onDragEnter = (item: ITreeProviderItem | null, e: DragEvent) => {
        if (!this.acceptsDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = isFileDrag(e.dataTransfer) ? "copy" : "move";

        const key = this.dropKey(item);
        if (!this.dragEnterCounts.enter(key)) return;
        this.setDragState((s) => {
            if (key === null) s.dropOverView = true;
            else s.dropTargetHref = key;
        });
    };

    /** The target is irrelevant here — dragover exists only to keep re-asserting that the drop
     *  is allowed (the browser cancels it otherwise). The signature mirrors the others so the
     *  view can wire all four the same way. */
    onDragOver = (_item: ITreeProviderItem | null, e: DragEvent) => {
        if (!this.acceptsDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = isFileDrag(e.dataTransfer) ? "copy" : "move";
    };

    onDragLeave = (item: ITreeProviderItem | null, _e: DragEvent) => {
        const key = this.dropKey(item);
        if (!this.dragEnterCounts.leave(key)) return;
        this.setDragState((s) => {
            if (key === null) {
                s.dropOverView = false;
                // Leaving the view outright — no row can still be hovered.
                s.dropTargetHref = null;
            } else if (s.dropTargetHref === key) {
                s.dropTargetHref = null;
            }
        });
    };

    private clearDragState = () => {
        this.dragEnterCounts.clear();
        this.setDragState((s) => {
            s.dropTargetHref = null;
            s.dropOverView = false;
        });
    };

    /**
     * Handle a drop. `stopPropagation` is essential and applies to the whitespace case too:
     * `GlobalEventService` installs a bubble-phase fallback that opens dropped paths as tabs,
     * which is what a folder page did with dropped files before this existed.
     */
    onDrop = (item: ITreeProviderItem | null, e: DragEvent) => {
        if (!this.acceptsDrops) return;
        e.preventDefault();
        e.stopPropagation();
        this.clearDragState();

        const payload = getTraitDragDataFromEvent(e);
        if (!payload) return;
        if (!this.canDropOn(item, payload)) return;
        void this.performDrop(item, payload);
    };

    /** The directory a drop on `item` writes into, as an href — for the self-drop guards. */
    private dropDirHref = (item: ITreeProviderItem | null): string =>
        item?.isDirectory ? item.href : this.props.category;

    /** Where a drop on `item` lands. A folder targets itself; everything else (a file row,
     *  whitespace, the empty-folder placeholder) targets the open folder. */
    private dropTargetFor = (item: ITreeProviderItem | null): DropTarget => {
        // `href` rather than `getItemListPath` — drops are gated to the file provider, where the
        // href IS the absolute path the provider lists and `copyPathsInto` writes into. The
        // reconstructed list path (`category + "/" + title`) would work too but yields mixed
        // separators, and the tree's own drop paths use the href for the same reason.
        if (item?.isDirectory) {
            return { path: item.href, title: item.title };
        }
        const { category, provider } = this.props;
        return { path: category, title: fpBasename(category) || provider.displayName };
    };

    /** Drop-time acceptance, with the payload in hand. Ported from
     *  `TreeProviderView.canTraitDrop` with the tree node swapped for a drop target. */
    private canDropOn = (
        item: ITreeProviderItem | null,
        payload: import("../../core/traits").TraitDragPayload,
    ): boolean => {
        return !!getTraitDropAction(this.props.provider, this.dropDirHref(item), payload, false);

    };

    private performDrop = async (
        item: ITreeProviderItem | null,
        payload: import("../../core/traits").TraitDragPayload,
    ) => {
        const action = getTraitDropAction(
            this.props.provider,
            this.dropDirHref(item),
            payload,
            false,
        );
        if (!action) return;
        const target = this.dropTargetFor(item);

        let changed = false;
        if (action.kind === "move") {
            changed = await moveItemsInto(this.props.provider, action.items, target);
        } else if (action.kind === "import-files") {
            changed = await dropOsFilesInto(this.props.provider, action.files, target);
        }
        if (changed) await this.loadItems();
    };

    // ── Context menus ────────────────────────────────────────────────────

    onItemContextMenu = (item: ITreeProviderItem, e: MouseEvent) => {
        // Right-click moves the selection to this row ONLY when the row is outside the current
        // selection. Right-clicking one of N selected rows must keep all N, so the menu it opens
        // can act on the whole set (Windows Explorer / VS Code behavior). No navigation — a
        // right-click never opens anything.
        if (
            this.props.multiSelect
            && !this.state.get().selectedHrefs.some((h) => sameHref(h, item.href))
        ) {
            this.anchorHref = item.href;
            this.setSelection([item.href]);
        }

        const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "tree-provider-item");
        ctxEvent.target = item;

        // A multi-selection containing the right-clicked row gets the plural menu INSTEAD of
        // the single-row one, and skips Layer 2 entirely: those handlers are written against a
        // single `event.target`, so a plural selection has no meaningful singular actions.
        const multi = this.multiTargets(item);
        if (multi) {
            ctxEvent.items.push(
                ...buildMultiItemMenuItems(
                    this.props.provider,
                    multi,
                    () => this.deleteItemsAction(multi),
                ),
            );
            return;
        }

        // Layer 1: Generic items (Open, Copy Path, Rename, Delete)
        const menuItems = item.isDirectory
            ? this.getFolderMenuItems(item)
            : this.getFileMenuItems(item);
        ctxEvent.items.push(...menuItems);

        // Layer 2: Event channel — type-specific items (Open in New Tab/Window,
        // Show in File Explorer, Open in Browser, …) added by the handlers registered
        // in tree-context-menus.tsx, based solely on the item's href/isDirectory. This
        // is the same flow the Explorer tree (TreeProviderViewModel) uses, so the
        // folder-content view gets identical link items from one central place.
        // Set contextMenuPromise so GlobalEventService waits for the async handlers
        // before showing the popup menu.
        e.contextMenuPromise = app.events.linkContextMenu.sendAsync(
            ctxEvent as ContextMenuEvent<ITreeProviderItem>,
        );
    };

    /**
     * The pruned selection to act on when `item` was right-clicked, or null when the single-row
     * menu should be built instead — multiSelect off, the row outside the selection, or pruning
     * collapsed the set to one item. A "Copy (1)" label over a plural code path is a worse menu
     * than the single-row one, which also offers Open, Rename and Paste.
     */
    private multiTargets = (item: ITreeProviderItem): ITreeProviderItem[] | null => {
        if (!this.props.multiSelect) return null;
        const selected = this.selectionItems();
        if (selected.length < 2) return null;
        if (!selected.some((i) => sameHref(i.href, item.href))) return null;
        const targets = pruneNestedItems(selected);
        return targets.length > 1 ? targets : null;
    };

    // Right-click on empty space (or a file) → New File / New Folder in the currently
    // viewed directory (this.props.category). Skipped when a folder was the target —
    // that folder's own menu already carries its New File / New Folder items. Mirrors
    // TreeProviderViewModel.onBackgroundContextMenu, but rooted at the open category
    // rather than the provider root.
    onBackgroundContextMenu = (e: MouseEvent) => {
        const ctxEvent = e.contextMenuEvent;
        const isFolder = ctxEvent?.target && (ctxEvent.target as ITreeProviderItem).isDirectory;
        const { provider } = this.props;

        if (isFolder) return;

        const items = getBackgroundMenuItems(provider, this.props.category, this.itemMenuActions);
        if (!items.length) return;

        const bgEvent = ContextMenuEvent.fromNativeEvent(e, "tree-provider-background");
        bgEvent.items.push(...items);
    };

    /** Paste the OS clipboard's files into `targetDir` and refresh (US-807). */
    private pasteIntoDir = (targetDir: string) => pasteIntoDir(this.itemCrudContext, targetDir);

    /** Path to pass to provider create/list calls for a folder item: parent category +
     *  the folder's own name (same convention as TreeProviderViewModel.getListPath). */
    private getItemListPath = (item: ITreeProviderItem): string => {
        return item.category ? item.category + "/" + item.title : item.title;
    };

    private get itemCrudContext(): ItemCrudContext {
        return {
            provider: this.props.provider,
            getItemPath: this.getItemListPath,
            refresh: this.loadItems,
        };
    }

    private get itemMenuActions(): ItemMenuActions {
        return {
            createFile: (directory) => { void this.createNewFile(directory); },
            createFolder: (directory) => { void this.createNewFolder(directory); },
            paste: (directory) => { void this.pasteIntoDir(directory); },
            rename: (item) => { void this.renameItem(item); },
            deleteItem: (item) => { void this.deleteItemAction(item); },
        };
    }

    private getFileMenuItems = (item: ITreeProviderItem): MenuItem[] =>
        getFileMenuItems(this.props.provider, item, this.itemMenuActions);

    private getFolderMenuItems = (item: ITreeProviderItem): MenuItem[] =>
        getFolderMenuItems({
            provider: this.props.provider,
            item,
            directory: this.getItemListPath(item),
            onOpen: () => this.props.onFolderClick?.(item),
            actions: this.itemMenuActions,
        });

    // ── File operations ──────────────────────────────────────────────────

    private createNewFile = (dirPath: string) => createNewFile(this.itemCrudContext, dirPath);

    private createNewFolder = (dirPath: string) => createNewFolder(this.itemCrudContext, dirPath);

    renameItem = (item: ITreeProviderItem) => renameItem(this.itemCrudContext, item);

    deleteItemAction = (item: ITreeProviderItem) =>
        deleteItemAction(this.itemCrudContext, item);

    /** Confirm once, then delete every item. Public: plural context menu + the Delete key.
     *  Prunes nested selections first, so a folder plus files inside it deletes the folder
     *  only — and the count in the confirm is the pruned count. */
    deleteItemsAction = async (items: ITreeProviderItem[]) => {
        const outcome = await deleteItemsBatch(
            this.props.provider,
            items,
            // One item → the existing singular wording, and deleteItemAction refreshes itself.
            this.deleteItemAction,
        );
        if (outcome !== "batch") return;
        // Nothing sensible stays selected after a batch delete.
        this.setSelection([]);
        await this.loadItems();
    };
}

// =============================================================================
// Pure utility functions
// =============================================================================

function filterItems(items: ITreeProviderItem[], searchText: string): ITreeProviderItem[] {
    if (!searchText) return items;
    const words = searchText.toLowerCase().split(" ").filter(Boolean);
    if (words.length === 0) return items;
    return items.filter((item) => {
        const nameLower = item.title.toLowerCase();
        return words.every((w) => nameLower.includes(w));
    });
}
