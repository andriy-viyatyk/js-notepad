import type { MenuItem } from "../../uikit/Menu";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { DividerView } from "../../uikit/Divider/DividerView";
import { SegmentedControlView } from "../../uikit/SegmentedControl/SegmentedControlView";
import { SplitButtonView } from "../../uikit/SplitButton/SplitButtonView";
import { SplitterView } from "../../uikit/Splitter/SplitterView";
import { TagView } from "../../uikit/Tag/TagView";
import {
    applyPanelAttributes,
    createPanelElement,
    resolvePanelAttributes,
} from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { PageToolbarView, type PageToolbarViewProps } from "../base/PageToolbarView";
import type { EditorModel } from "../base/EditorModel";
import { GitTreeView } from "../../components/git-tree/GitTreeView";
import type { GitCommitRow } from "../../components/git-tree/swimlane-layout";
import type { GitTreeState } from "../../components/git-tree/GitTreeModel";
import type { GitBranchesState } from "../../components/git-tree/GitBranchesModel";
import { GitTreeEditorModel, type GitTreeEditorState } from "./GitTreeEditorModel";
import { CommitDiffPanelView, type CommitDiffPanelProps } from "./CommitDiffPanel";
import { CommitInfoPanelView, type CommitInfoPanelProps } from "./CommitInfoPanel";
import color from "../../theme/color";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";

const DEFAULT_PANEL_H = 240;
const DEFAULT_DIFF_LIST_W = 240;

interface GitTreeSurfaceState {
    loading: boolean;
    gitOk: boolean;
    hasCommits: boolean;
}

interface BranchToolbarState {
    aheadBehind: GitBranchesState["aheadBehind"];
    pushing: boolean;
    fetching: boolean;
    pulling: boolean;
}

interface AheadBehindSignature {
    ahead: number;
    behind: number;
}

type BodyMessage =
    | { kind: "unavailable"; text: string }
    | { kind: "loading"; text: string };
type BodyMessageSignature = BodyMessage;

function sameAheadBehindSignature(a: AheadBehindSignature | undefined, b: AheadBehindSignature): boolean {
    return !!a && a.ahead === b.ahead && a.behind === b.behind;
}

function bodyMessageSignature(message: BodyMessage): BodyMessageSignature {
    switch (message.kind) {
        case "unavailable": {
            const { kind, text } = message;
            return { kind, text };
        }
        case "loading": {
            const { kind, text } = message;
            return { kind, text };
        }
    }
    const exhaustive: never = message;
    throw new Error(`Unhandled body message kind: ${exhaustive}`);
}

function sameBodyMessage(a: BodyMessageSignature | undefined, b: BodyMessageSignature): boolean {
    if (!a || a.kind !== b.kind) return false;
    switch (a.kind) {
        case "unavailable": return a.text === b.text;
        case "loading": return a.text === b.text;
    }
    const exhaustive: never = a;
    throw new Error(`Unhandled body message signature kind: ${exhaustive}`);
}

interface EditorSurfaceState {
    repoRoot: string;
    columnLayout: GitTreeEditorState["columnLayout"];
    bottomPanelHeight: GitTreeEditorState["bottomPanelHeight"];
    bottomPanelTab: GitTreeEditorState["bottomPanelTab"];
    commitDiffListWidth: GitTreeEditorState["commitDiffListWidth"];
}

const selectEditorSurface = (state: GitTreeEditorState): EditorSurfaceState => ({
    repoRoot: state.repoRoot,
    columnLayout: state.columnLayout,
    bottomPanelHeight: state.bottomPanelHeight,
    bottomPanelTab: state.bottomPanelTab,
    commitDiffListWidth: state.commitDiffListWidth,
});

const selectGitTreeSurface = (state: GitTreeState): GitTreeSurfaceState => ({
    loading: state.loading,
    gitOk: state.gitOk,
    hasCommits: state.commits.length > 0,
});

const selectToolbarState = (state: GitBranchesState): BranchToolbarState => ({
    aheadBehind: state.aheadBehind,
    pushing: state.pushing,
    fetching: state.fetching,
    pulling: state.pulling,
});

function requireGitTreeModel(model: EditorModel): GitTreeEditorModel {
    if (!(model instanceof GitTreeEditorModel)) {
        throw new Error("Git Tree view received an invalid model.");
    }
    return model;
}

export class GitTreeEditorView extends VanillaView<{ model: EditorModel }> {
    private model: GitTreeEditorModel;
    private pageToolbar!: PageToolbarView;
    private refreshButton!: IconButtonView;
    private repoTag!: TagView;
    private pullButton!: SplitButtonView;
    private pushButton!: IconButtonView;
    private toolbarDivider!: DividerView;
    private toolbarGroup!: HTMLDivElement;
    private aheadBehindGroup!: HTMLDivElement;
    private aheadBehindSignature: AheadBehindSignature | undefined;

    private bodyRoot: HTMLDivElement | undefined;
    private bodyMessageSignature: BodyMessageSignature | undefined;
    private gitTreeView: GitTreeView | undefined;
    private bottomSplitter: SplitterView | undefined;
    private bottomPanel: HTMLDivElement | undefined;
    private bottomTabsPanel: HTMLDivElement | undefined;
    private bottomScrollPanel: HTMLDivElement | undefined;
    private bottomTabControl: SegmentedControlView | undefined;
    private activeBottomView: CommitInfoPanelView | CommitDiffPanelView | undefined;
    private activeBottomTab: "commit" | "diff" | undefined;

    private selectedHash: string | undefined;
    private containerHeight = 0;
    private loading = false;
    private gitOk = true;
    private hasCommits = false;
    private repoRoot = "";
    private columnLayout: GitTreeEditorState["columnLayout"];
    private bottomPanelHeight: GitTreeEditorState["bottomPanelHeight"];
    private bottomPanelTab: GitTreeEditorState["bottomPanelTab"];
    private commitDiffListWidth: GitTreeEditorState["commitDiffListWidth"];
    private toolbarState: BranchToolbarState = {
        aheadBehind: { ahead: 0, behind: 0, hasUpstream: false },
        pushing: false,
        fetching: false,
        pulling: false,
    };

    public constructor(props: { model: EditorModel }) {
        super(props, createPanelElement({
            name: "git-tree-editor-root",
            direction: "column",
            flex: 1,
            overflow: "hidden",
            background: "default",
        }));
        this.model = requireGitTreeModel(props.model);
    }

    protected onMount(): void {
        this.toolbarGroup = createPanelElement({ direction: "row", align: "center", gap: "sm" });
        this.aheadBehindGroup = createPanelElement({ direction: "row", gap: "xs", align: "center" });
        this.aheadBehindGroup.hidden = true;

        this.repoTag = this.child(new TagView({
            name: "git-repo-name",
            variant: "outlined",
            size: "sm",
            label: this.model.repoName,
            title: this.model.state.get().repoRoot,
        }));
        this.pullButton = this.child(new SplitButtonView(this.pullProps()));
        this.pushButton = this.child(new IconButtonView(this.pushProps()));
        this.toolbarDivider = this.child(new DividerView({ name: "git-toolbar-divider", orientation: "vertical" }));
        this.refreshButton = this.child(new IconButtonView({
            name: "git-tree-refresh",
            size: "sm",
            title: "Refresh",
            icon: "refresh",
            disabled: this.model.gitTree.state.get().loading,
            onClick: this.model.refresh,
        }));

        this.toolbarGroup.append(
            createTextElement("Repo:", { color: "light", nowrap: true }),
            this.repoTag.root,
            this.aheadBehindGroup,
            this.pullButton.root,
            this.pushButton.root,
            this.toolbarDivider.root,
        );
        this.pageToolbar = this.child(new PageToolbarView(this.pageToolbarProps()));
        this.root.append(this.pageToolbar.root);
        this.pageToolbar.mount();
        this.repoTag.mount();
        this.pullButton.mount();
        this.pushButton.mount();
        this.toolbarDivider.mount();
        this.refreshButton.mount();

        const resizeObserver = new ResizeObserver(([entry]) => {
            this.containerHeight = entry.contentRect.height;
            this.syncLayout();
        });
        resizeObserver.observe(this.root);
        this.own(() => resizeObserver.disconnect());

        this.bind(this.model.state, selectEditorSurface, this.syncEditorState);
        this.bind(this.model.gitTree.state, selectGitTreeSurface, this.syncGitTreeSurface);
        this.bind(this.model.branches.state, selectToolbarState, this.syncToolbarState);
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const nextModel = requireGitTreeModel(props.model);
        if (nextModel !== this.model) {
            throw new Error("Git Tree view model identity cannot change while the view is mounted.");
        }
        this.syncEditorState(selectEditorSurface(this.model.state.get()));
        this.syncGitTreeSurface(selectGitTreeSurface(this.model.gitTree.state.get()));
        this.syncToolbarState(selectToolbarState(this.model.branches.state.get()));
    }

    private pageToolbarProps(): PageToolbarViewProps {
        return {
            name: "git-tree-toolbar",
            model: this.model,
            borderBottom: true,
            children: this.toolbarGroup,
            rightContributions: this.refreshButton.root,
        };
    }

    private syncEditorState = (state: EditorSurfaceState): void => {
        this.repoRoot = state.repoRoot;
        this.columnLayout = state.columnLayout;
        this.bottomPanelHeight = state.bottomPanelHeight;
        this.bottomPanelTab = state.bottomPanelTab;
        this.commitDiffListWidth = state.commitDiffListWidth;
        this.repoTag.update({
            name: "git-repo-name",
            variant: "outlined",
            size: "sm",
            label: this.model.repoName,
            title: state.repoRoot,
        });
        this.pageToolbar.update(this.pageToolbarProps());
        this.syncLayout();
        this.syncBottomView();
    };

    private syncGitTreeSurface = (state: GitTreeSurfaceState): void => {
        this.loading = state.loading;
        this.gitOk = state.gitOk;
        this.hasCommits = state.hasCommits;
        this.refreshButton.update({
            name: "git-tree-refresh",
            size: "sm",
            title: "Refresh",
            icon: "refresh",
            disabled: state.loading,
            onClick: this.model.refresh,
        });
        if (!state.gitOk) {
            this.releaseBottomSurface();
            this.showBodyMessage({
                kind: "unavailable",
                text: "Git is unavailable — check that git is installed and on your PATH, and that Git integration is enabled in Settings.",
            });
            return;
        }
        if (state.loading && !state.hasCommits) {
            this.releaseBottomSurface();
            this.showBodyMessage({ kind: "loading", text: "Loading history…" });
            return;
        }
        this.ensureHistoryBody();
        if (state.hasCommits) this.ensureBottomSurface();
        else this.releaseBottomSurface();
    };

    private syncToolbarState = (state: BranchToolbarState): void => {
        this.toolbarState = state;
        const { ahead, behind } = state.aheadBehind;
        const nextAheadBehindSignature = { ahead, behind };
        if (!sameAheadBehindSignature(this.aheadBehindSignature, nextAheadBehindSignature)) {
            this.aheadBehindSignature = nextAheadBehindSignature;
            this.aheadBehindGroup.replaceChildren();
            if (ahead > 0 || behind > 0) {
                this.aheadBehindGroup.hidden = false;
                if (ahead > 0) {
                    this.aheadBehindGroup.append(createTextElement(`↑${ahead}`, {
                        color: color.text.light,
                        size: "xs",
                    }));
                }
                if (behind > 0) {
                    this.aheadBehindGroup.append(createTextElement(`↓${behind}`, {
                        color: color.warning.text,
                        size: "xs",
                    }));
                }
            } else {
                this.aheadBehindGroup.hidden = true;
            }
        }
        this.pullButton.update(this.pullProps());
        this.pushButton.update(this.pushProps());
        this.pageToolbar.update(this.pageToolbarProps());
    };

    private syncLayout(): void {
        const maxHeight = this.containerHeight > 0 ? Math.round(this.containerHeight * 0.8) : Infinity;
        const panelHeight = Math.min(this.bottomPanelHeight ?? DEFAULT_PANEL_H, maxHeight);
        this.bottomSplitter?.update({
            name: "git-tree-bottom-splitter",
            orientation: "horizontal",
            value: panelHeight,
            onChange: this.model.setBottomPanelHeight,
            side: "after",
            border: "before",
            min: 120,
            max: maxHeight,
        });
        if (this.bottomPanel) {
            applyPanelAttributes(this.bottomPanel, resolvePanelAttributes({
                name: "git-tree-bottom-panel",
                direction: "column",
                shrink: false,
                height: panelHeight,
                minHeight: 120,
                maxHeight,
                overflow: "hidden",
            }));
        }
    }

    private ensureHistoryBody(): void {
        this.bodyMessageSignature = undefined;
        if (this.gitTreeView) {
            this.gitTreeView.update(this.gitTreeProps());
            return;
        }
        this.bodyRoot?.remove();
        this.bodyRoot = createPanelElement({ direction: "column", flex: 1, height: 0 });
        this.gitTreeView = this.child(new GitTreeView(this.gitTreeProps()));
        this.bodyRoot.append(this.gitTreeView.root);
        this.root.append(this.bodyRoot);
        this.gitTreeView.mount();
    }

    private gitTreeProps() {
        return {
            model: this.model.gitTree,
            selectedHash: this.selectedHash,
            onSelectCommit: this.handleSelectCommit,
            initialColumnLayout: this.columnLayout,
            onColumnLayoutChange: this.model.setColumnLayout,
            getContextMenuItems: this.getContextMenuItems,
        };
    }

    private showBodyMessage(message: BodyMessage): void {
        const { kind, text } = message;
        const nextMessageSignature = bodyMessageSignature({ kind, text });
        if (sameBodyMessage(this.bodyMessageSignature, nextMessageSignature)) return;
        this.bodyMessageSignature = nextMessageSignature;
        this.releaseBody();
        this.bodyRoot = createPanelElement({ padding: "xl" }, [
            createTextElement(text, { color: "light" }),
        ]);
        this.root.append(this.bodyRoot);
    }

    private releaseBody(): void {
        if (this.gitTreeView) {
            this.releaseChild(this.gitTreeView);
            this.gitTreeView = undefined;
        }
        this.bodyRoot?.remove();
        this.bodyRoot = undefined;
    }

    private ensureBottomSurface(): void {
        if (!this.bottomPanel || !this.bottomTabsPanel || !this.bottomScrollPanel || !this.bottomTabControl || !this.bottomSplitter) {
            this.bottomSplitter = this.child(new SplitterView({
                name: "git-tree-bottom-splitter",
                orientation: "horizontal",
                value: this.panelHeight(),
                onChange: this.model.setBottomPanelHeight,
                side: "after",
                border: "before",
                min: 120,
                max: this.maxPanelHeight(),
            }));
            this.bottomPanel = createPanelElement({
                name: "git-tree-bottom-panel",
                direction: "column",
                shrink: false,
                height: this.panelHeight(),
                minHeight: 120,
                maxHeight: this.maxPanelHeight(),
                overflow: "hidden",
            });
            this.bottomTabsPanel = createPanelElement({
                name: "git-tree-bottom-tabs",
                direction: "row",
                align: "center",
                paddingX: "sm",
                paddingY: "xs",
                shrink: false,
                background: "dark",
                borderBottom: true,
            });
            this.bottomScrollPanel = createPanelElement({
                direction: "column",
                flex: 1,
                height: 0,
                overflowX: "hidden",
                overflowY: "auto",
            });
            this.bottomTabControl = this.child(new SegmentedControlView(this.bottomTabProps()));
            this.bottomTabsPanel.append(this.bottomTabControl.root);
            this.bottomPanel.append(this.bottomTabsPanel, this.bottomScrollPanel);
            this.root.append(this.bottomSplitter.root, this.bottomPanel);
            this.bottomSplitter.mount();
            this.bottomTabControl.mount();
        }
        this.syncLayout();
        this.syncBottomView();
    }

    private bottomTabProps() {
        return {
            name: "git-tree-bottom-tab-select",
            size: "sm" as const,
            value: this.bottomPanelTab ?? "commit",
            onChange: (value: string) => this.model.setBottomPanelTab(value as "commit" | "diff"),
            items: [
                { value: "commit", label: "Commit" },
                { value: "diff", label: "Diff" },
            ],
        };
    }

    private syncBottomView(): void {
        if (!this.bottomTabControl || !this.bottomScrollPanel || !this.hasCommits || !this.gitOk) return;
        const tab = this.bottomPanelTab ?? "commit";
        this.bottomTabControl.update(this.bottomTabProps());
        if (this.activeBottomView && this.activeBottomTab === tab) {
            if (tab === "commit") {
                (this.activeBottomView as CommitInfoPanelView).update(this.bottomViewProps("commit"));
            } else {
                (this.activeBottomView as CommitDiffPanelView).update(this.bottomViewProps("diff"));
            }
            return;
        }
        if (this.activeBottomView) {
            this.releaseChild(this.activeBottomView);
            this.activeBottomView = undefined;
        }
        const view = tab === "commit"
            ? new CommitInfoPanelView(this.bottomViewProps("commit"))
            : new CommitDiffPanelView(this.bottomViewProps("diff"));
        this.activeBottomView = this.child(view);
        this.activeBottomTab = tab;
        this.bottomScrollPanel.append(view.root);
        view.mount();
    }

    private bottomViewProps(tab: "commit"): CommitInfoPanelProps;
    private bottomViewProps(tab: "diff"): CommitDiffPanelProps;
    private bottomViewProps(tab: "commit" | "diff"): CommitInfoPanelProps | CommitDiffPanelProps {
        if (tab === "commit") {
            return {
                repoRoot: this.repoRoot,
                gitTree: this.model.gitTree,
                selectedHash: this.selectedHash,
            } satisfies CommitInfoPanelProps;
        }
        return {
            repoRoot: this.repoRoot,
            gitTree: this.model.gitTree,
            selectedHash: this.selectedHash,
            listWidth: this.commitDiffListWidth ?? DEFAULT_DIFF_LIST_W,
            onListWidthChange: this.model.setCommitDiffListWidth,
        } satisfies CommitDiffPanelProps;
    }

    private releaseBottomSurface(): void {
        if (this.activeBottomView) {
            this.releaseChild(this.activeBottomView);
            this.activeBottomView = undefined;
        }
        this.activeBottomTab = undefined;
        if (this.bottomTabControl) {
            this.releaseChild(this.bottomTabControl);
            this.bottomTabControl = undefined;
        }
        if (this.bottomSplitter) {
            this.releaseChild(this.bottomSplitter);
            this.bottomSplitter = undefined;
        }
        this.bottomTabsPanel?.remove();
        this.bottomScrollPanel?.remove();
        this.bottomPanel?.remove();
        this.bottomTabsPanel = undefined;
        this.bottomScrollPanel = undefined;
        this.bottomPanel = undefined;
    }

    private panelHeight(): number {
        return Math.min(this.bottomPanelHeight ?? DEFAULT_PANEL_H, this.maxPanelHeight());
    }

    private maxPanelHeight(): number {
        return this.containerHeight > 0 ? Math.round(this.containerHeight * 0.8) : Infinity;
    }

    private readonly handleSelectCommit = (hash: string): void => {
        this.selectedHash = hash;
        if (this.activeBottomView && this.activeBottomTab === "commit") {
            (this.activeBottomView as CommitInfoPanelView).update(this.bottomViewProps("commit"));
        } else if (this.activeBottomView) {
            (this.activeBottomView as CommitDiffPanelView).update(this.bottomViewProps("diff"));
        }
    };

    private pullProps(): ConstructorParameters<typeof SplitButtonView>[0] {
        const { aheadBehind, pulling, fetching } = this.toolbarState;
        return {
            name: "git-tree-pull",
            size: "sm" as const,
            icon: "download" as const,
            title: !aheadBehind.hasUpstream
                ? "Pull (no upstream configured)"
                : aheadBehind.behind > 0
                    ? `Pull ${aheadBehind.behind} commit(s) — merge`
                    : "Pull — merge (up to date)",
            disabled: pulling || fetching || !aheadBehind.hasUpstream,
            menuDisabled: pulling || fetching,
            onClick: () => void this.model.pull(),
            items: [
                {
                    label: "Pull (merge)",
                    icon: "download",
                    disabled: !aheadBehind.hasUpstream,
                    onClick: () => void this.model.pull(),
                },
                {
                    label: "Fetch all",
                    startGroup: true,
                    onClick: () => void this.model.fetch(),
                },
            ] satisfies MenuItem[],
        };
    }

    private pushProps(): IconButtonViewProps {
        const { aheadBehind, pushing } = this.toolbarState;
        return {
            name: "git-tree-push",
            size: "sm" as const,
            title: !aheadBehind.hasUpstream
                ? "Push (set upstream)"
                : aheadBehind.ahead > 0
                    ? `Push ${aheadBehind.ahead} commit(s)`
                    : "Nothing to push",
            icon: "upload" as const,
            disabled: pushing || (aheadBehind.hasUpstream && aheadBehind.ahead === 0),
            onClick: () => void this.model.push(),
        };
    }

    private readonly getContextMenuItems = (rows: GitCommitRow[]): MenuItem[] => {
        const row = rows[0];
        if (!row || row.recordType !== "commit") return [];
        const multi = rows.length > 1;
        const items: MenuItem[] = [];
        let hasLocalBranch = false;
        for (const ref of row.refs) {
            if (ref.kind === "head") {
                hasLocalBranch = true;
                items.push({ label: `Switch to Branch '${ref.name}' (current)`, icon: "git", disabled: true });
            } else if (ref.kind === "branch") {
                hasLocalBranch = true;
                items.push({
                    label: `Switch to Branch '${ref.name}'`,
                    icon: "git",
                    disabled: multi,
                    onClick: () => void this.model.switchTo({ type: "branch", name: ref.name }),
                });
            }
        }
        for (const ref of row.refs) {
            if (ref.kind === "remote") {
                items.push({
                    label: `Switch to Remote Branch '${ref.name}'`,
                    icon: "globe",
                    disabled: multi,
                    onClick: () => void this.model.switchTo({ type: "remote", ref: ref.name }),
                });
            }
        }
        if (!hasLocalBranch) {
            items.push({
                label: `Switch to Commit ${row.shortHash}`,
                icon: "git",
                startGroup: items.length > 0,
                disabled: multi,
                onClick: () => void this.model.switchTo({ type: "commit", hash: row.hash }),
            });
        }
        items.push({
            label: "Create branch here…",
            icon: "git",
            startGroup: items.length > 0,
            disabled: multi,
            onClick: () => void this.model.createBranchAt(row.hash, row.shortHash),
        });
        return items;
    };
}
