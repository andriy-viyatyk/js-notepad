import { pagesModel } from "../../api/pages";
import { ui } from "../../api/ui";
import type { EditorModel, EditorStateBase } from "./EditorModel";
import type { IContentHost } from "./IContentHost";
import { ContentHostFooterView } from "./ContentHostFooterView";
import { PageToolbarView } from "./PageToolbarView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import type { IconButtonProps } from "../../uikit/IconButton/IconButtonView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { fillSlot, type SlotContent } from "../../uikit/shared/fill-slot";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { isScriptLanguage } from "../../scripting/transpile";
import type { PageModel } from "../../api/pages/PageModel";
import type { TextFileModel } from "../text/TextEditorModel";
import { ScriptPanelView } from "../text/ScriptPanelView";
import "../../uikit/Panel/Panel.css";

export interface TextChromeViewProps {
    model: EditorModel;
    children: SlotContent;
    toolbarContributions?: SlotContent;
    rightToolbarContributions?: SlotContent;
    footerContributions?: SlotContent;
}

interface ScriptRunner {
    runScript(all?: boolean): Promise<void>;
}

function hasScriptRunner(model: EditorModel): model is EditorModel & ScriptRunner {
    return "runScript" in model && typeof model.runScript === "function";
}

function selectHasSelection(state: EditorStateBase): boolean {
    return "hasSelection" in state && state.hasSelection === true;
}

function createContentsPart(part: string): HTMLSpanElement {
    const element = document.createElement("span");
    element.dataset.part = part;
    element.style.display = "contents";
    return element;
}

class CompareButtonView extends VanillaView<{ model: EditorModel }> {
    private model: EditorModel;
    private button: IconButtonView | undefined;

    public constructor(props: { model: EditorModel }) {
        super(props, document.createElement("span"));
        this.model = props.model;
    }

    protected onMount(): void {
        this.root.dataset.part = "text-compare";
        this.root.style.display = "contents";
        this.bind(
            pagesModel.state,
            (state) => ({ leftRight: state.leftRight, rightLeft: state.rightLeft }),
            () => this.sync(),
        );
    }

    protected onUpdate(props: { model: EditorModel }): void {
        this.model = props.model;
        this.sync();
    }

    protected onDispose(): void {
        this.button = undefined;
    }

    private sync(): void {
        const ownerPage = this.model.page;
        const leftGroupedPage = ownerPage
            ? pagesModel.getLeftGroupedPage(ownerPage.id)
            : undefined;
        const visible = Boolean(
            ownerPage
            && leftGroupedPage
            && pagesModel.canCompare(leftGroupedPage.id, ownerPage.id),
        );

        if (!visible) {
            if (this.button) {
                this.releaseChild(this.button);
                this.button = undefined;
            }
            return;
        }

        const buttonProps: IconButtonProps = {
            name: "text-compare-left",
            size: "sm",
            title: "Compare with Left Page",
            icon: "compare",
            onClick: this.handleClick,
        };
        if (!this.button) {
            this.button = this.child(new IconButtonView(buttonProps));
            this.root.append(this.button.root);
            this.button.mount();
        } else {
            this.button.update(buttonProps);
        }
    }

    private readonly handleClick = (): void => {
        const ownerPage = this.model.page;
        if (ownerPage) pagesModel.enterCompareMode(ownerPage.id);
    };
}

class RunButtonsView extends VanillaView<{ model: EditorModel; host: TextFileModel }> {
    private model: EditorModel;
    private host: TextFileModel;
    private runButton: IconButtonView | undefined;
    private runAllButton: IconButtonView | undefined;

    public constructor(props: { model: EditorModel; host: TextFileModel }) {
        super(props, document.createElement("span"));
        this.model = props.model;
        this.host = props.host;
    }

    protected onMount(): void {
        this.root.dataset.part = "text-run-buttons";
        this.root.style.display = "contents";
        this.bind(this.host.state, (state) => state.language, () => this.sync());
        this.bind(this.model.state, selectHasSelection, () => this.sync());
    }

    protected onUpdate(props: { model: EditorModel; host: TextFileModel }): void {
        this.model = props.model;
        this.host = props.host;
        this.sync();
    }

    protected onDispose(): void {
        this.runButton = undefined;
        this.runAllButton = undefined;
    }

    private sync(): void {
        const visible = isScriptLanguage(this.host.state.get().language)
            && hasScriptRunner(this.model);
        if (!visible) {
            this.removeRunButtons();
            return;
        }

        const hasSelection = selectHasSelection(this.model.state.get());
        const runButtonProps: IconButtonProps = {
            name: "text-run-script",
            size: "sm",
            title: hasSelection ? "Run Selected Script (F5)" : "Run Script (F5)",
            icon: "run",
            onClick: () => this.runScript(),
        };
        if (!this.runButton) {
            this.runButton = this.child(new IconButtonView(runButtonProps));
            this.root.append(this.runButton.root);
            this.runButton.mount();
        } else {
            this.runButton.update(runButtonProps);
        }

        if (hasSelection && !this.runAllButton) {
            this.runAllButton = this.child(new IconButtonView({
                name: "text-run-all-script",
                size: "sm",
                title: "Run All Script",
                icon: "run-all",
                onClick: () => this.runScript(true),
            }));
            this.root.append(this.runAllButton.root);
            this.runAllButton.mount();
        } else if (!hasSelection && this.runAllButton) {
            this.releaseChild(this.runAllButton);
            this.runAllButton = undefined;
        }
    }

    private removeRunButtons(): void {
        if (this.runAllButton) {
            this.releaseChild(this.runAllButton);
            this.runAllButton = undefined;
        }
        if (this.runButton) {
            this.releaseChild(this.runButton);
            this.runButton = undefined;
        }
    }

    private runScript(all?: boolean): void {
        if (hasScriptRunner(this.model)) void this.model.runScript(all);
    }
}

class ShowResourcesButtonView extends VanillaView<{ host: TextFileModel }> {
    private host: TextFileModel;
    private button: IconButtonView | undefined;

    public constructor(props: { host: TextFileModel }) {
        super(props, document.createElement("span"));
        this.host = props.host;
    }

    protected onMount(): void {
        this.root.dataset.part = "text-show-resources";
        this.root.style.display = "contents";
        this.bind(this.host.state, (state) => state.language, () => this.sync());
    }

    protected onUpdate(props: { host: TextFileModel }): void {
        this.host = props.host;
        this.sync();
    }

    protected onDispose(): void {
        this.button = undefined;
    }

    private sync(): void {
        if (this.host.state.get().language !== "html") {
            if (this.button) {
                this.releaseChild(this.button);
                this.button = undefined;
            }
            return;
        }

        const buttonProps: IconButtonProps = {
            name: "text-show-resources",
            size: "sm",
            title: "Show Resources",
            icon: "web-scraper",
            onClick: () => { void showHtmlResources(this.host); },
        };
        if (!this.button) {
            this.button = this.child(new IconButtonView(buttonProps));
            this.root.append(this.button.root);
            this.button.mount();
        } else {
            this.button.update(buttonProps);
        }
    }
}

export class TextChromeView extends VanillaView<TextChromeViewProps> {
    private model: EditorModel;
    private host: IContentHost | null = null;
    private textHost: TextFileModel | null = null;
    private branchActive = false;
    private focusTimer: ReturnType<typeof setTimeout> | undefined;

    private pageToolbar: PageToolbarView | undefined;
    private compareButton: CompareButtonView | undefined;
    private runButtons: RunButtonsView | undefined;
    private showResourcesButton: ShowResourcesButtonView | undefined;
    private scriptPanel: ScriptPanelView | undefined;
    private footer: ContentHostFooterView | undefined;
    private overlay: HTMLDivElement | undefined;

    private childrenHost: HTMLSpanElement | undefined;
    private toolbarContent: HTMLSpanElement | undefined;
    private rightContent: HTMLSpanElement | undefined;
    private toolbarContributionsHost: HTMLSpanElement | undefined;
    private rightContributionsHost: HTMLSpanElement | undefined;
    private childrenCleanup: (() => void) | undefined;
    private toolbarContributionsCleanup: (() => void) | undefined;
    private rightContributionsCleanup: (() => void) | undefined;

    public constructor(props: TextChromeViewProps) {
        super(props, createPanelElement({
            name: "text-chrome-root",
            direction: "column",
            flex: 1,
            height: 0,
            position: "relative",
            gap: "xs",
        }));
        this.model = props.model;
        this.root.tabIndex = 0;
    }

    protected onMount(): void {
        this.buildBranch(this.props.model.contentHost);
        this.own(() => this.releaseSlotResources());
        this.listen(this.root, "keydown", this.handleRootKeyDown);
        const focusSubscription = pagesModel.onFocus.subscribe(this.handlePageFocus);
        this.own(() => {
            this.clearFocusTimer();
            focusSubscription();
        });
    }

    protected onUpdate(props: TextChromeViewProps): void {
        const nextHost = props.model.contentHost;
        if (props.model !== this.model || nextHost !== this.host) {
            this.releaseBranch();
            this.model = props.model;
            this.buildBranch(nextHost);
            return;
        }

        this.updateSlots(props);
        this.pageToolbar?.update({
            name: "text-chrome-top",
            model: this.model,
            borderBottom: true,
            children: this.toolbarContent,
            rightContributions: this.rightContent,
        });
        if (this.footer && this.textHost) {
            this.footer.update({
                host: this.textHost,
                footerContributions: props.footerContributions,
            });
        }
    }

    protected onDispose(): void {
        this.branchActive = false;
        this.clearFocusTimer();
        this.textHost?.setEditorOverlayRef(null);
        this.host = null;
        this.textHost = null;
        this.pageToolbar = undefined;
        this.compareButton = undefined;
        this.runButtons = undefined;
        this.showResourcesButton = undefined;
        this.scriptPanel = undefined;
        this.footer = undefined;
        this.overlay = undefined;
        this.childrenHost = undefined;
        this.toolbarContent = undefined;
        this.rightContent = undefined;
        this.toolbarContributionsHost = undefined;
        this.rightContributionsHost = undefined;
        this.root.replaceChildren();
    }

    private buildBranch(host: IContentHost | null): void {
        if (!host) return;

        this.host = host;
        this.textHost = isTextFileHost(host) ? host : null;
        this.branchActive = true;

        const toolbarContent = createContentsPart("text-toolbar-content");
        const rightContent = createContentsPart("text-toolbar-right");
        const toolbarContributionsHost = createContentsPart("text-toolbar-contributions");
        const rightContributionsHost = createContentsPart("text-toolbar-right-contributions");
        const childrenHost = createContentsPart("text-chrome-children");
        this.toolbarContent = toolbarContent;
        this.rightContent = rightContent;
        this.toolbarContributionsHost = toolbarContributionsHost;
        this.rightContributionsHost = rightContributionsHost;
        this.childrenHost = childrenHost;

        this.pageToolbar = this.child(new PageToolbarView({
            name: "text-chrome-top",
            model: this.model,
            borderBottom: true,
            children: toolbarContent,
            rightContributions: rightContent,
        }));

        if (this.textHost) {
            this.compareButton = this.child(new CompareButtonView({ model: this.model }));
            this.runButtons = this.child(new RunButtonsView({ model: this.model, host: this.textHost }));
            this.showResourcesButton = this.child(new ShowResourcesButtonView({ host: this.textHost }));
            toolbarContent.append(this.compareButton.root, this.runButtons.root, toolbarContributionsHost);
            rightContent.append(this.showResourcesButton.root, rightContributionsHost);

            if (this.textHost.script) {
                this.scriptPanel = this.child(new ScriptPanelView({ model: this.textHost }));
            }
            this.footer = this.child(new ContentHostFooterView({
                host: this.textHost,
                footerContributions: this.props.footerContributions,
            }));
        } else {
            toolbarContent.append(toolbarContributionsHost);
            rightContent.append(rightContributionsHost);
        }

        this.overlay = this.textHost ? document.createElement("div") : undefined;
        if (this.overlay) this.overlay.className = "editor-overlay";

        this.root.append(
            this.pageToolbar.root,
            childrenHost,
            ...(this.scriptPanel ? [this.scriptPanel.root] : []),
            ...(this.footer ? [this.footer.root] : []),
            ...(this.overlay ? [this.overlay] : []),
        );

        if (this.textHost && this.overlay) this.textHost.setEditorOverlayRef(this.overlay);

        this.pageToolbar.mount();
        this.compareButton?.mount();
        this.runButtons?.mount();
        this.showResourcesButton?.mount();
        this.scriptPanel?.mount();
        this.footer?.mount();

        this.childrenCleanup = fillSlot(childrenHost, this.props.children);
        this.toolbarContributionsCleanup = fillSlot(
            toolbarContributionsHost,
            this.props.toolbarContributions,
        );
        this.rightContributionsCleanup = fillSlot(
            rightContributionsHost,
            this.props.rightToolbarContributions,
        );
    }

    private updateSlots(props: TextChromeViewProps): void {
        if (this.childrenHost) this.childrenCleanup = fillSlot(this.childrenHost, props.children);
        if (this.toolbarContributionsHost) {
            this.toolbarContributionsCleanup = fillSlot(
                this.toolbarContributionsHost,
                props.toolbarContributions,
            );
        }
        if (this.rightContributionsHost) {
            this.rightContributionsCleanup = fillSlot(
                this.rightContributionsHost,
                props.rightToolbarContributions,
            );
        }
    }

    private releaseSlotResources(): void {
        this.childrenCleanup?.();
        this.childrenCleanup = undefined;
        this.toolbarContributionsCleanup?.();
        this.toolbarContributionsCleanup = undefined;
        this.rightContributionsCleanup?.();
        this.rightContributionsCleanup = undefined;
    }

    private releaseBranch(): void {
        this.branchActive = false;
        this.clearFocusTimer();
        this.textHost?.setEditorOverlayRef(null);
        this.releaseSlotResources();

        if (this.pageToolbar) {
            this.releaseChild(this.pageToolbar);
            this.pageToolbar = undefined;
        }
        if (this.compareButton) {
            this.releaseChild(this.compareButton);
            this.compareButton = undefined;
        }
        if (this.runButtons) {
            this.releaseChild(this.runButtons);
            this.runButtons = undefined;
        }
        if (this.showResourcesButton) {
            this.releaseChild(this.showResourcesButton);
            this.showResourcesButton = undefined;
        }
        if (this.scriptPanel) {
            this.releaseChild(this.scriptPanel);
            this.scriptPanel = undefined;
        }
        if (this.footer) {
            this.releaseChild(this.footer);
            this.footer = undefined;
        }

        this.root.replaceChildren();
        this.host = null;
        this.textHost = null;
        this.overlay = undefined;
        this.childrenHost = undefined;
        this.toolbarContent = undefined;
        this.rightContent = undefined;
        this.toolbarContributionsHost = undefined;
        this.rightContributionsHost = undefined;
    }

    private clearFocusTimer(): void {
        if (this.focusTimer !== undefined) {
            clearTimeout(this.focusTimer);
            this.focusTimer = undefined;
        }
    }

    private readonly handlePageFocus = (pageModel: PageModel): void => {
        this.clearFocusTimer();
        if (!this.branchActive || pageModel !== this.model.page) return;

        this.focusTimer = setTimeout(() => {
            this.focusTimer = undefined;
            if (!this.branchActive) return;
            if (!this.root.contains(document.activeElement)) this.root.focus();
            this.model.focus();
        }, 200);
    };

    private readonly handleRootKeyDown = (event: KeyboardEvent): void => {
        if (event.code === "F5" && !this.textHost?.script.state.get().open) {
            if (hasScriptRunner(this.model)) {
                event.preventDefault();
                void this.model.runScript();
                return;
            }
        }
        this.host?.handleKeyDown?.(event);
    };
}

// Duck-type against `setEditorOverlayRef` — present on TextFileModel,
// absent on NoteItemEditModel (US-557 inner-note fake host). The original
// discriminator checked `setEditorToolbarRefFirst`, but US-559 ("Strangler-
// fig retirement") removed that method from TextFileModel while leaving
// it on NoteItemEditModel — silently inverting this check. Symptom: the
// footer toolbar, ScriptPanel, run buttons, compare button, and the
// editor-overlay portal all stopped rendering for editors.
function isTextFileHost(host: IContentHost): host is TextFileModel {
    return typeof (host as unknown as { setEditorOverlayRef?: unknown }).setEditorOverlayRef === "function";
}

async function showHtmlResources(host: TextFileModel): Promise<void> {
    const { extractHtmlResources } = await import("../../core/utils/html-resources");
    const { content, filePath, title } = host.state.get();
    const baseUrl = filePath
        ? "file:///" + filePath.replace(/\\/g, "/").replace(/\/[^/]*$/, "/")
        : undefined;
    const links = extractHtmlResources(content, { baseUrl });
    if (links.length === 0) {
        ui.notify("No resources found in this HTML.", "info");
        return;
    }
    pagesModel.openLinks(links, (title || "HTML") + " — Resources");
}
