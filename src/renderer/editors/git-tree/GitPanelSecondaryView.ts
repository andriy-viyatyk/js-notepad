import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../ui/secondary-views/SideBarPanelHeaderView";
import { GitTreeEditorModel } from "./GitTreeEditorModel";
import { GitChangesView } from "./GitChangesView";
import { GitRefsView } from "./GitRefsView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { TagView } from "../../uikit/Tag/TagView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { SegmentedControlView } from "../../uikit/SegmentedControl/SegmentedControlView";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import color from "../../theme/color";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../uikit/Tag/Tag.css";
import "../../uikit/IconButton/IconButton.css";
import "../../uikit/SegmentedControl/SegmentedControl.css";
import "../../uikit/Spacer/Spacer.css";

type GitPanelTab = "changes" | "branches" | "tags";

/** Native Git changes/refs secondary view. */
export default class GitPanelSecondaryView extends VanillaView<SecondaryViewProps> {
    private model: GitTreeEditorModel | undefined;
    private header: SideBarPanelHeaderHandle | undefined;
    private repoBadge: TagView | undefined;
    private titleNode: HTMLSpanElement | undefined;
    private headerActions: HTMLDivElement | undefined;
    private toolbarHost: HTMLDivElement | undefined;
    private refreshButton: IconButtonView | undefined;
    private closeButton: IconButtonView | undefined;
    private sortButton: IconButtonView | undefined;
    private segments: SegmentedControlView | undefined;
    private bodySwap: SubtreeSwap<GitPanelTab> | undefined;
    private tab: GitPanelTab = "changes";
    private alphabetical = false;
    private fileCount = 0;
    private titleCount = 0;
    private repoName = "";
    private repoRoot = "";

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "git-panel",
            direction: "column",
            flex: true,
            overflow: "hidden",
            width: "100%",
        }));
    }

    protected onMount(): void {
        const model = this.getModel(this.props);
        if (!model) return;
        this.model = model;

        const toolbar = createPanelElement({
            name: "git-panel-toolbar",
            direction: "row",
            align: "center",
            paddingX: "xs",
            paddingY: "xs",
            gap: "sm",
            shrink: false,
        });
        this.toolbarHost = toolbar;
        const bodyHost = createPanelElement({
            direction: "column",
            flex: true,
            height: 0,
            overflow: "hidden",
        });
        this.root.append(toolbar, bodyHost);

        this.segments = this.child(new SegmentedControlView({
            name: "git-panel-tabs",
            size: "sm",
            value: this.tab,
            onChange: (value) => model.setGitPanelTab(value as GitPanelTab),
            items: [
                { value: "changes", label: "Changes" },
                { value: "branches", label: "Branches" },
                { value: "tags", label: "Tags" },
            ],
        }));
        const toolbarSpacer = this.child(new SpacerView({}));
        this.sortButton = this.child(new IconButtonView({
            name: "git-branches-sort-alpha",
            size: "sm",
            active: this.alphabetical,
            title: "Sort alphabetically (off - historical)",
            icon: "sort-alpha",
            onClick: (event) => {
                event.stopPropagation();
                model.setBranchesAlphabetical(!this.alphabetical);
            },
        }));
        toolbar.append(this.segments.root, toolbarSpacer.root, this.sortButton.root);

        this.headerActions = createPanelElement({
            name: "git-panel-header-actions",
            direction: "row",
            align: "center",
            gap: "xs",
            shrink: false,
        });
        this.refreshButton = this.child(new IconButtonView({
            name: "git-panel-refresh",
            size: "sm",
            title: "Refresh",
            icon: "refresh",
            onClick: (event) => {
                event.stopPropagation();
                model.refresh();
            },
        }));
        this.closeButton = this.child(new IconButtonView({
            name: "git-panel-close",
            size: "sm",
            title: "Close Git Tree",
            icon: "close",
            onClick: (event) => {
                event.stopPropagation();
                void model.requestClose();
            },
        }));
        this.headerActions.append(this.refreshButton.root, this.closeButton.root);

        this.repoName = model.repoName;
        this.repoRoot = model.state.get().repoRoot;
        this.repoBadge = this.child(new TagView({
            name: "git-panel-repo-name",
            variant: "outlined",
            size: "sm",
            truncate: true,
            label: this.repoName,
            title: this.repoRoot,
        }));
        this.titleNode = this.createTitleElement(0);

        this.header = createSideBarPanelHeader({
            headerRef: this.props.headerRef,
            icon: this.props.iconElement,
            badge: this.repoBadge.root,
            title: this.titleNode,
        });
        this.own(() => this.header?.dispose());

        this.segments.mount();
        toolbarSpacer.mount();
        this.sortButton.mount();
        this.refreshButton.mount();
        this.closeButton.mount();
        this.repoBadge.mount();

        this.bodySwap = new SubtreeSwap(bodyHost);
        this.own(() => this.bodySwap?.dispose());
        if (model.page?.state) {
            this.bind(model.page.state, () => model.isMain, () => this.updateHeader(this.props));
        }
        this.bind(
            model.state,
            (state) => ({
                tab: state.gitPanelTab ?? "changes",
                alphabetical: !!state.branchesAlphabetical,
                repoName: model.repoName,
                repoRoot: state.repoRoot,
            }),
            (state) => {
                this.tab = state.tab;
                this.alphabetical = state.alphabetical;
                this.syncPanel(state.repoName, state.repoRoot);
            },
        );
        this.bind(
            model.changes.state,
            (state) => ({ unstaged: state.unstaged, staged: state.staged }),
            ({ unstaged, staged }) => {
                const paths = new Set<string>();
                for (const change of [...unstaged, ...staged]) paths.add(change.path);
                this.fileCount = paths.size;
                this.updateHeader(this.props);
            },
        );
        this.updateHeader(this.props);
        this.syncPanel(this.repoName, this.repoRoot);
    }

    protected onUpdate(props: SecondaryViewProps): void {
        const model = this.getModel(props);
        if (model) this.model = model;
        this.updateHeader(props);
        this.syncControls();
    }

    protected onDispose(): void {
        this.header = undefined;
        this.repoBadge = undefined;
        this.titleNode = undefined;
        this.headerActions = undefined;
        this.refreshButton = undefined;
        this.closeButton = undefined;
        this.sortButton = undefined;
        this.segments = undefined;
        this.toolbarHost = undefined;
        this.bodySwap = undefined;
        this.model = undefined;
    }

    private getModel(props: SecondaryViewProps): GitTreeEditorModel | undefined {
        return props.model instanceof GitTreeEditorModel ? props.model : undefined;
    }

    private syncPanel(repoName: string, repoRoot: string): void {
        this.syncControls();
        if (repoName !== this.repoName || repoRoot !== this.repoRoot) {
            this.repoName = repoName;
            this.repoRoot = repoRoot;
            this.repoBadge?.update({
                name: "git-panel-repo-name",
                variant: "outlined",
                size: "sm",
                truncate: true,
                label: repoName,
                title: repoRoot,
            });
        }
        this.updateHeader(this.props);
    }

    private syncControls(): void {
        this.segments?.update({
            name: "git-panel-tabs",
            size: "sm",
            value: this.tab,
            onChange: (value) => this.model?.setGitPanelTab(value as GitPanelTab),
            items: [
                { value: "changes", label: "Changes" },
                { value: "branches", label: "Branches" },
                { value: "tags", label: "Tags" },
            ],
        });
        if (this.sortButton) {
            this.sortButton.update({
                name: "git-branches-sort-alpha",
                size: "sm",
                active: this.alphabetical,
                title: this.alphabetical
                    ? "Sort alphabetically (on)"
                    : "Sort alphabetically (off - historical)",
                icon: "sort-alpha",
                onClick: (event) => {
                    event.stopPropagation();
                    this.model?.setBranchesAlphabetical(!this.alphabetical);
                },
            });
        }
        this.syncSortButton();
        this.bodySwap?.set(this.tab, (tab) => {
            const model = this.model;
            if (!model) throw new Error("Git panel model is unavailable.");
            const view = tab === "changes"
                ? new GitChangesView({ model })
                : new GitRefsView({ model, show: tab === "branches" ? "branches" : "tags" });
            view.mount();
            return view;
        });
    }

    private syncSortButton(): void {
        if (!this.sortButton) return;
        const inToolbar = this.sortButton.root.parentNode;
        const shouldShow = this.tab !== "changes";
        if (shouldShow && !inToolbar) {
            this.toolbarHost?.append(this.sortButton.root);
        } else if (!shouldShow && inToolbar) {
            this.sortButton.root.remove();
        }
    }

    private createTitleElement(fileCount: number): HTMLSpanElement {
        const title = createTextElement("Git", {
            color: "inherit",
            size: "md",
            truncate: true,
        });
        if (fileCount > 0) {
            title.append(createTextElement(`(${fileCount})`, {
                color: color.misc.blue,
                size: "md",
            }));
        }
        return title;
    }

    private updateHeader(props: SecondaryViewProps): void {
        const model = this.model;
        if (!model || !this.header || !this.repoBadge || !this.titleNode) return;
        if (this.fileCount !== this.titleCount) {
            this.titleCount = this.fileCount;
            this.titleNode = this.createTitleElement(this.fileCount);
        }
        this.header.update({
            headerRef: props.headerRef,
            icon: props.iconElement,
            badge: this.repoBadge.root,
            title: this.titleNode,
            actions: props.expanded === false ? undefined : this.headerActions,
            showMainTitle: "Show Git Tree",
            showMainActive: model.isMain,
            onShowMain: props.expanded === false ? undefined : this.showMain,
        });
    }

    private readonly showMain = (): void => {
        const model = this.model;
        if (model && !model.isMain) model.showGitTree();
    };
}
