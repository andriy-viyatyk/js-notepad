import type { Placement } from "@floating-ui/dom";
import { ButtonView } from "../Button/ButtonView";
import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { MenuView } from "./MenuView";
import type { MenuItem } from "./types";
import type { Story } from "../../editors/storybook/storyTypes";
import { VanillaView } from "../shared/vanilla-view";
import { SubtreeSwap } from "../shared/subtree-swap";

const SMALL_ITEMS: MenuItem[] = [
    { label: "New Page",      icon: "folder-open", hotKey: "Ctrl+N",       onClick: () => alert("New Page")        },
    { label: "Open File…",    icon: "folder-open", hotKey: "Ctrl+O",       onClick: () => alert("Open File")       },
    { label: "Save",          icon: "save",       hotKey: "Ctrl+S",       onClick: () => alert("Save")            },
    { label: "Save As…",      icon: "save",       hotKey: "Ctrl+Shift+S", onClick: () => alert("Save As")         },
    { label: "Rename",        icon: "rename",                              onClick: () => alert("Rename"), startGroup: true },
    { label: "Copy Path",     icon: "copy",                                onClick: () => alert("Copy Path")       },
    { label: "Close",         icon: "close",      hotKey: "Ctrl+W",       onClick: () => alert("Close"), startGroup: true, minor: true },
    { label: "Close All",     icon: "close",                              onClick: () => alert("Close All")       },
    { label: "Disabled item", disabled: true,                                   onClick: () => alert("Should not run")  },
];

const SUBMENU_ITEMS: MenuItem[] = [
    {
        label: "File",
        icon: "folder-open",
        items: [
            { label: "New Page", icon: "folder-open", hotKey: "Ctrl+N", onClick: () => alert("New") },
            { label: "Open…",    icon: "folder-open", hotKey: "Ctrl+O", onClick: () => alert("Open") },
        ],
    },
    {
        label: "Edit",
        icon: "copy",
        items: [
            { label: "Copy",  hotKey: "Ctrl+C", onClick: () => alert("Copy") },
            { label: "Paste", hotKey: "Ctrl+V", onClick: () => alert("Paste") },
        ],
    },
    { label: "Settings", icon: "settings", onClick: () => alert("Settings") },
];

const FRUITS = ["Apple", "Banana", "Cherry", "Date", "Elderberry"];
const LARGE_ITEMS: MenuItem[] = Array.from({ length: 60 }).map((_, index) => ({
    label: `Item ${String(index + 1).padStart(2, "0")} — ${FRUITS[index % FRUITS.length]}`,
    onClick: () => alert(`Item ${index + 1}`),
}));

const PLACEMENTS: Placement[] = [
    "top", "top-start", "top-end",
    "bottom", "bottom-start", "bottom-end",
    "left", "left-start", "left-end",
    "right", "right-start", "right-end",
];

interface MenuDemoProps {
    variant?: "small" | "submenus" | "large-search";
    placement?: Placement;
    offsetX?: number;
    offsetY?: number;
}

class MenuDemoView extends VanillaView<MenuDemoProps> {
    private menuView: MenuView | undefined;
    private menuSwap: SubtreeSwap<"open"> | undefined;
    private triggerView: ButtonView | undefined;
    private variantText: HTMLSpanElement | undefined;
    private previousFocus: Element | null = null;

    public constructor(props: MenuDemoProps) {
        super(props, createPanelElement({ direction: "column", gap: "md", padding: "lg", align: "start" }));
    }

    protected onMount(): void {
        this.menuSwap = new SubtreeSwap(this.root);
        this.own(() => this.menuSwap?.dispose());
        const trigger = this.child(new ButtonView({
            children: "Open menu",
            icon: "settings",
            onClick: this.toggleMenu,
        }));
        this.triggerView = trigger;
        this.variantText = createTextElement(this.variantLabel(), { size: "sm", color: "light" });
        this.root.append(
            this.variantText,
            trigger.root,
        );
        trigger.mount();
        this.own(() => this.disposeMenu(false));
    }

    protected onUpdate(props: MenuDemoProps): void {
        if (this.variantText) this.variantText.textContent = this.variantLabel(props);
        this.menuView?.update(this.menuProps(props));
    }

    private readonly toggleMenu = (): void => {
        if (this.menuView) {
            this.disposeMenu(true);
            return;
        }
        const trigger = this.triggerView?.root;
        if (!trigger) return;
        this.previousFocus = document.activeElement;
        let created: MenuView | undefined;
        this.menuSwap?.set("open", () => {
            created = new MenuView(this.menuProps(this.props));
            this.menuView = created;
            return created;
        });
        if (created) {
            try {
                created.mount();
            } catch (error) {
                this.menuView = undefined;
                try {
                    this.menuSwap?.clear();
                } catch {
                    // Preserve the original mount failure after attempting cleanup.
                }
                throw error;
            }
        }
    };

    private readonly handleMenuClose = (): void => {
        this.menuView = undefined;
        this.menuSwap?.clear();
        this.restoreFocus();
    };

    private disposeMenu(restoreFocus: boolean): void {
        this.menuView = undefined;
        this.menuSwap?.clear();
        if (restoreFocus) this.restoreFocus();
        else this.previousFocus = null;
    }

    private restoreFocus(): void {
        if (this.previousFocus instanceof HTMLElement) this.previousFocus.focus();
        this.previousFocus = null;
    }

    private menuProps(props: MenuDemoProps) {
        return {
            items: this.items(props.variant),
            open: true,
            elementRef: this.triggerView?.root ?? null,
            placement: props.placement ?? "bottom-start",
            offset: [props.offsetX ?? -4, props.offsetY ?? 4] as [number, number],
            onClose: (_itemClicked: boolean) => this.handleMenuClose(),
        };
    }

    private items(variant: MenuDemoProps["variant"]): MenuItem[] {
        return variant === "submenus"
            ? SUBMENU_ITEMS
            : variant === "large-search"
                ? LARGE_ITEMS
                : SMALL_ITEMS;
    }

    private variantLabel(props: MenuDemoProps = this.props): string {
        const variant = props.variant ?? "small";
        return `Variant: ${variant}${variant === "large-search" ? "  (search appears at >20 items)" : ""}`;
    }
}

export const menuStory: Story<MenuDemoProps> = {
    id: "menu",
    name: "Menu",
    section: "Overlay",
    view: MenuDemoView,
    props: [
        { name: "variant",   type: "enum",   options: ["small", "submenus", "large-search"], default: "small" },
        { name: "placement", type: "enum",   options: PLACEMENTS, default: "bottom-start" },
        { name: "offsetX",   type: "number", default: -4 },
        { name: "offsetY",   type: "number", default: 4 },
    ],
};
