import { TComponentModel } from "../../core/state/model";
import type { PopoverPosition } from "../Popover/PopoverModel";
import type { MenuItem } from "./types";

// =============================================================================
// Constants
// =============================================================================

export const SEARCH_THRESHOLD = 20;
export const ROW_HEIGHT = 26;
export const SUB_MENU_DELAY_MS = 400;
/**
 * Height cap for a menu popover. Only long menus reach it — the language menu's 96 items would
 * otherwise fill the whole window. The value was always intended; it was simply inert until
 * `PopoverModel`'s size middleware started taking the minimum of the available space and a
 * requested `maxHeight` (US-1040). Short menus are unaffected.
 */
export const MAX_HEIGHT = 500;

// =============================================================================
// Props
// =============================================================================

export interface MenuProps extends PopoverPosition {
    /** Optional debug label emitted as `data-name` on the menu's floating root.
     *  Use to disambiguate multiple instances in DOM inspector output. Never used for styling. */
    name?: string;
    items: MenuItem[];
    open: boolean;
    /** Called after the user clicks a leaf item OR after Escape / click-outside.
     *  itemClicked=true when a leaf item was activated (so callers can cascade close). */
    onClose: (itemClicked: boolean) => void;
}

// =============================================================================
// Derived row record
// =============================================================================

export interface PreparedItem {
    item: MenuItem;
    id: string;
    startGroup: boolean;
}

export function idOf(item: MenuItem, index: number): string {
    return item.id ?? `${index}:${item.label}`;
}

// =============================================================================
// State
// =============================================================================

export interface MenuState {
    search: string;
    hoveredId: string | null;
    subMenuItem: MenuItem | null;
    subMenuAnchor: Element | null;
}

export const defaultMenuState: MenuState = {
    search: "",
    hoveredId: null,
    subMenuItem: null,
    subMenuAnchor: null,
};

// =============================================================================
// Model
// =============================================================================

export class MenuModel extends TComponentModel<MenuState, MenuProps> {
    // --- refs (DOM) ---
    listRef: HTMLDivElement | null = null;
    searchInputRef: HTMLInputElement | null = null;

    setListRef = (el: HTMLDivElement | null) => {
        this.listRef = el;
    };
    setSearchInputRef = (el: HTMLInputElement | null) => {
        this.searchInputRef = el;
    };

    // --- internal timer (not state — flipping it must not re-render) ---
    private subTimerId: number | null = null;
    private previousOpen: boolean | undefined;
    private previousItems: MenuItem[] | undefined;

    /** Prop-driven state transitions replace the former deferred effects. */
    setProps = (): void => {
        const props = this.props;
        const previousOpen = this.previousOpen;
        const previousItems = this.previousItems;
        const opening = props.open && previousOpen !== true;
        const closing = !props.open && previousOpen === true;
        const itemsChanged = previousItems !== props.items;
        const reset = closing || (!props.open && (previousOpen === undefined || itemsChanged));
        const nextSearch = reset || opening ? "" : this.state.get().search;

        this.previousOpen = props.open;
        this.previousItems = props.items;

        if (itemsChanged || !this.hasAppliedDerived) {
            this.hasAnyIcon = props.items.some((item) => Boolean(item.icon));
        }
        if (reset || (props.open && (opening || itemsChanged)) || !this.hasAppliedDerived) {
            this.prepared = this.derivePrepared(nextSearch);
        }
        this.hasAppliedDerived = true;

        if (reset) {
            this.state.set({ ...defaultMenuState });
            this.clearSubTimer();
        } else if (props.open && (opening || itemsChanged)) {
            const initial = props.items.find((item) => item.selected && !item.invisible);
            this.state.update((state) => {
                if (opening) {
                    state.search = "";
                    state.subMenuItem = null;
                    state.subMenuAnchor = null;
                }
                if (initial) {
                    state.hoveredId = idOf(initial, props.items.indexOf(initial));
                }
            });
        }
    };

    // --- computed ---

    get showSearch(): boolean {
        return this.props.items.length > SEARCH_THRESHOLD;
    }

    hasAnyIcon = false;
    private hasAppliedDerived = false;

    /** Filter + group-fixup (legacy parity: when an invisible item carried startGroup,
     *  transfer it to the next visible sibling). */
    prepared: PreparedItem[] = [];

    private derivePrepared(search: string): PreparedItem[] {
        const items = this.props.items;
        const showSearch = items.length > SEARCH_THRESHOLD;
        const q = search.toLocaleLowerCase();
        const out: PreparedItem[] = [];
        let pendingStartGroup = false;
        items.forEach((item, idx) => {
            if (item.invisible) {
                if (item.startGroup) pendingStartGroup = true;
                return;
            }
            const matchesSearch = !showSearch || !q || item.label.toLocaleLowerCase().includes(q);
            if (!matchesSearch) {
                if (item.startGroup) pendingStartGroup = true;
                return;
            }
            out.push({
                item,
                id: idOf(item, idx),
                startGroup: (item.startGroup || pendingStartGroup) && out.length > 0,
            });
            pendingStartGroup = false;
        });
        return out;
    }

    // --- timer helpers ---

    private clearSubTimer = () => {
        if (this.subTimerId !== null) {
            window.clearTimeout(this.subTimerId);
            this.subTimerId = null;
        }
    };

    private scheduleSubMenu = (item: MenuItem, anchor: Element) => {
        this.clearSubTimer();
        if (!item.items?.length) return;
        this.subTimerId = window.setTimeout(() => {
            this.subTimerId = null;
            this.state.update((s) => {
                s.subMenuItem = item;
                s.subMenuAnchor = anchor;
            });
        }, SUB_MENU_DELAY_MS);
    };

    // --- handlers ---

    private activate = (item: MenuItem, anchor: Element) => {
        if (item.disabled) return;
        if (item.items?.length) {
            // Click-to-open sub-menu (no delay).
            this.clearSubTimer();
            this.state.update((s) => {
                s.subMenuItem = item;
                s.subMenuAnchor = anchor;
            });
            return;
        }
        item.onClick?.();
        this.props.onClose(true);
    };

    onSubMenuClose = (itemClicked: boolean) => {
        this.clearSubTimer();
        this.state.update((s) => {
            s.subMenuItem = null;
            s.subMenuAnchor = null;
        });
        if (itemClicked) this.props.onClose(true);
    };

    onSearchChange = (v: string) => {
        this.prepared = this.derivePrepared(v);
        this.state.update((s) => {
            s.search = v;
        });
    };

    onPopoverClose = () => {
        this.props.onClose(false);
    };

    onRowMouseEnter = (anchor: Element, id: string, item: MenuItem): void => {
        if (item.disabled) return;
        this.state.update((s) => {
            s.hoveredId = id;
            if (s.subMenuItem !== item) {
                s.subMenuItem = null;
                s.subMenuAnchor = null;
            }
        });
        this.scheduleSubMenu(item, anchor);
    };

    onRowMouseLeave = () => {
        this.clearSubTimer();
    };

    onRowClick = (anchor: Element, item: MenuItem): void => {
        this.activate(item, anchor);
    };

    onKeyDown = (e: KeyboardEvent): void => {
        const prepared = this.prepared;
        const hoveredId = this.state.get().hoveredId;
        const idx = prepared.findIndex((p) => p.id === hoveredId);
        const visibleRows = Math.max(
            1,
            Math.floor((this.listRef?.clientHeight ?? MAX_HEIGHT) / ROW_HEIGHT),
        );
        const move = (n: number) => {
            if (prepared.length === 0) return;
            const start = idx >= 0 ? idx : -1;
            const next = Math.max(0, Math.min(prepared.length - 1, start + n));
            this.state.update((s) => {
                s.hoveredId = prepared[next].id;
            });
        };
        if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
        } else if (e.key === "PageDown") {
            e.preventDefault();
            move(visibleRows);
        } else if (e.key === "PageUp") {
            e.preventDefault();
            move(-visibleRows);
        } else if (e.key === "Enter") {
            const target = idx >= 0
                ? prepared[idx].item
                : prepared.length === 1
                    ? prepared[0].item
                    : null;
            if (target && !target.disabled) {
                e.preventDefault();
                // For Enter we have no row anchor — fall back to list root for sub-menu placement.
                this.activate(target, this.listRef ?? document.body);
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            this.props.onClose(false);
        }
    };

    dispose() {
        this.clearSubTimer();
    }
}
