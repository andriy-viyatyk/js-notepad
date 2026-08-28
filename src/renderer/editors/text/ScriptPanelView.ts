import { libraryService } from "../../api/library-service";
import { createPanelElement, applyPanelAttributes, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import type { IconButtonProps } from "../../uikit/IconButton/IconButtonView";
import { SelectView, type SelectViewProps } from "../../uikit/Select/SelectView";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { SplitterView } from "../../uikit/Splitter/SplitterView";
import type { SplitterProps } from "../../uikit/Splitter/SplitterView";
import { VanillaView, type IOwnedView } from "../../uikit/shared/vanilla-view";
import { EditorToolbarView } from "../base/EditorToolbarView";
import { MonacoEditorHostView } from "../shared/MonacoEditorHostView";
import type { TextFileModel } from "./TextEditorModel";
import type { ScriptDropdownEntry, ScriptPanelModel, ScriptPanelState } from "./ScriptPanel";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Splitter/Splitter.css";

export interface ScriptPanelViewProps {
    model: TextFileModel;
}

const UNSAVED_ENTRY: ScriptDropdownEntry = {
    value: "__unsaved__",
    label: "(unsaved script)",
    entry: null,
};

export class ScriptPanelView extends VanillaView<ScriptPanelViewProps> {
    private model: TextFileModel;
    private scriptModel: ScriptPanelModel;

    private branchRoot: HTMLDivElement | undefined;
    private hostPanel: HTMLDivElement | undefined;
    private splitter: SplitterView | undefined;
    private toolbar: EditorToolbarView | undefined;
    private hostView: MonacoEditorHostView | undefined;

    private runButton: IconButtonView | undefined;
    private runAllButton: IconButtonView | undefined;
    private select: SelectView<ScriptDropdownEntry> | undefined;
    private saveButton: IconButtonView | undefined;
    private openTabButton: IconButtonView | undefined;
    private spacer: SpacerView | undefined;
    private closeButton: IconButtonView | undefined;

    private readonly branchViews: IOwnedView[] = [];
    private lastScriptState: ScriptPanelState | undefined;

    public constructor(props: ScriptPanelViewProps) {
        const root = createPanelElement({ direction: "row" });
        root.style.display = "contents";
        super(props, root);
        this.model = props.model;
        this.scriptModel = props.model.script;
    }

    protected onMount(): void {
        libraryService.ensureInitialized();
        this.listen(this.root, "keydown", this.handleKeyDown);
        this.bindModel(this.model);
        this.bind(
            libraryService.state,
            (state) => state.scriptPanelIndex,
            () => this.syncToolbar(),
        );
    }

    protected onUpdate(props: ScriptPanelViewProps): void {
        if (props.model === this.model) return;

        this.releaseOpenBranch();
        this.model = props.model;
        this.scriptModel = props.model.script;
        this.lastScriptState = undefined;
        this.bindModel(this.model);
    }

    protected onDispose(): void {
        this.branchRoot?.remove();
        this.scriptModel.handleEditorWillUnmount();
        this.branchRoot = undefined;
        this.hostPanel = undefined;
        this.splitter = undefined;
        this.toolbar = undefined;
        this.hostView = undefined;
        this.runButton = undefined;
        this.runAllButton = undefined;
        this.select = undefined;
        this.saveButton = undefined;
        this.openTabButton = undefined;
        this.spacer = undefined;
        this.closeButton = undefined;
        this.branchViews.length = 0;
    }

    private bindModel(model: TextFileModel): void {
        this.bind(
            model.script.state,
            (state) => ({
                content: state.content,
                open: state.open,
                height: state.height,
                hasSelection: state.hasSelection,
                selectedScript: state.selectedScript,
                dirty: state.dirty,
            }),
            () => {
                if (this.model === model) this.syncScriptState();
            },
        );
        this.bind(
            model.state,
            (state) => state.language,
            () => {
                if (this.model === model) this.syncToolbar();
            },
        );
    }

    private readonly syncScriptState = (): void => {
        const state = this.scriptModel.state.get();
        const previous = this.lastScriptState;

        if (!state.open) {
            if (this.branchRoot) this.releaseOpenBranch();
            this.lastScriptState = state;
            return;
        }

        if (!this.branchRoot) {
            this.createOpenBranch(state);
            this.lastScriptState = state;
            return;
        }

        if (previous?.height !== state.height) {
            this.updateHeight(state.height);
        }
        if (previous?.content !== state.content && this.hostView?.isReady) {
            this.hostView.setValue(state.content);
        }
        if (
            previous?.hasSelection !== state.hasSelection
            || previous?.selectedScript !== state.selectedScript
            || previous?.dirty !== state.dirty
        ) {
            this.syncToolbar();
        }

        this.lastScriptState = state;
    };

    private createOpenBranch(state: ScriptPanelState): void {
        this.branchRoot = createPanelElement({
            name: "script-panel",
            direction: "column",
            height: state.height,
            overflow: "hidden",
            shrink: false,
        });

        this.splitter = this.registerBranchView(new SplitterView(this.splitterProps(state.height)));
        this.createToolbarChildren(state);
        this.toolbar = this.registerBranchView(new EditorToolbarView({
            children: this.toolbarChildren(),
        }));

        this.hostPanel = createPanelElement({
            name: "script-monaco-host",
            flex: 1,
            minHeight: 0,
        });
        this.hostView = this.registerBranchView(new MonacoEditorHostView({
            initialValue: state.content,
            language: "typescript",
            onMount: (hostView) => {
                this.scriptModel.handleEditorDidMount(hostView.getEditor());
            },
            onChange: (value) => this.scriptModel.handleEditorChange(value),
            options: {
                automaticLayout: true,
            },
        }));

        this.branchRoot.append(
            this.splitter.root,
            this.toolbar.root,
            this.hostPanel,
        );
        this.root.append(this.branchRoot);

        this.splitter.mount();
        this.mountToolbarChildren();
        this.toolbar.mount();
        this.hostPanel.append(this.hostView.root);
        this.hostView.mount();
    }

    private createToolbarChildren(state: ScriptPanelState): void {
        this.runButton = this.registerBranchView(new IconButtonView(this.runButtonProps(state)));
        if (state.hasSelection) {
            this.runAllButton = this.registerBranchView(new IconButtonView(this.runAllButtonProps()));
        }
        this.select = this.registerBranchView(new SelectView<ScriptDropdownEntry>(this.selectProps()));
        this.saveButton = this.registerBranchView(new IconButtonView(this.saveButtonProps(state)));
        this.openTabButton = this.registerBranchView(new IconButtonView(this.openTabButtonProps()));
        this.spacer = this.registerBranchView(new SpacerView({}));
        this.closeButton = this.registerBranchView(new IconButtonView(this.closeButtonProps()));
    }

    private mountToolbarChildren(): void {
        this.runButton?.mount();
        this.runAllButton?.mount();
        this.select?.mount();
        this.saveButton?.mount();
        this.openTabButton?.mount();
        this.spacer?.mount();
        this.closeButton?.mount();
    }

    private readonly syncToolbar = (): void => {
        if (!this.toolbar || !this.branchRoot) return;

        const state = this.scriptModel.state.get();
        let childrenChanged = false;
        if (state.hasSelection && !this.runAllButton) {
            this.runAllButton = this.registerBranchView(new IconButtonView(this.runAllButtonProps()));
            this.runAllButton.mount();
            childrenChanged = true;
        } else if (!state.hasSelection && this.runAllButton) {
            const runAllButton = this.runAllButton;
            this.runAllButton = undefined;
            this.releaseBranchView(runAllButton);
            childrenChanged = true;
        }

        this.runButton?.update(this.runButtonProps(state));
        this.runAllButton?.update(this.runAllButtonProps());
        this.select?.update(this.selectProps());
        this.saveButton?.update(this.saveButtonProps(state));
        this.openTabButton?.update(this.openTabButtonProps());
        this.closeButton?.update(this.closeButtonProps());

        if (childrenChanged) {
            this.toolbar.update({ children: this.toolbarChildren() });
        }
    };

    private toolbarChildren(): DocumentFragment {
        const children = document.createDocumentFragment();
        children.append(
            this.runButton!.root,
            ...(this.runAllButton ? [this.runAllButton.root] : []),
            this.select!.root,
            this.saveButton!.root,
            this.openTabButton!.root,
            this.spacer!.root,
            this.closeButton!.root,
        );
        return children;
    }

    private updateHeight(height: number): void {
        if (!this.branchRoot || !this.splitter) return;
        applyPanelAttributes(this.branchRoot, resolvePanelAttributes({
            name: "script-panel",
            direction: "column",
            height,
            overflow: "hidden",
            shrink: false,
        }));
        this.splitter.update(this.splitterProps(height));
    }

    private splitterProps(height: number): SplitterProps {
        return {
            name: "script-panel-splitter",
            orientation: "horizontal",
            value: height,
            onChange: this.scriptModel.setHeight,
            side: "after",
            min: 60,
        };
    }

    private runButtonProps(state: ScriptPanelState): IconButtonProps {
        return {
            name: "script-run",
            title: state.hasSelection ? "Run Selected Script (F5)" : "Run Script (F5)",
            size: "sm",
            icon: "run",
            onClick: () => this.model.runRelatedScript(),
        };
    }

    private runAllButtonProps(): IconButtonProps {
        return {
            name: "script-run-all",
            size: "sm",
            title: "Run All Script",
            icon: "run-all",
            onClick: () => this.model.runRelatedScript(true),
        };
    }

    private selectProps(): SelectViewProps<ScriptDropdownEntry> {
        const availableScripts = this.scriptModel.getAvailableScripts();
        return {
            name: "script-select",
            items: [UNSAVED_ENTRY, ...availableScripts],
            value: this.scriptModel.getSelectedDropdownEntry(availableScripts) ?? UNSAVED_ENTRY,
            onChange: (item) => this.scriptModel.selectScript(item),
            size: "sm",
            minWidth: 120,
            maxWidth: 200,
        };
    }

    private saveButtonProps(state: ScriptPanelState): IconButtonProps {
        return {
            name: "script-save",
            title: "Save Script to Library",
            size: "sm",
            icon: "save",
            disabled: !state.dirty,
            onClick: () => { void this.scriptModel.saveToLibrary(); },
        };
    }

    private openTabButtonProps(): IconButtonProps {
        return {
            name: "script-open-tab",
            title: "Open in New Tab",
            size: "sm",
            icon: "open-file",
            onClick: () => { void this.scriptModel.openInTab(); },
        };
    }

    private closeButtonProps(): IconButtonProps {
        return {
            name: "script-close",
            title: "Close Script Editor",
            size: "sm",
            icon: "close",
            onClick: this.scriptModel.toggleOpen,
        };
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        this.scriptModel.handleKeyDown(event);
    };

    private registerBranchView<T extends IOwnedView>(view: T): T {
        const registered = this.child(view);
        this.branchViews.push(registered);
        return registered;
    }

    private releaseBranchView(view: IOwnedView): void {
        this.releaseChild(view);
        const index = this.branchViews.indexOf(view);
        if (index !== -1) this.branchViews.splice(index, 1);
    }

    private releaseOpenBranch(): void {
        const hostView = this.hostView;
        if (hostView) {
            this.releaseBranchView(hostView);
            this.hostView = undefined;
        }
        this.scriptModel.handleEditorWillUnmount();

        for (const view of this.branchViews.slice()) {
            this.releaseBranchView(view);
        }
        this.branchRoot?.remove();
        this.branchRoot = undefined;
        this.hostPanel = undefined;
        this.splitter = undefined;
        this.toolbar = undefined;
        this.runButton = undefined;
        this.runAllButton = undefined;
        this.select = undefined;
        this.saveButton = undefined;
        this.openTabButton = undefined;
        this.spacer = undefined;
        this.closeButton = undefined;
    }
}
