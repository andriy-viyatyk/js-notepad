import { TComponentState } from "../../core/state/state";
import { DrawEditor, defaultDrawEditorState } from "./DrawEditor";
import { DrawBodyView } from "./DrawBodyView";
import { TextChromeView } from "../base/TextChromeView";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { openMenu, type MenuHandle, type MenuItem } from "../../uikit/Menu";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createIconComponentElement } from "../../theme/icons";
import { DrawIcon } from "../../theme/language-icons";
import { exportAsSvgText, exportAsPngBlob, getImageDimensions, IMAGE_OFFSET_X, IMAGE_OFFSET_Y } from "./drawExport";
import { convertToExcalidrawElements, MIME_TYPES } from "@excalidraw/excalidraw";
import type { DataURL } from "@excalidraw/excalidraw/dist/types/excalidraw/types";
import type { FileId } from "@excalidraw/excalidraw/dist/types/excalidraw/element/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/dist/types/excalidraw/data/transform";
import { ui } from "../../api/ui";
import { fs } from "../../api/fs";
import { api } from "../../../ipc/renderer/api";
import { pagesModel } from "../../api/pages";
import { fpBasename } from "../../core/utils/file-path";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";
import { guard } from "../../core/utils/guard";

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

function requireDrawModel(model: EditorModel): DrawEditor {
    if (!(model instanceof DrawEditor)) throw new Error("Draw view received an invalid model.");
    return model;
}

class DrawToolbarView extends VanillaView<{ model: DrawEditor }> {
    private model: DrawEditor;
    private readonly drawIcon = createIconComponentElement(DrawIcon);
    private themeButton: IconButtonView | undefined;
    private copyButton: IconButtonView | undefined;
    private saveButton: IconButtonView | undefined;
    private openButton: IconButtonView | undefined;
    private snipButton: IconButtonView | undefined;
    private stateSubscription: (() => void) | undefined;
    private saveMenu: MenuHandle | undefined;
    private openMenu: MenuHandle | undefined;
    private previousFocus: Element | null = null;

    public constructor(props: { model: DrawEditor }) {
        super(props, createContentsRoot());
        this.model = props.model;
    }

    protected onMount(): void {
        this.themeButton = this.child(new IconButtonView(this.themeButtonProps(this.model.state.get().darkMode)));
        this.copyButton = this.child(new IconButtonView(this.copyButtonProps()));
        this.saveButton = this.child(new IconButtonView(this.saveButtonProps()));
        this.openButton = this.child(new IconButtonView(this.openButtonProps()));
        this.snipButton = this.child(new IconButtonView(this.snipButtonProps()));
        this.root.append(
            this.themeButton.root,
            this.copyButton.root,
            this.saveButton.root,
            this.openButton.root,
            this.snipButton.root,
        );
        this.themeButton.mount();
        this.copyButton.mount();
        this.saveButton.mount();
        this.openButton.mount();
        this.snipButton.mount();
        this.bindState();
        this.own(() => {
            this.stateSubscription?.();
            this.stateSubscription = undefined;
        });
        this.own(() => this.closeMenus());
    }

    protected onUpdate(props: { model: DrawEditor }): void {
        if (props.model !== this.model) {
            this.closeMenus();
            this.model = props.model;
            this.bindState();
        }
        this.sync(this.model.state.get().darkMode);
    }

    protected onDispose(): void {
        this.themeButton = undefined;
        this.copyButton = undefined;
        this.saveButton = undefined;
        this.openButton = undefined;
        this.snipButton = undefined;
    }

    private bindState(): void {
        this.stateSubscription?.();
        this.stateSubscription = this.model.state.subscribe<boolean>(
            (darkMode) => this.sync(darkMode),
            (state) => state.darkMode,
        );
    }

    private sync(darkMode: boolean): void {
        this.themeButton?.update(this.themeButtonProps(darkMode));
        this.saveMenu?.update({
            items: this.saveMenuItems(),
            placement: "bottom-start",
            offset: [-4, 4],
            onClose: this.handleMenuClose,
        });
        this.openMenu?.update({
            items: this.openMenuItems(),
            placement: "bottom-start",
            offset: [-4, 4],
            onClose: this.handleMenuClose,
        });
    }

    private themeButtonProps(darkMode: boolean): IconButtonViewProps {
        return {
            name: "draw-theme",
            size: "sm",
            title: darkMode ? "Switch to Light Theme" : "Switch to Dark Theme",
            icon: darkMode ? "sun" : "moon",
            onClick: this.model.toggleDarkMode,
        };
    }

    private copyButtonProps(): IconButtonViewProps {
        return {
            name: "draw-copy-image",
            size: "sm",
            title: "Copy Image to Clipboard",
            icon: "copy",
            onClick: () => { void this.handleCopyToClipboard(); },
        };
    }

    private saveButtonProps(): IconButtonViewProps {
        return {
            name: "draw-save",
            size: "sm",
            title: "Save as file",
            icon: "download",
            onClick: this.openSaveMenu,
        };
    }

    private openButtonProps(): IconButtonViewProps {
        return {
            name: "draw-open-new-tab",
            size: "sm",
            title: "Open in new tab",
            icon: "new-window",
            onClick: this.openNewTabMenu,
        };
    }

    private snipButtonProps(): IconButtonViewProps {
        return {
            name: "draw-snip",
            size: "sm",
            title: "Screen Snip",
            icon: "snip",
            onClick: () => { void this.handleScreenSnip(); },
        };
    }

    private getDefaultName(ext: string): string {
        const filePath = this.model.host?.state.get().filePath;
        if (filePath) {
            const base = fpBasename(filePath).replace(/\.excalidraw$/i, "");
            return `${base}.${ext}`;
        }
        return `drawing.${ext}`;
    }

    private hasElements(): boolean {
        const api = this.model.excalidrawApi;
        if (!api) return false;
        if (api.getSceneElements().length === 0) {
            ui.notify("Nothing to export — the drawing is empty", "warning");
            return false;
        }
        return true;
    }

    private async handleCopyToClipboard(): Promise<void> {
        const api = this.model.excalidrawApi;
        if (!api || !this.hasElements()) return;
        const blob = await exportAsPngBlob(api);
        await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
        ]);
        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    private async handleScreenSnip(): Promise<void> {
        const excalidraw = this.model.excalidrawApi;
        if (!excalidraw) return;
        const dataUrl = await api.startScreenSnip(true);
        if (!dataUrl) return;
        const dims = await getImageDimensions(dataUrl);
        const fileId = crypto.randomUUID();
        excalidraw.addFiles([{
            id: fileId as FileId,
            dataURL: dataUrl as DataURL,
            mimeType: MIME_TYPES.png,
            created: Date.now(),
        }]);
        const maxDim = 1200;
        const longer = Math.max(dims.width, dims.height);
        const scale = longer > maxDim ? maxDim / longer : 1;
        const w = Math.round(dims.width * scale);
        const h = Math.round(dims.height * scale);
        const newElements = convertToExcalidrawElements([{
            type: "image",
            x: IMAGE_OFFSET_X,
            y: IMAGE_OFFSET_Y,
            width: w,
            height: h,
            fileId: fileId as FileId,
            status: "saved",
        } satisfies ExcalidrawElementSkeleton]);
        const existing = excalidraw.getSceneElements();
        excalidraw.updateScene({ elements: [...existing, ...newElements] });
    }

    private saveMenuItems(): MenuItem[] {
        return [
            {
                label: "Save as SVG",
                onClick: async () => {
                    const api = this.model.excalidrawApi;
                    if (!api || !this.hasElements()) return;
                    await guard("Export failed", async () => {
                        const svgText = await exportAsSvgText(api);
                        const savePath = await fs.showSaveDialog({
                            title: "Save as SVG",
                            defaultPath: this.getDefaultName("svg"),
                            filters: [{ name: "SVG", extensions: ["svg"] }],
                        });
                        if (savePath) await fs.write(savePath, svgText);
                    });
                },
            },
            {
                label: "Save as PNG",
                onClick: async () => {
                    const api = this.model.excalidrawApi;
                    if (!api || !this.hasElements()) return;
                    await guard("Export failed", async () => {
                        const blob = await exportAsPngBlob(api);
                        const buffer = Buffer.from(await blob.arrayBuffer());
                        const savePath = await fs.showSaveDialog({
                            title: "Save as PNG",
                            defaultPath: this.getDefaultName("png"),
                            filters: [{ name: "PNG", extensions: ["png"] }],
                        });
                        if (savePath) await fs.saveBinaryFile(savePath, buffer);
                    });
                },
            },
        ];
    }

    private openMenuItems(): MenuItem[] {
        return [
            {
                label: "Open as SVG",
                onClick: async () => {
                    const api = this.model.excalidrawApi;
                    if (!api || !this.hasElements()) return;
                    await guard("Export failed", async () => {
                        const svgText = await exportAsSvgText(api);
                        pagesModel.addEditorPage("svg-view", "xml", this.getDefaultName("svg"), svgText);
                    });
                },
            },
            {
                label: "Open as Image",
                onClick: async () => {
                    const api = this.model.excalidrawApi;
                    if (!api || !this.hasElements()) return;
                    await guard("Export failed", async () => {
                        const blob = await exportAsPngBlob(api);
                        const blobUrl = URL.createObjectURL(blob);
                        pagesModel.openImageInNewTab(blobUrl);
                    });
                },
            },
        ];
    }

    private readonly openSaveMenu = (event: MouseEvent): void => {
        this.openToolbarMenu(event, this.saveMenuItems(), (menu) => { this.saveMenu = menu; });
    };

    private readonly openNewTabMenu = (event: MouseEvent): void => {
        this.openToolbarMenu(event, this.openMenuItems(), (menu) => { this.openMenu = menu; });
    };

    private openToolbarMenu(
        event: MouseEvent,
        items: MenuItem[],
        assign: (menu: MenuHandle) => void,
    ): void {
        if (!(event.currentTarget instanceof Element)) return;
        this.closeMenus();
        this.previousFocus = document.activeElement;
        assign(openMenu(event.currentTarget, {
            items,
            placement: "bottom-start",
            offset: [-4, 4],
            onClose: this.handleMenuClose,
        }));
    }

    private readonly handleMenuClose = (): void => {
        this.saveMenu = undefined;
        this.openMenu = undefined;
        if (this.previousFocus instanceof HTMLElement) this.previousFocus.focus();
        this.previousFocus = null;
    };

    private closeMenus(): void {
        this.saveMenu?.dispose();
        this.openMenu?.dispose();
        this.saveMenu = undefined;
        this.openMenu = undefined;
        this.previousFocus = null;
    }
}

export class DrawEditorView extends VanillaView<{ model: EditorModel }> {
    private model: DrawEditor | undefined;
    private toolbar: DrawToolbarView | undefined;
    private body: DrawBodyView | undefined;
    private chrome: TextChromeView | undefined;

    public constructor(props: { model: EditorModel }) {
        super(props, createContentsRoot());
    }

    protected onMount(): void {
        const model = requireDrawModel(this.props.model);
        const toolbar = this.child(new DrawToolbarView({ model }));
        const body = this.child(new DrawBodyView({ model }));
        const chrome = this.child(new TextChromeView({
            model: this.props.model,
            rightToolbarContributions: toolbar.root,
            children: body.root,
        }));

        this.model = model;
        this.toolbar = toolbar;
        this.body = body;
        this.chrome = chrome;
        this.root.append(toolbar.root, body.root, chrome.root);
        toolbar.mount();
        body.mount();
        chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireDrawModel(props.model);
        if (model !== this.model) {
            throw new Error("Draw view received a different model instance.");
        }
        const body = this.body;
        const toolbar = this.toolbar;
        const chrome = this.chrome;
        if (!body || !toolbar || !chrome) return;
        body.update({ model });
        toolbar.update({ model });
        chrome.update({
            model: props.model,
            rightToolbarContributions: toolbar.root,
            children: body.root,
        });
    }

}

export const drawModule: EditorModule = {
    createEditor: () =>
        new DrawEditor(new TComponentState({ ...defaultDrawEditorState })),
    View: DrawEditorView,
};

export { DrawEditor, defaultDrawEditorState };
export type { DrawEditorState, DrawQueueEvent } from "./DrawEditor";
