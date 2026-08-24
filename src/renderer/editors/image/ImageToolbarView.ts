import { createPanelElement } from "../../uikit/Panel/panel-style";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { openMenu, type MenuHandle, type MenuAttachOptions } from "../../uikit/Menu/attach-menu";
import type { MenuItem } from "../../uikit/Menu/types";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { DrawIcon } from "../../theme/language-icons";
import type { ImageEditor } from "./ImageEditor";

export interface ImageToolbarViewProps {
    model: ImageEditor;
}

function createDirectToolbarIcon(component: { createElement?: () => SVGElement }): SVGElement {
    const icon = component.createElement?.();
    if (!icon) throw new Error("Toolbar icon does not have a DOM builder.");
    return icon;
}

export class ImageToolbarView extends VanillaView<ImageToolbarViewProps> {
    private model: ImageEditor;
    private readonly saveButton: IconButtonView;
    private readonly drawButton: IconButtonView;
    private readonly copyButton: IconButtonView;
    private readonly drawIcon = createDirectToolbarIcon(DrawIcon);
    private menuHandle: MenuHandle | undefined;
    private focusedBeforeMenu: HTMLElement | null = null;

    public constructor(props: ImageToolbarViewProps) {
        const root = createPanelElement({ direction: "row", align: "center", gap: "sm" });
        super(props, root);

        const saveButton = new IconButtonView({
            name: "image-save",
            size: "sm",
            title: "Save image…",
            onClick: this.onSaveClick,
            icon: "save",
        });
        const drawButton = new IconButtonView({
            name: "image-open-draw",
            size: "sm",
            title: "Open in Drawing Editor",
            onClick: props.model.openInDrawingEditor,
            icon: this.drawIcon,
        });
        const copyButton = new IconButtonView({
            name: "image-copy",
            size: "sm",
            title: "Copy Image to Clipboard (Ctrl+C)",
            onClick: props.model.copyImageToClipboard,
            icon: "copy",
        });
        root.append(saveButton.root, drawButton.root, copyButton.root);
        this.model = props.model;
        this.saveButton = this.child(saveButton);
        this.drawButton = this.child(drawButton);
        this.copyButton = this.child(copyButton);
    }

    protected onMount(): void {
        this.saveButton.mount();
        this.drawButton.mount();
        this.copyButton.mount();
        this.bind(this.model.state, (state) => state.url, (url) => this.applyUrl(url));
    }

    protected onUpdate(props: ImageToolbarViewProps): void {
        this.model = props.model;
        this.saveButton.update(this.saveButtonProps());
        this.drawButton.update(this.drawButtonProps(props.model));
        this.copyButton.update(this.copyButtonProps(props.model));
        if (this.menuHandle) this.menuHandle.update(this.menuOptions());
    }

    protected onDispose(): void {
        this.menuHandle?.dispose();
        this.menuHandle = undefined;
        this.focusedBeforeMenu = null;
    }

    private readonly onSaveClick = (event: { currentTarget: HTMLButtonElement }): void => {
        if (!this.model.state.get().url) return;

        this.focusedBeforeMenu = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const options = this.menuOptions();
        if (this.menuHandle) {
            this.menuHandle.update(options);
        } else {
            this.menuHandle = openMenu(event.currentTarget, options);
        }
    };

    private readonly onMenuClose = (): void => {
        this.menuHandle = undefined;
        this.focusedBeforeMenu?.focus();
        this.focusedBeforeMenu = null;
    };

    private applyUrl(url: string | undefined): void {
        this.saveButton.root.hidden = !url;
        if (!url) {
            this.menuHandle?.dispose();
            this.menuHandle = undefined;
            this.focusedBeforeMenu = null;
            return;
        }
        if (this.menuHandle) this.menuHandle.update(this.menuOptions());
    }

    private saveMenuItems(model: ImageEditor = this.model): MenuItem[] {
        return [
            { label: "Save as .png", onClick: () => void model.saveAsPng() },
            { label: "Save original", onClick: () => void model.saveOriginal() },
        ];
    }

    private menuOptions(model: ImageEditor = this.model): MenuAttachOptions {
        return {
            name: "image-save-menu",
            items: this.saveMenuItems(model),
            placement: "bottom-start",
            offset: [-4, 4],
            onClose: this.onMenuClose,
        };
    }

    private saveButtonProps(): ConstructorParameters<typeof IconButtonView>[0] {
        return {
            name: "image-save",
            size: "sm",
            title: "Save image…",
            onClick: this.onSaveClick,
            icon: "save",
        };
    }

    private drawButtonProps(model: ImageEditor): ConstructorParameters<typeof IconButtonView>[0] {
        return {
            name: "image-open-draw",
            size: "sm",
            title: "Open in Drawing Editor",
            onClick: model.openInDrawingEditor,
            icon: this.drawIcon,
        };
    }

    private copyButtonProps(model: ImageEditor): ConstructorParameters<typeof IconButtonView>[0] {
        return {
            name: "image-copy",
            size: "sm",
            title: "Copy Image to Clipboard (Ctrl+C)",
            onClick: model.copyImageToClipboard,
            icon: "copy",
        };
    }
}
