import React from "react";
import { api } from "../../../ipc/renderer/api";
import type { PageDragData } from "../../../shared/types";
import { parseObject } from "../../core/utils/parse-utils";
import { ContextMenuEvent } from "../../api/events/events";
import { pagesModel } from "../../api/pages";
import { appWindow } from "../../api/window";
import { settings } from "../../api/settings";
import type { EditorOrHost } from "../../editors/base";
import { monacoLanguages } from "../../core/utils/monaco-languages";
import { TraitTypeId, getTraitDragData, hasTraitDragData, setTraitDragData } from "../../core/traits";
import { CircleIcon, CloseIcon, DuplicateIcon, GroupIcon, VolumeIcon, VolumeMutedIcon } from "../../theme/icons";
import { LanguageIcon } from "../../components/icons/LanguageIcon";
import { createEditorIconElement, subscribeFileIconElements, type EditorIconElement } from "../../components/icons/icon-elements";
import { fillSlot, type SlotContent } from "../../uikit/shared/fill-slot";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { attachTooltip, type TooltipAttachment } from "../../uikit/Tooltip/attach-tooltip";
import { openMenu, type MenuHandle } from "../../uikit/Menu/attach-menu";
import type { MenuItem } from "../../uikit/Menu/types";
import type { PageTabProps } from "./PageTab";
import "./PageTab.css";

interface EditorTabState {
    title?: string;
    modified?: boolean;
    language?: string;
    filePath?: string;
    deleted?: boolean;
    password?: unknown;
    encrypted?: boolean;
    temp?: boolean;
    favicon?: string;
    iconKey?: string;
    _anyTabAudible?: boolean;
    pageMuted?: boolean;
}

interface EditorProjection {
    title: string;
    modified: boolean;
    language: string;
    filePath: string;
    deleted: boolean;
    encrypted: boolean;
    temp: boolean;
    iconKey: string;
    anyTabAudible: boolean;
    pageMuted: boolean;
}

const emptyEditorProjection: EditorProjection = {
    title: "Empty",
    modified: false,
    language: "",
    filePath: "",
    deleted: false,
    encrypted: false,
    temp: false,
    iconKey: "",
    anyTabAudible: false,
    pageMuted: false,
};

function selectEditorState(state: EditorTabState): EditorProjection {
    return {
        title: state.title ?? "Empty",
        modified: state.modified ?? false,
        language: state.language ?? "",
        filePath: state.filePath ?? "",
        deleted: state.deleted ?? false,
        encrypted: state.encrypted ?? false,
        temp: state.temp ?? false,
        iconKey: state.iconKey ?? "",
        anyTabAudible: state._anyTabAudible ?? false,
        pageMuted: state.pageMuted ?? false,
    };
}

function slotForEditorIcon(result: EditorIconElement): SlotContent {
    if (!result) return null;
    return result.kind === "element" ? result.element : result.value;
}

function setPresence(element: HTMLElement, name: string, value: boolean): void {
    if (value) element.setAttribute(name, "");
    else element.removeAttribute(name);
}

export class PageTabView extends VanillaView<PageTabProps> {
    private readonly emptyLanguage = document.createElement("span");
    private readonly emptyIconHost = document.createElement("span");
    private readonly titleLabel = document.createElement("span");
    private readonly titleText = document.createTextNode("");
    private readonly encryptionIcon = document.createElement("span");
    private readonly pinnedTooltipTrigger = document.createElement("span");
    private readonly languageButton: IconButtonView;
    private readonly closeButton: IconButtonView;
    private languageIconHost: HTMLElement | undefined;
    private closeIconHost: HTMLElement | undefined;
    private soundButton: IconButtonView | undefined;
    private languageMenu: MenuHandle | undefined;
    private focusedBeforeLanguageMenu: HTMLElement | null = null;
    private titleTooltip: TooltipAttachment | undefined;
    private pinnedTooltip: TooltipAttachment | undefined;
    private editorUnsubscribe: () => void = () => undefined;
    private iconUnsubscribe: (() => void) | undefined;
    private languageSettingsSubscription: { dispose(): void } | undefined;
    private languageIconCleanup: (() => void) | undefined;
    private closeIconCleanup: (() => void) | undefined;
    private emptyIconCleanup: (() => void) | undefined;
    private currentEditor: EditorOrHost | null = null;
    private projection: EditorProjection = emptyEditorProjection;
    private isActive = false;
    private isGrouped = false;
    private dragEnterCount = 0;

    public constructor(props: PageTabProps) {
        super(props);
        this.emptyLanguage.dataset.part = "empty-language";
        this.emptyLanguage.append(this.emptyIconHost);
        this.titleLabel.dataset.part = "title-label";
        this.encryptionIcon.dataset.part = "encryption-icon";
        this.titleLabel.append(this.encryptionIcon, this.titleText);
        this.pinnedTooltipTrigger.dataset.part = "pinned-tooltip-trigger";
        this.languageButton = new IconButtonView({
            name: "tab-language",
            size: "sm",
            title: "",
            icon: "close",
            onClick: (event) => this.onLanguageClick(event),
        });
        this.closeButton = new IconButtonView({
            name: "tab-close",
            size: "sm",
            title: "Close Page",
            icon: "close",
            ...{"data-part": "close-button"},
            onClick: () => this.closeClick(),
        });
    }

    protected onMount(): void {
        this.root.dataset.type = "page-tab";
        this.root.dataset.name = "page-tab";
        this.root.draggable = true;
        // The trigger is NOT appended here. It is `position: absolute; inset: 0` and is only
        // rendered for a pinned tab with a file path, matching the original JSX. A pinned tab's
        // root is `position: sticky`, which makes it the trigger's containing block; an unpinned
        // root is unpositioned, so an unconditionally appended trigger resolves against the
        // nearest positioned ancestor — `.app-header` — and covers the whole title bar. Being
        // `-webkit-app-region: none` and on top, it then swallows every tab grab and the window
        // drags instead of the tab reordering. `syncPinnedTooltip` owns attach/detach.
        this.root.append(this.titleLabel, this.closeButton.root);

        this.child(this.languageButton).mount();
        this.child(this.closeButton).mount();
        this.languageIconHost = this.languageButton.root.querySelector<HTMLElement>('[data-part="icon"]') ?? undefined;
        this.closeIconHost = this.closeButton.root.querySelector<HTMLElement>('[data-part="icon"]') ?? undefined;

        this.listen(this.root, "click", (event) => this.handleClick(event));
        this.listen(this.root, "contextmenu", (event) => this.handleContextMenu(event));
        this.listen(this.root, "dragstart", (event) => this.handleDragStart(event));
        this.listen(this.root, "dragend", (event) => this.handleDragEnd(event));
        this.listen(this.root, "drop", (event) => this.handleDrop(event));
        this.listen(this.root, "dragenter", (event) => this.handleDragEnter(event));
        this.listen(this.root, "dragover", (event) => this.handleDragOver(event));
        this.listen(this.root, "dragleave", () => this.handleDragLeave());
        this.listen(this.encryptionIcon, "click", () => this.encryptionClick());

        this.titleTooltip = attachTooltip(this.titleLabel, {
            content: null,
            placement: "bottom",
            delayShow: 1500,
        });
        this.iconUnsubscribe = subscribeFileIconElements(() => this.updateIcons());
        this.own(() => this.iconUnsubscribe?.());
        this.languageSettingsSubscription = settings.onChanged.subscribe(({ key }) => {
            if (key === "tab-recent-languages") this.updateLanguageMenu();
        });
        this.own(() => this.languageSettingsSubscription?.dispose());
        this.bind(
            this.props.model.state,
            (state) => ({ pinned: state.pinned, mainEditorId: state.mainEditorId }),
            () => {
                this.syncEditorSubscription();
                this.updateView();
            },
        );
        this.bind(
            pagesModel.state,
            (state) => {
                const activeId = state.ordered[state.ordered.length - 1]?.id;
                const groupedId = activeId
                    ? state.leftRight.get(activeId) ?? state.rightLeft.get(activeId)
                    : undefined;
                return {
                    active: this.props.model.id === activeId || this.props.model.id === groupedId,
                    grouped: state.leftRight.has(this.props.model.id) || state.rightLeft.has(this.props.model.id),
                };
            },
            ({ active, grouped }) => {
                this.isActive = active;
                this.isGrouped = grouped;
                this.updateView();
            },
        );
        this.syncEditorSubscription();
        this.updateView();
    }

    protected onUpdate(props: PageTabProps): void {
        if (props.model !== this.props.model) this.syncEditorSubscription();
        this.updateView();
    }

    protected onDispose(): void {
        this.languageMenu?.dispose();
        this.languageMenu = undefined;
        this.pinnedTooltip?.dispose();
        this.titleTooltip?.dispose();
        this.editorUnsubscribe();
        this.soundButton?.dispose();
        this.soundButton = undefined;
        this.languageIconCleanup?.();
        this.closeIconCleanup?.();
        this.emptyIconCleanup?.();
    }

    private syncEditorSubscription(): void {
        const editor = this.props.model.mainEditor;
        if (editor === this.currentEditor) return;
        this.editorUnsubscribe();
        this.currentEditor = editor;
        this.projection = emptyEditorProjection;
        if (editor) {
            this.projection = selectEditorState(editor.state.get() as EditorTabState);
            this.editorUnsubscribe = editor.state.subscribe(
                () => this.applyEditorProjection(selectEditorState(editor.state.get() as EditorTabState)),
            );
        }
        this.updateView();
    }

    private applyEditorProjection(next: EditorProjection): void {
        this.projection = next;
        this.updateView();
    }

    private updateView(): void {
        const page = this.props.model;
        const pinned = page.pinned;
        const textHost = pagesModel.getTextFileHost(page.id);
        const encrypted = Boolean(textHost?.encrypted);
        const decrypted = Boolean(textHost?.decrypted);
        const hasEncryption = encrypted || decrypted;
        const editor = this.currentEditor ?? page.mainEditor;

        setPresence(this.root, "data-active", this.isActive);
        setPresence(this.root, "data-modified", this.projection.modified);
        setPresence(this.root, "data-temp", this.projection.temp);
        setPresence(this.root, "data-deleted", this.projection.deleted);
        setPresence(this.root, "data-pinned", pinned);
        setPresence(this.root, "data-grouped", this.isGrouped);
        setPresence(this.root, "data-has-encryption", hasEncryption);
        if (pinned && this.props.pinnedLeft !== undefined) this.root.style.left = `${this.props.pinnedLeft}px`;
        else this.root.style.removeProperty("left");

        this.syncEditorKind(editor);
        this.titleText.data = pinned ? "" : this.projection.title;
        this.encryptionIcon.textContent = encrypted ? "🔒" : "🔓";
        this.encryptionIcon.title = encrypted ? "Decrypt File" : "Encrypt File";
        this.encryptionIcon.hidden = !hasEncryption;
        this.titleTooltip?.update({
            content: !pinned && this.projection.filePath ? this.projection.filePath : null,
            placement: "bottom",
            delayShow: 1500,
        });
        this.syncPinnedTooltip(pinned, this.projection.filePath);
        this.syncSoundButton(editor);
        this.closeButton.update({
            name: "tab-close",
            size: "sm",
            title: this.isGrouped ? "Ungroup" : "Close Page",
            icon: "close",
            ...{"data-part": "close-button"},
            onClick: () => this.closeClick(),
        });
        this.updateIcons();
        this.updateCloseIcon();
    }

    private syncEditorKind(editor: EditorOrHost | null): void {
        const noLanguage = Boolean(editor?.noLanguage);
        setPresence(this.emptyLanguage, "data-with-icon", Boolean(editor?.getIcon));
        if (noLanguage) {
            if (this.languageButton.root.parentNode) this.languageButton.root.remove();
            if (!this.emptyLanguage.parentNode) this.root.insertBefore(this.emptyLanguage, this.titleLabel);
        } else {
            if (this.emptyLanguage.parentNode) this.emptyLanguage.remove();
            if (!this.languageButton.root.parentNode) this.root.insertBefore(this.languageButton.root, this.titleLabel);
            this.languageButton.update({
                name: "tab-language",
                size: "sm",
                title: this.projection.language,
                icon: "close",
                onClick: (event) => this.onLanguageClick(event),
            });
        }
    }

    private syncPinnedTooltip(pinned: boolean, filePath: string): void {
        const shouldShow = pinned && Boolean(filePath);
        // Keep the element's presence in step with the tooltip: first child when shown, detached
        // otherwise, so it can never escape its tab's containing block.
        if (shouldShow && this.pinnedTooltipTrigger.parentNode !== this.root) {
            this.root.prepend(this.pinnedTooltipTrigger);
        } else if (!shouldShow && this.pinnedTooltipTrigger.parentNode) {
            this.pinnedTooltipTrigger.remove();
        }
        if (shouldShow && !this.pinnedTooltip) {
            this.pinnedTooltip = attachTooltip(this.pinnedTooltipTrigger, {
                content: filePath,
                placement: "bottom",
                delayShow: 1500,
            });
        } else if (!shouldShow) {
            this.pinnedTooltip?.dispose();
            this.pinnedTooltip = undefined;
        } else {
            this.pinnedTooltip?.update({ content: filePath, placement: "bottom", delayShow: 1500 });
        }
    }

    private syncSoundButton(editor: EditorOrHost | null): void {
        const toggleMuteAll = (editor as { toggleMuteAll?: () => void } | null)?.toggleMuteAll;
        const show = this.projection.anyTabAudible || this.projection.pageMuted || Boolean(toggleMuteAll);
        if (show && !this.soundButton) {
            this.soundButton = this.child(new IconButtonView({
                name: "tab-sound",
                size: "sm",
                ...{"data-part": "sound-button"},
                active: this.projection.anyTabAudible || this.projection.pageMuted || undefined,
                title: this.projection.pageMuted ? "Unmute Page" : "Mute Page",
                icon: this.projection.pageMuted
                    ? React.createElement(VolumeMutedIcon)
                    : React.createElement(VolumeIcon),
                onClick: (event) => {
                    event.stopPropagation();
                    (this.currentEditor as { toggleMuteAll?: () => void } | null)?.toggleMuteAll?.();
                },
            }));
            this.soundButton.mount();
            this.root.insertBefore(this.soundButton.root, this.closeButton.root);
        } else if (!show && this.soundButton) {
            this.soundButton.dispose();
            this.soundButton.root.remove();
            this.soundButton = undefined;
        } else if (this.soundButton) {
            this.soundButton.update({
                name: "tab-sound",
                size: "sm",
                ...{"data-part": "sound-button"},
                active: this.projection.anyTabAudible || this.projection.pageMuted || undefined,
                title: this.projection.pageMuted ? "Unmute Page" : "Mute Page",
                icon: this.projection.pageMuted
                    ? React.createElement(VolumeMutedIcon)
                    : React.createElement(VolumeIcon),
                onClick: (event) => {
                    event.stopPropagation();
                    (this.currentEditor as { toggleMuteAll?: () => void } | null)?.toggleMuteAll?.();
                },
            });
        }
    }

    private updateIcons(): void {
        const editor = this.currentEditor;
        if (editor?.noLanguage) {
            this.emptyIconCleanup = fillSlot(
                this.emptyIconHost,
                slotForEditorIcon(createEditorIconElement({ noLanguage: true, getIcon: editor.getIcon })),
            );
            this.languageIconCleanup = fillSlot(this.languageIconHost ?? this.emptyIconHost, null);
        } else {
            this.emptyIconCleanup = fillSlot(this.emptyIconHost, null);
            this.languageIconCleanup = fillSlot(
                this.languageIconHost ?? this.emptyIconHost,
                slotForEditorIcon(createEditorIconElement({
                    language: this.projection.language,
                    title: this.projection.title,
                })),
            );
        }
    }

    private updateCloseIcon(): void {
        if (!this.closeIconHost) return;
        const icon = React.createElement(
            React.Fragment,
            null,
            React.createElement(this.isGrouped ? GroupIcon : CloseIcon, { "data-part": "close-icon" } as React.Attributes),
            React.createElement(CircleIcon, { "data-part": "modified-icon" } as React.Attributes),
        );
        this.closeIconCleanup = fillSlot(this.closeIconHost, icon);
    }

    private onLanguageClick(event: React.SyntheticEvent<HTMLElement>): void {
        if (!this.isActive && (event.nativeEvent as MouseEvent).ctrlKey) {
            this.handleClick(event.nativeEvent as MouseEvent);
            return;
        }
        const pageId = this.props.model.id;
        pagesModel.showPage(pageId);
        if (!this.isActive) return;
        this.focusedBeforeLanguageMenu = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const anchor = event.currentTarget as Element;
        const options = {
            items: this.getLanguageMenuItems(),
            placement: "bottom-start" as const,
            offset: [-4, 4] as [number, number],
            onClose: () => {
                this.languageMenu = undefined;
                this.focusedBeforeLanguageMenu?.focus();
                this.focusedBeforeLanguageMenu = null;
            },
        };
        if (this.languageMenu) this.languageMenu.update(options);
        else this.languageMenu = openMenu(anchor, options);
    }

    private updateLanguageMenu(): void {
        if (!this.languageMenu || !this.languageIconHost) return;
        this.languageMenu.update({
            items: this.getLanguageMenuItems(),
            placement: "bottom-start",
            offset: [-4, 4],
            onClose: () => {
                this.languageMenu = undefined;
                this.focusedBeforeLanguageMenu?.focus();
                this.focusedBeforeLanguageMenu = null;
            },
        });
    }

    private setActiveLanguage(language: string): void {
        const currentActive = settings.get("tab-recent-languages");
        settings.set("tab-recent-languages", [language, ...currentActive.filter((item) => item !== language)]);
    }

    private getLanguageMenuItems(): MenuItem[] {
        const editor = this.currentEditor;
        if (!editor) return [];
        const currentLanguage = this.projection.language;
        const activeLanguages = settings.get("tab-recent-languages");
        const items = monacoLanguages.map((language) => ({
            id: language.id,
            label: language.aliases[0] || language.id,
            icon: React.createElement(LanguageIcon, { language: language.id }),
            onClick: () => {
                editor.changeLanguage(language.id);
                this.setActiveLanguage(language.id);
            },
            selected: currentLanguage === language.id,
        })).sort((a, b) => a.label.localeCompare(b.label));
        const first = items.find((item) => item.id === "plaintext");
        const recent = items
            .filter((item) => item.id !== "plaintext" && activeLanguages.includes(item.id))
            .sort((a, b) => activeLanguages.indexOf(a.id) - activeLanguages.indexOf(b.id));
        const inactive = items.filter((item) => item.id !== "plaintext" && !activeLanguages.includes(item.id));
        return [...(first ? [first] : []), ...recent, ...inactive];
    }

    private handleContextMenu(event: MouseEvent): void {
        const page = this.props.model;
        const editorInstance = page.mainEditorInstance;
        const ctxEvent = ContextMenuEvent.fromNativeEvent(event, "page-tab");
        const isPinned = page.pinned;
        const pinUnpinItem: MenuItem = {
            label: isPinned ? "Unpin Tab" : "Pin Tab",
            onClick: () => isPinned ? pagesModel.unpinTab(page.id) : pagesModel.pinTab(page.id),
        };
        const menuItems: MenuItem[] = [];
        if (isPinned) menuItems.push(pinUnpinItem);
        if (!isPinned) {
            menuItems.push({
                label: "Close Tab",
                onClick: () => page.close(),
                startGroup: menuItems.length > 0,
            });
        }
        menuItems.push({
            label: "Close Other Tabs",
            disabled: pagesModel.state.get().pages.length <= 1,
            onClick: () => pagesModel.closeOtherPages(page.id),
            startGroup: isPinned,
        });
        if (!isPinned) {
            menuItems.push(
                {
                    label: "Close Tabs to the Right",
                    disabled: pagesModel.isLastPage(page.id),
                    onClick: () => pagesModel.closeToTheRight(page.id),
                },
                {
                    label: "Open in New Window",
                    onClick: () => api.addDragEvent(this.getDragData()),
                },
            );
        }
        menuItems.push({
            label: "Duplicate Tab",
            icon: React.createElement(DuplicateIcon),
            onClick: () => pagesModel.duplicatePage(page.id),
            startGroup: isPinned,
        });
        if (!isPinned) menuItems.push({ ...pinUnpinItem, startGroup: true });
        const editorItems = editorInstance?.onGetMenuItems() ?? [];
        if (editorItems.length) {
            editorItems[0] = { ...editorItems[0], startGroup: true };
            menuItems.push(...editorItems);
        }
        ctxEvent.items.push(...menuItems);
    }

    private getDragData(drop = false): PageDragData {
        return {
            sourceWindowIndex: drop ? undefined : appWindow.windowIndex,
            targetWindowIndex: drop ? appWindow.windowIndex : undefined,
            page: this.props.model.getDescriptor(),
        };
    }

    private handleDragStart(event: DragEvent): void {
        const page = this.props.model;
        setTraitDragData(event.dataTransfer, TraitTypeId.PageTab, { key: page.id });
        if (!page.pinned) event.dataTransfer.setData("application/persephone-tab", JSON.stringify(this.getDragData()));
    }

    private handleDragEnd(event: DragEvent): void {
        if (this.props.model.pinned) return;
        const droppedOutside = event.clientX < 0
            || event.clientX > window.innerWidth
            || event.clientY < 0
            || event.clientY > window.innerHeight;
        if (droppedOutside) {
            const dropData = this.getDragData();
            dropData.dropPosition = { x: event.screenX, y: event.screenY };
            api.addDragEvent(dropData);
        }
    }

    private handleDrop(event: DragEvent): void {
        this.dragEnterCount = 0;
        this.root.removeAttribute("data-drag-over");
        const targetId = this.props.model.id;
        const dataStr = event.dataTransfer?.getData("application/persephone-tab");
        const tabData = parseObject(dataStr) as { sourceWindowIndex?: number } | undefined;
        if (tabData?.sourceWindowIndex !== undefined && tabData.sourceWindowIndex !== appWindow.windowIndex) {
            api.addDragEvent(this.getDragData(true));
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const payload = getTraitDragData(event.dataTransfer);
        if (payload?.typeId !== TraitTypeId.PageTab) return;
        const sourceId = (payload.data as { key: string }).key;
        if (sourceId !== targetId) pagesModel.moveTab(sourceId, targetId);
        event.preventDefault();
        event.stopPropagation();
    }

    private handleDragEnter(event: DragEvent): void {
        this.dragEnterCount++;
        if (!hasTraitDragData(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        this.root.setAttribute("data-drag-over", "");
    }

    private handleDragOver(event: DragEvent): void {
        if (!hasTraitDragData(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    }

    private handleDragLeave(): void {
        this.dragEnterCount--;
        if (this.dragEnterCount <= 0) {
            this.dragEnterCount = 0;
            this.root.removeAttribute("data-drag-over");
        }
    }

    private closeClick(): void {
        const page = this.props.model;
        if (this.isGrouped) {
            pagesModel.ungroup(page.id);
            pagesModel.showPage(page.id);
        } else {
            page.close();
        }
    }

    private handleClick(event: MouseEvent): void {
        const pageId = this.props.model.id;
        if (event.ctrlKey) {
            const activeId = pagesModel.activePage?.id;
            if (activeId !== pageId) pagesModel.groupTabs(activeId, pageId, true);
        }
        pagesModel.showPage(pageId);
    }

    private encryptionClick(): void {
        const textHost = pagesModel.getTextFileHost(this.props.model.id);
        if (textHost?.encrypted) textHost.showEncryptionDialog();
        else if (textHost?.decrypted) textHost.encryptWithCurrentPassword();
    }
}
