import { TComponentState } from "../../core/state/state";
import { HtmlEditor, defaultHtmlEditorState } from "./HtmlEditor";
import { HtmlBodyView } from "./HtmlBodyView";
import { TextChromeView } from "../base/TextChromeView";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { openMenu, type MenuHandle } from "../../uikit/Menu/attach-menu";
import type { MenuItem } from "../../uikit/Menu/types";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { DrawIcon } from "../../theme/language-icons";
import { createIconComponentElement } from "../../theme/icons";
import { savePngViaDialog } from "../shared/image-export";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

const MENU_CLOSE_DELAY_MS = 250;

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

function requireHtmlModel(model: EditorModel): HtmlEditor {
    if (!(model instanceof HtmlEditor)) throw new Error("HTML view received an invalid model.");
    return model;
}

class HtmlToolbarBitsView extends VanillaView<{ model: HtmlEditor }> {
    private model: HtmlEditor;
    private copyButton: IconButtonView | undefined;
    private moreButton: IconButtonView | undefined;
    private drawIcon!: SVGElement;
    private menuHandle: MenuHandle | undefined;
    private focusedBeforeMenu: HTMLElement | null = null;
    private readonly pendingTimers = new Set<ReturnType<typeof setTimeout>>();
    private stateSubscription: (() => void) | undefined;

    public constructor(props: { model: HtmlEditor }) {
        super(props, createContentsRoot());
        this.model = props.model;
    }

    protected onMount(): void {
        this.drawIcon = createIconComponentElement(DrawIcon);
        this.copyButton = this.child(new IconButtonView(this.copyButtonProps()));
        this.moreButton = this.child(new IconButtonView(this.moreButtonProps()));
        this.root.append(this.copyButton.root, this.moreButton.root);
        this.copyButton.mount();
        this.moreButton.mount();
        this.bindState();
        this.own(() => {
            this.stateSubscription?.();
            this.stateSubscription = undefined;
        });
    }

    protected onUpdate(props: { model: HtmlEditor }): void {
        if (props.model !== this.model) {
            this.model = props.model;
            this.bindState();
        }
        this.applyCapturing(this.model.state.get().capturing ?? false);
        if (this.menuHandle) this.menuHandle.update(this.menuOptions());
    }

    protected onDispose(): void {
        this.menuHandle?.dispose();
        this.menuHandle = undefined;
        this.focusedBeforeMenu = null;
        this.pendingTimers.forEach((timer) => clearTimeout(timer));
        this.pendingTimers.clear();
        this.copyButton = undefined;
        this.moreButton = undefined;
    }

    private bindState(): void {
        this.stateSubscription?.();
        this.stateSubscription = this.model.state.subscribe<boolean>(
            (capturing) => this.applyCapturing(capturing),
            (state) => state.capturing ?? false,
        );
    }

    private applyCapturing(capturing: boolean): void {
        this.copyButton?.update(this.copyButtonProps(capturing));
        this.moreButton?.update(this.moreButtonProps(capturing));
    }

    private copyButtonProps(disabled = this.model.state.get().capturing ?? false): IconButtonViewProps {
        return {
            name: "html-copy",
            size: "sm",
            title: "Copy image to clipboard",
            icon: "copy",
            disabled,
            onClick: () => { void this.model.copyImageToClipboard(); },
        };
    }

    private moreButtonProps(disabled = this.model.state.get().capturing ?? false): IconButtonViewProps {
        return {
            name: "html-more",
            size: "sm",
            title: "More image actions",
            icon: "more-vert",
            disabled,
            onClick: this.handleMoreClick,
        };
    }

    private readonly handleMoreClick = (event: MouseEvent): void => {
        if (!(event.currentTarget instanceof Element)) return;
        this.focusedBeforeMenu = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const options = this.menuOptions();
        if (this.menuHandle) this.menuHandle.update(options);
        else this.menuHandle = openMenu(event.currentTarget, options);
    };

    private readonly handleMenuClose = (): void => {
        this.menuHandle = undefined;
        this.focusedBeforeMenu?.focus();
        this.focusedBeforeMenu = null;
    };

    private readonly afterMenuClose = (run: () => void): void => {
        const timer = setTimeout(() => {
            this.pendingTimers.delete(timer);
            run();
        }, MENU_CLOSE_DELAY_MS);
        this.pendingTimers.add(timer);
    };

    private menuOptions(): Parameters<typeof openMenu>[1] {
        return {
            name: "html-image-menu",
            items: this.menuItems(),
            placement: "bottom-start",
            offset: [-4, 4],
            onClose: this.handleMenuClose,
        };
    }

    private menuItems(): MenuItem[] {
        return [
            {
                label: "Save as PNG",
                icon: "save",
                onClick: () => this.afterMenuClose(() => { void savePngViaDialog(this.model); }),
            },
            {
                label: "Open in Image View",
                icon: "open-file",
                onClick: () => this.afterMenuClose(() => { void this.model.openInImageView(); }),
            },
            {
                label: "Edit Image",
                icon: this.drawIcon,
                onClick: () => this.afterMenuClose(() => { void this.model.editImage(); }),
            },
        ];
    }
}

export class HtmlEditorView extends VanillaView<{ model: EditorModel }> {
    private readonly body: HtmlBodyView;
    private readonly toolbar: HtmlToolbarBitsView;
    private readonly chrome: TextChromeView;
    private model: HtmlEditor;

    public constructor(props: { model: EditorModel }) {
        const model = requireHtmlModel(props.model);
        const body = new HtmlBodyView({ model });
        const toolbar = new HtmlToolbarBitsView({ model });
        const chrome = new TextChromeView({
            model: props.model,
            children: body.root,
            rightToolbarContributions: toolbar.root,
        });
        super(props, chrome.root);
        this.model = model;
        this.body = this.child(body);
        this.toolbar = this.child(toolbar);
        this.chrome = this.child(chrome);
    }

    protected onMount(): void {
        this.body.mount();
        this.toolbar.mount();
        this.chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireHtmlModel(props.model);
        if (model !== this.model) {
            throw new Error("HTML view received a different model instance.");
        }
        this.chrome.update({
            model: props.model,
            children: this.body.root,
            rightToolbarContributions: this.toolbar.root,
        });
    }
}

export const htmlModule: EditorModule = {
    createEditor: () =>
        new HtmlEditor(new TComponentState({ ...defaultHtmlEditorState })),
    View: HtmlEditorView,
    BodyView: HtmlBodyView,
};

export { HtmlEditor, defaultHtmlEditorState };
export type { HtmlEditorState, HtmlQueueEvent } from "./HtmlEditor";
