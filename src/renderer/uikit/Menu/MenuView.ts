import type React from "react";
import { createComponentModelDriver } from "../../core/state/model";
import { CheckIcon, ChevronRightIcon } from "../../theme/icons";
import { InputView } from "../Input/InputView";
import type { InputProps } from "../Input/Input";
import { PopoverView, type PopoverViewProps } from "../Popover/PopoverView";
import { KeyedList } from "../shared/keyed-list";
import { fillSlot, type SlotContent } from "../shared/fill-slot";
import { SubtreeSwap } from "../shared/subtree-swap";
import { VanillaView } from "../shared/vanilla-view";
import {
    defaultMenuState,
    idOf,
    MAX_HEIGHT,
    MenuModel,
    type MenuProps,
    type PreparedItem,
} from "./MenuModel";
import type { MenuItem } from "./types";
import "./Menu.css";

interface RowParts {
    row: HTMLDivElement;
    iconHost?: HTMLSpanElement;
    iconCleanup?: () => void;
    label: HTMLSpanElement;
    hotkey?: HTMLSpanElement;
    selectedCheck?: HTMLSpanElement;
    submenuChevron?: HTMLSpanElement;
    item: MenuItem;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onClick: () => void;
}

function setBooleanAttribute(element: HTMLElement, name: string, value: boolean): void {
    if (value) element.setAttribute(name, "");
    else element.removeAttribute(name);
}

function iconElement(component: { createElement?: () => SVGElement }): SVGElement {
    const icon = component.createElement?.();
    if (!icon) throw new Error("Menu icon does not have a DOM builder.");
    return icon;
}

/** Native menu content mounted directly into PopoverFloatingView's root. */
class MenuContentView extends VanillaView<MenuModel> {
    private readonly model: MenuModel;
    private readonly inputView: InputView;
    private listRoot: HTMLDivElement | undefined;
    private searchWrap: HTMLDivElement | undefined;
    private inputMounted = false;
    private keyedList: KeyedList<PreparedItem, string, HTMLDivElement> | undefined;
    private submenuSwap: SubtreeSwap<string> | undefined;
    private activeSubmenu: MenuView | undefined;
    private activeSubmenuKey: string | undefined;
    private lastHoveredId: string | null = null;
    private readonly rows = new WeakMap<HTMLDivElement, RowParts>();

    public constructor(model: MenuModel, root: HTMLElement) {
        super(model, root);
        this.model = model;
        this.inputView = this.child(new InputView(this.inputProps(model.state.get().search)));
    }

    protected onMount(): void {
        this.searchWrap = document.createElement("div");
        this.searchWrap.dataset.part = "search";
        this.listRoot = document.createElement("div");
        this.listRoot.dataset.part = "list";
        this.listRoot.dataset.type = "menu-list";
        this.listRoot.tabIndex = -1;
        this.listRoot.className = "scroll-container";
        this.root.append(this.searchWrap, this.listRoot);
        this.keyedList = new KeyedList(this.listRoot, {
            keyOf: (record) => record.id,
            create: (record) => this.createRow(record),
            update: (row, record) => this.updateRow(row, record),
            remove: (row) => this.removeRow(row),
        });
        this.submenuSwap = new SubtreeSwap(this.root);
        this.own(() => this.submenuSwap?.dispose());
        this.own(() => this.keyedList?.dispose());
        this.model.setListRef(this.listRoot);
        this.syncStructure();
        this.bind(
            this.model.state,
            (state) => ({ search: state.search, hoveredId: state.hoveredId, subMenuItem: state.subMenuItem, subMenuAnchor: state.subMenuAnchor }),
            () => this.syncStructure(),
        );
        queueMicrotask(() => {
            if (!this.model.isLive || !this.model.props.open) return;
            if (this.model.showSearch) this.model.searchInputRef?.focus();
            else this.listRoot?.focus();
        });
    }

    protected onDispose(): void {
        this.model.setListRef(null);
        this.model.setSearchInputRef(null);
    }

    private syncStructure(): void {
        const showSearch = this.model.showSearch;
        if (showSearch) {
            if (!this.searchWrap || !this.listRoot) return;
            if (!this.inputMounted) {
                this.searchWrap.append(this.inputView.root);
                this.inputView.mount();
                this.inputMounted = true;
            }
            this.inputView.update(this.inputProps(this.model.state.get().search));
        } else {
            this.inputView.update(this.inputProps(this.model.state.get().search));
            this.inputView.root.remove();
            this.inputMounted = false;
        }

        const prepared = this.model.prepared.value;
        this.keyedList?.update(prepared);
        this.syncSubmenu();

        const hoveredId = this.model.state.get().hoveredId;
        if (hoveredId !== this.lastHoveredId) {
            this.lastHoveredId = hoveredId;
            queueMicrotask(() => {
                if (!this.model.isLive || !this.listRoot || !hoveredId) return;
                const row = this.listRoot.querySelector(
                    `[data-type="menu-row"][data-id="${CSS.escape(hoveredId)}"]`,
                ) as HTMLElement | null;
                row?.scrollIntoView({ block: "nearest" });
            });
        }
    }

    private inputProps(value: string): InputProps {
        return {
            ref: this.model.setSearchInputRef,
            value,
            onChange: this.model.onSearchChange,
            placeholder: "Search...",
            onKeyDown: (event) => this.model.onKeyDown(event.nativeEvent),
        };
    }

    private createRow(record: PreparedItem): HTMLDivElement {
        const row = document.createElement("div");
        const label = document.createElement("span");
        label.dataset.part = "label";
        const parts = { row, label, item: record.item } as RowParts;
        parts.onMouseEnter = () => {
            const current = this.rows.get(row);
            if (current) this.model.onRowMouseEnter(row, record.id, current.item);
        };
        parts.onMouseLeave = this.model.onRowMouseLeave;
        parts.onClick = () => {
            const current = this.rows.get(row);
            if (current) this.model.onRowClick(row, current.item);
        };
        row.addEventListener("mouseenter", parts.onMouseEnter);
        row.addEventListener("mouseleave", parts.onMouseLeave);
        row.addEventListener("click", parts.onClick);
        row.append(label);
        this.rows.set(row, parts);
        return row;
    }

    private updateRow(row: HTMLDivElement, record: PreparedItem): void {
        const parts = this.rows.get(row);
        if (!parts) throw new Error("Menu row was not registered.");
        parts.item = record.item;
        row.dataset.type = "menu-row";
        row.dataset.id = record.id;
        setBooleanAttribute(row, "data-hovered", this.model.state.get().hoveredId === record.id || this.model.state.get().subMenuItem === record.item);
        setBooleanAttribute(row, "data-disabled", Boolean(record.item.disabled));
        setBooleanAttribute(row, "data-start-group", record.startGroup);
        setBooleanAttribute(row, "data-minor", Boolean(record.item.minor));

        const hasIcons = this.model.hasAnyIcon.value;
        if (hasIcons && !parts.iconHost) {
            parts.iconHost = document.createElement("span");
            parts.iconHost.dataset.part = "icon";
            row.insertBefore(parts.iconHost, parts.label);
        } else if (!hasIcons && parts.iconHost) {
            parts.iconCleanup?.();
            parts.iconCleanup = undefined;
            parts.iconHost.remove();
            parts.iconHost = undefined;
        }
        if (parts.iconHost) {
            parts.iconCleanup = fillSlot(parts.iconHost, (record.item.icon ?? null) as SlotContent);
        }

        parts.label.textContent = record.item.label;
        this.updateOptionalText(row, parts, "hotkey", record.item.hotKey);
        const hasCheck = Boolean(record.item.selected && !record.item.items?.length);
        if (hasCheck && !parts.selectedCheck) {
            parts.selectedCheck = document.createElement("span");
            parts.selectedCheck.dataset.part = "selected-check";
            parts.selectedCheck.append(iconElement(CheckIcon));
        } else if (!hasCheck) {
            parts.selectedCheck?.remove();
            parts.selectedCheck = undefined;
        }
        const hasSubmenu = Boolean(record.item.items?.length);
        if (hasSubmenu && !parts.submenuChevron) {
            parts.submenuChevron = document.createElement("span");
            parts.submenuChevron.dataset.part = "submenu-chevron";
            parts.submenuChevron.append(iconElement(ChevronRightIcon));
        } else if (!hasSubmenu) {
            parts.submenuChevron?.remove();
            parts.submenuChevron = undefined;
        }

        const ordered = [parts.iconHost, parts.label, parts.hotkey, parts.selectedCheck, parts.submenuChevron]
            .filter((element): element is HTMLElement => Boolean(element));
        let cursor = row.firstChild;
        for (const element of ordered) {
            if (cursor !== element) row.insertBefore(element, cursor);
            cursor = element.nextSibling;
        }
    }

    private updateOptionalText(
        row: HTMLDivElement,
        parts: RowParts,
        kind: "hotkey",
        value: string | undefined,
    ): void {
        if (value && !parts[kind]) {
            const element = document.createElement("span");
            element.dataset.part = kind;
            parts[kind] = element;
        }
        if (!value) {
            parts[kind]?.remove();
            parts[kind] = undefined;
        } else {
            const element = parts[kind];
            if (element) element.textContent = value;
        }
    }

    private removeRow(row: HTMLDivElement): void {
        const parts = this.rows.get(row);
        parts?.iconCleanup?.();
        if (parts) {
            row.removeEventListener("mouseenter", parts.onMouseEnter);
            row.removeEventListener("mouseleave", parts.onMouseLeave);
            row.removeEventListener("click", parts.onClick);
        }
        row.remove();
        this.rows.delete(row);
    }

    private syncSubmenu(): void {
        const state = this.model.state.get();
        const item = state.subMenuItem;
        if (!item || !state.subMenuAnchor || !this.submenuSwap) {
            this.activeSubmenu = undefined;
            this.activeSubmenuKey = undefined;
            this.submenuSwap?.clear();
            return;
        }

        const record = this.model.prepared.value.find((candidate) => candidate.item === item);
        const key = record?.id ?? idOf(item, this.model.props.items.indexOf(item));
        const props = this.submenuProps(item, state.subMenuAnchor);
        if (this.activeSubmenu && this.activeSubmenuKey === key) {
            this.activeSubmenu.update(props);
            return;
        }

        let created: MenuView | undefined;
        this.submenuSwap.set(key, () => {
            created = new MenuView(props);
            return created;
        });
        if (created) {
            this.activeSubmenu = created;
            this.activeSubmenuKey = key;
            created.mount();
        }
    }

    private submenuProps(item: MenuItem, anchor: Element): MenuProps {
        return {
            items: item.items ?? [],
            open: true,
            elementRef: anchor,
            placement: "right-start",
            offset: [0, 2],
            onClose: this.model.onSubMenuClose,
        };
    }
}

export class MenuView extends VanillaView<MenuProps & { ref?: React.Ref<HTMLDivElement> }> {
    private readonly driver;
    private readonly popover: PopoverView;

    public constructor(props: MenuProps & { ref?: React.Ref<HTMLDivElement> }) {
        super(props);
        this.root.style.display = "contents";
        this.driver = createComponentModelDriver(
            this.modelProps(props),
            MenuModel,
            defaultMenuState,
        );
        this.popover = this.child(new PopoverView(this.popoverProps(props)));
        this.own(() => this.driver.dispose());
    }

    protected onMount(): void {
        this.root.append(this.popover.root);
        this.driver.mount();
        this.popover.mount();
    }

    protected onUpdate(props: MenuProps & { ref?: React.Ref<HTMLDivElement> }): void {
        this.driver.update(this.modelProps(props));
        this.popover.update(this.popoverProps(props));
    }

    private modelProps(props: MenuProps & { ref?: React.Ref<HTMLDivElement> }): MenuProps {
        const { ref: _ref, ...modelProps } = props;
        return modelProps;
    }

    private popoverProps(props: MenuProps & { ref?: React.Ref<HTMLDivElement> }): PopoverViewProps {
        const { items: _items, onClose: _onClose, ref, open, ...positionProps } = props;
        const showSearch = props.items.length > 20;
        return {
            ...positionProps,
            ref,
            open,
            onClose: this.driver.model.onPopoverClose,
            onKeyDown: showSearch
                ? undefined
                : (event) => this.driver.model.onKeyDown(event.nativeEvent),
            outsideClickIgnoreSelector: '[data-type="menu"]',
            maxHeight: MAX_HEIGHT,
            scroll: false,
            "data-type": "menu",
            contentView: (host) => new MenuContentView(this.driver.model, host),
        };
    }
}
