import type { EditorConfig } from "../../base/EditorConfig";
import { editorRegistry } from "../../base/editorRegistry";
import { createFileTypeIconElement } from "../../../components/icons/icon-elements";
import { settings } from "../../../api/settings";
import { isScriptLanguage } from "../../../scripting/transpile";
import { monacoLanguages } from "../../../core/utils/monaco-languages";
import { RunAllIcon, RunIcon } from "../../../theme/icons";
import { IconButtonView } from "../../../uikit/IconButton/IconButtonView";
import { openMenu, type MenuHandle } from "../../../uikit/Menu/attach-menu";
import type { MenuItem } from "../../../uikit/Menu/types";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { SegmentedControlView, type SegmentedControlViewProps } from "../../../uikit/SegmentedControl/SegmentedControlView";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import type { EditorView } from "../../../../shared/types";
import { NoteItemEditModel } from "./NoteItemEditModel";
import "../../../uikit/SegmentedControl/SegmentedControl.css";

export interface NoteItemToolbarViewProps {
    model: NoteItemEditModel;
    extrasVisible?: boolean;
    editorConfig?: EditorConfig;
}

type SegmentProps = SegmentedControlViewProps;

export class NoteItemToolbarView extends VanillaView<NoteItemToolbarViewProps> {
    readonly titleHost = document.createElement("div");
    private readonly languageButton: IconButtonView;
    private readonly extrasHost = document.createElement("div");
    private readonly firstSlot = document.createElement("div");
    private readonly lastSlot = document.createElement("div");
    private runButton: IconButtonView | undefined;
    private runAllButton: IconButtonView | undefined;
    private segmented: SegmentedControlView | undefined;
    private menu: MenuHandle | undefined;
    private selectionUnsubscribe: (() => void) | undefined;
    private modelUnsubscribe: (() => void) | undefined;

    public constructor(props: NoteItemToolbarViewProps) {
        super(props, createPanelElement({ direction: "row", align: "center", gap: "sm", flex: true }));
        this.root.dataset.name = "note-item-toolbar";
        this.titleHost.dataset.part = "title";
        this.titleHost.style.flex = "1 1 auto";
        this.titleHost.style.minWidth = "0";
        this.extrasHost.dataset.part = "extras";
        this.extrasHost.style.display = "flex";
        this.extrasHost.style.alignItems = "center";
        this.extrasHost.style.gap = "4px";
        this.firstSlot.dataset.part = "editor-toolbar-first";
        this.lastSlot.dataset.part = "editor-toolbar-last";
        this.applySlotStyle(this.firstSlot);
        this.applySlotStyle(this.lastSlot);
        this.languageButton = this.child(new IconButtonView(this.languageButtonProps(props.model)));
    }

    protected onMount(): void {
        this.root.append(this.languageButton.root, this.titleHost, this.extrasHost);
        this.languageButton.mount();
        this.modelUnsubscribe = this.props.model.state.subscribe(() => this.sync());
        this.selectionUnsubscribe = this.props.model.editor.state.subscribe(() => this.sync());
        this.own(() => this.modelUnsubscribe?.());
        this.own(() => this.selectionUnsubscribe?.());
        this.own(() => this.menu?.dispose());
        this.sync();
    }

    protected onUpdate(props: NoteItemToolbarViewProps): void {
        this.languageButton.update(this.languageButtonProps(props.model));
        this.sync();
    }

    protected onDispose(): void {
        this.props.model.setEditorToolbarRefFirst(null);
        this.props.model.setEditorToolbarRefLast(null);
    }

    private sync(): void {
        const model = this.props.model;
        const state = model.state.get();
        const visible = this.props.extrasVisible !== false;
        this.extrasHost.style.opacity = visible ? "1" : "0";
        this.extrasHost.style.transition = "opacity 0.5s ease";

        const embedded = state.editor !== "monaco";
        if (embedded) {
            this.appendOnce(this.firstSlot);
            this.appendOnce(this.lastSlot);
            model.setEditorToolbarRefFirst(this.firstSlot);
            model.setEditorToolbarRefLast(this.lastSlot);
        } else {
            this.firstSlot.remove();
            this.lastSlot.remove();
            model.setEditorToolbarRefFirst(null);
            model.setEditorToolbarRefLast(null);
        }

        const script = isScriptLanguage(state.language);
        this.syncRunButton(script, model.editor.state.get().hasSelection);
        this.syncSegmented(state.language, state.editor);
    }

    private syncRunButton(script: boolean, hasSelection: boolean): void {
        if (!script) {
            this.runButton && this.releaseControl(this.runButton);
            this.runAllButton && this.releaseControl(this.runAllButton);
            this.runButton = undefined;
            this.runAllButton = undefined;
            return;
        }

        if (!this.runButton) {
            this.runButton = this.child(new IconButtonView({
                name: "note-run-script",
                size: "sm",
                icon: RunIcon.createElement?.() ?? document.createElement("span"),
                title: "Run Script",
                onClick: () => { void this.props.model.runScript(); },
            }));
            this.runButton.mount();
            this.extrasHost.append(this.runButton.root);
        }
        this.runButton.update({
            name: "note-run-script",
            size: "sm",
            icon: RunIcon.createElement?.() ?? document.createElement("span"),
            title: hasSelection ? "Run Selected Script" : "Run Script",
            onClick: () => { void this.props.model.runScript(); },
        });

        if (hasSelection && !this.runAllButton) {
            this.runAllButton = this.child(new IconButtonView({
                name: "note-run-all-script",
                size: "sm",
                icon: RunAllIcon.createElement?.() ?? document.createElement("span"),
                title: "Run All Script",
                onClick: () => { void this.props.model.runScript(true); },
            }));
            this.runAllButton.mount();
            this.extrasHost.append(this.runAllButton.root);
        } else if (!hasSelection && this.runAllButton) {
            this.releaseControl(this.runAllButton);
            this.runAllButton = undefined;
        }
    }

    private syncSegmented(language: string, editor: EditorView): void {
        const options = editorRegistry.getSwitchOptions(language || "plaintext", undefined);
        if (options.options.length === 0) {
            if (this.segmented) {
                this.releaseControl(this.segmented);
                this.segmented = undefined;
            }
            return;
        }

        const props: SegmentProps = {
            name: "note-editor-switch",
            items: options.options.map((value) => ({
                value,
                label: options.getOptionLabel(value),
            })),
            value: editor || "monaco",
            onChange: (value) => this.props.model.changeEditor(value as EditorView),
            size: "sm",
        };
        if (!this.segmented) {
            this.segmented = this.child(new SegmentedControlView(props));
            this.segmented.mount();
            this.extrasHost.append(this.segmented.root);
        } else {
            this.segmented.update(props);
        }
    }

    private languageButtonProps(model: NoteItemEditModel) {
        const language = model.state.get().language || "plaintext";
        return {
            name: "note-language",
            size: "sm" as const,
            icon: createFileTypeIconElement({ language, width: 16, height: 16 }),
            title: language,
            onClick: (event: MouseEvent) => {
                if (event.currentTarget instanceof Element) this.openLanguageMenu(event.currentTarget);
            },
        };
    }

    private openLanguageMenu(anchor: Element): void {
        this.menu?.dispose();
        const language = this.props.model.state.get().language;
        const activeLanguages = settings.get<string[]>("tab-recent-languages") ?? [];
        const items: MenuItem[] = [];
        for (const lang of this.languageItems(activeLanguages)) {
            items.push({
                id: lang.id,
                label: lang.label,
                selected: lang.id === language,
                icon: createFileTypeIconElement({ language: lang.id, width: 16, height: 16 }),
                onClick: () => {
                    this.props.model.changeLanguage(lang.id);
                    settings.set("tab-recent-languages", [
                        lang.id,
                        ...activeLanguages.filter((item) => item !== lang.id),
                    ]);
                },
            });
        }
        this.menu = openMenu(anchor, {
            name: "note-language-menu",
            items,
            onClose: () => { this.menu = undefined; },
        });
    }

    private languageItems(activeLanguages: string[]): Array<{ id: string; label: string }> {
        const base = monacoLanguages.map((language) => ({
            id: language.id,
            label: language.aliases[0] || language.id,
        })).sort((a, b) => a.label.localeCompare(b.label));
        const first = base.find((item) => item.id === "plaintext");
        const active = base.filter((item) => item.id !== "plaintext" && activeLanguages.includes(item.id))
            .sort((a, b) => activeLanguages.indexOf(a.id) - activeLanguages.indexOf(b.id));
        const inactive = base.filter((item) => item.id !== "plaintext" && !activeLanguages.includes(item.id));
        return [...(first ? [first] : []), ...active, ...inactive];
    }

    private appendOnce(element: HTMLElement): void {
        if (!element.parentElement) this.extrasHost.append(element);
    }

    private applySlotStyle(element: HTMLElement): void {
        element.style.display = "flex";
        element.style.alignItems = "center";
        element.style.gap = "4px";
    }

    private releaseControl(view: VanillaView<unknown>): void {
        this.releaseChild(view);
    }
}
