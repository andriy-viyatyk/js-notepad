import { ButtonView } from "../Button/ButtonView";
import type { ButtonProps } from "../Button/Button";
import { IconButtonView } from "../IconButton/IconButtonView";
import type { IconButtonProps } from "../IconButton/IconButton";
import { openMenu, type MenuHandle } from "../Menu/attach-menu";
import type { MenuItem } from "../Menu/types";
import { applyRestProps, clearRestListeners, createRestPropsState, type RestPropsState } from "../shared/react-compat";
import { VanillaView } from "../shared/vanilla-view";
import type { SplitButtonProps } from "./SplitButton";
import "./SplitButton.css";
import "../Button/Button.css";
import "../IconButton/IconButton.css";

type PrimaryView = ButtonView | IconButtonView;

export class SplitButtonView extends VanillaView<SplitButtonProps> {
    private readonly separator = document.createElement("span");
    private readonly caretSlot = document.createElement("div");
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private primaryView: PrimaryView | undefined;
    private primaryIsButton = false;
    private caretView: IconButtonView | undefined;
    private menuHandle: MenuHandle | undefined;
    private focusedBeforeMenu: HTMLElement | null = null;

    public constructor(props: SplitButtonProps) {
        super(props, document.createElement("div"));
        this.root.classList.add("split-button-root");
        this.separator.dataset.part = "separator";
        this.caretSlot.classList.add("split-caret-slot");
    }

    protected onMount(): void {
        this.applyRootProps(this.props);
        this.createPrimary(this.props);
        this.caretView = this.child(new IconButtonView(this.caretProps(this.props)));

        this.root.append(this.primaryView!.root, this.separator, this.caretSlot);
        this.caretSlot.append(this.caretView.root);

        this.primaryView!.mount();
        this.caretView.mount();
    }

    protected onUpdate(props: SplitButtonProps): void {
        this.applyRootProps(props);

        const nextIsButton = props.children != null;
        if (nextIsButton !== this.primaryIsButton) {
            this.replacePrimary(props);
        } else {
            this.primaryView?.update(this.primaryProps(props));
        }

        this.caretView?.update(this.caretProps(props));
        if (this.menuHandle) this.menuHandle.update(this.menuOptions(props));
    }

    protected onDispose(): void {
        this.menuHandle?.dispose();
        this.menuHandle = undefined;
        this.focusedBeforeMenu = null;
        clearRestListeners(this.root, this.restPropsState);
    }

    private createPrimary(props: SplitButtonProps): void {
        this.primaryIsButton = props.children != null;
        this.primaryView = this.child(
            this.primaryIsButton
                ? new ButtonView(this.primaryProps(props))
                : new IconButtonView(this.primaryProps(props)),
        );
    }

    private replacePrimary(props: SplitButtonProps): void {
        const previous = this.primaryView;
        if (previous) {
            previous.dispose();
            previous.root.remove();
        }
        this.createPrimary(props);
        const primary = this.primaryView!;
        this.root.insertBefore(primary.root, this.separator);
        primary.mount();
    }

    private primaryProps(props: SplitButtonProps): ButtonProps & IconButtonProps {
        return {
            name: "split-primary",
            size: props.size,
            title: props.title,
            icon: props.icon,
            disabled: props.disabled,
            onClick: () => props.onClick(),
            children: props.children,
        };
    }

    private caretProps(props: SplitButtonProps): IconButtonProps {
        return {
            name: "split-caret",
            size: props.size,
            title: props.menuTitle ?? "More actions",
            icon: "chevron-down",
            disabled: props.menuDisabled,
            onClick: this.onCaretClick,
        };
    }

    private menuOptions(props: SplitButtonProps): {
        items: MenuItem[];
        placement: "bottom-end";
        offset: [number, number];
        name?: string;
        onClose: () => void;
    } {
        return {
            items: props.items,
            placement: "bottom-end",
            offset: [-4, 4],
            name: props.name ? `${props.name}-menu` : undefined,
            onClose: this.onMenuClose,
        };
    }

    private readonly onCaretClick = (): void => {
        if (this.menuHandle) {
            this.menuHandle.update(this.menuOptions(this.props));
            return;
        }

        this.focusedBeforeMenu = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        this.menuHandle = openMenu(this.caretView!.root, this.menuOptions(this.props));
    };

    private readonly onMenuClose = (): void => {
        this.menuHandle = undefined;
        this.focusedBeforeMenu?.focus();
        this.focusedBeforeMenu = null;
    };

    private applyRootProps(props: SplitButtonProps): void {
        const {
            name,
            icon: _icon,
            title: _title,
            onClick: _onClick,
            items: _items,
            disabled: _disabled,
            menuDisabled: _menuDisabled,
            size: _size,
            menuTitle: _menuTitle,
            children: _children,
            ...rest
        } = props;

        this.root.dataset.type = "split-button";
        if (name === undefined) delete this.root.dataset.name;
        else this.root.dataset.name = name;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
        this.root.classList.add("split-button-root");
    }
}
