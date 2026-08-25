import { buildRefsTree, BRANCHES_ROOT_VALUE, TAGS_ROOT_VALUE, REF_COLOR } from "../../components/git-tree";
import type { GitRefNode } from "../../components/git-tree/git-refs-tree";
import type { GitBranchesState } from "../../components/git-tree/GitBranchesModel";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { TreeView } from "../../uikit/Tree/TreeView";
import type { TreeProps } from "../../uikit/Tree/types";
import type { MenuItem } from "../../uikit/Menu";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { GitTreeEditorModel } from "./GitTreeEditorModel";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../uikit/Tree/Tree.css";

const ICON_SIZE = 14;

export interface GitRefsViewProps {
    model: GitTreeEditorModel;
    show: "branches" | "tags";
}

/** Native branches/tags tree body for the merged Git secondary view. */
export class GitRefsView extends VanillaView<GitRefsViewProps> {
    private model: GitTreeEditorModel;
    private show: GitRefsViewProps["show"];
    private tree: TreeView<GitRefNode> | undefined;
    private unavailableHost: HTMLDivElement | undefined;
    private treeHost: HTMLDivElement | undefined;
    private refs: GitBranchesState["refs"];
    private gitOk: boolean;
    private expanded: Record<string, boolean> | undefined;
    private alphabetical: boolean;
    private currentBranch: string | undefined;
    private activeIndex: number | null = null;
    private items: GitRefNode[] = [];
    private lastProjection: {
        refs: GitBranchesState["refs"];
        alphabetical: boolean;
        currentBranch: string | undefined;
        show: GitRefsViewProps["show"];
    } | undefined;

    public constructor(props: GitRefsViewProps) {
        super(props, createPanelElement({
            direction: "column",
            flex: true,
            height: 0,
            overflow: "hidden",
        }));
        this.model = props.model;
        this.show = props.show;
        const branchState = props.model.branches.state.get();
        const editorState = props.model.state.get();
        this.refs = branchState.refs;
        this.gitOk = branchState.gitOk;
        this.expanded = editorState.branchesExpanded;
        this.alphabetical = !!editorState.branchesAlphabetical;
        this.currentBranch = this.refs.current;
    }

    protected onMount(): void {
        this.unavailableHost = createPanelElement({ padding: "md" }, [
            createTextElement("Git is unavailable.", { color: "light" }),
        ]);
        this.treeHost = createPanelElement({
            direction: "column",
            flex: true,
            height: 0,
            overflow: "hidden",
        });
        this.root.append(this.unavailableHost, this.treeHost);

        this.items = this.buildTreeItems();
        this.tree = this.child(new TreeView<GitRefNode>(this.treeProps()));
        this.treeHost.append(this.tree.root);
        this.tree.mount();
        this.bind(
            this.model.branches.state,
            (state) => ({ refs: state.refs, gitOk: state.gitOk }),
            (state) => {
                this.refs = state.refs;
                this.gitOk = state.gitOk;
                this.currentBranch = state.refs.current;
                this.updateTree();
            },
        );
        this.bind(
            this.model.state,
            (state) => ({
                expanded: state.branchesExpanded,
                alphabetical: !!state.branchesAlphabetical,
            }),
            (state) => {
                this.expanded = state.expanded;
                this.alphabetical = state.alphabetical;
                this.updateTree();
            },
        );
        this.setUnavailable(!this.gitOk);
    }

    protected onUpdate(props: GitRefsViewProps): void {
        this.model = props.model;
        this.show = props.show;
        this.updateTree();
    }

    protected onDispose(): void {
        this.tree = undefined;
        this.unavailableHost = undefined;
        this.treeHost = undefined;
    }

    private updateTree(): void {
        const projectionChanged = !this.lastProjection
            || this.lastProjection.refs !== this.refs
            || this.lastProjection.alphabetical !== this.alphabetical
            || this.lastProjection.currentBranch !== this.currentBranch
            || this.lastProjection.show !== this.show;
        if (projectionChanged) {
            this.items = this.buildTreeItems();
            this.lastProjection = {
                refs: this.refs,
                alphabetical: this.alphabetical,
                currentBranch: this.currentBranch,
                show: this.show,
            };
        }
        this.tree?.update(this.treeProps());
        this.setUnavailable(!this.gitOk);
    }

    private setUnavailable(unavailable: boolean): void {
        if (!this.unavailableHost || !this.treeHost) return;
        this.unavailableHost.hidden = !unavailable;
        this.unavailableHost.style.display = unavailable ? "" : "none";
        this.treeHost.hidden = unavailable;
        this.treeHost.style.display = unavailable ? "none" : "";
    }

    private buildTreeItems(): GitRefNode[] {
        const roots = buildRefsTree(this.refs, this.alphabetical);
        const subset = this.show === "branches"
            ? roots.filter((root) => root.value !== TAGS_ROOT_VALUE)
            : roots.find((root) => root.value === TAGS_ROOT_VALUE)?.items ?? [];
        return this.decorateNodes(subset, this.currentValue());
    }

    private currentValue(): string | undefined {
        return this.currentBranch ? `local:${this.currentBranch}` : undefined;
    }

    private decorateNodes(nodes: GitRefNode[], currentValue: string | undefined): GitRefNode[] {
        for (const node of nodes) {
            if (currentValue && node.value === currentValue) {
                const label = typeof node.label === "string" ? node.label : "";
                node.label = createTextElement(label, {
                    color: REF_COLOR.head,
                    size: "base",
                });
            }
            if (node.items?.length) this.decorateNodes(node.items, currentValue);
        }
        return nodes;
    }

    private treeProps(): TreeProps<GitRefNode> {
        return {
            name: this.show === "branches" ? "git-branches-tree" : "git-tags-tree",
            items: this.items,
            getChildren: (node) => node.items,
            getIconElement: (node) => this.getIconElement(node),
            onChange: this.onSelect,
            getContextMenu: this.getContextMenu,
            getTooltip: (node) => node.refName ?? null,
            defaultExpandedValues: this.expanded ?? { [BRANCHES_ROOT_VALUE]: true },
            onExpandChange: this.onExpandChange,
            activeIndex: this.activeIndex,
            onActiveChange: (index) => {
                this.activeIndex = index;
                this.tree?.update(this.treeProps());
            },
            emptyMessage: this.show === "branches" ? "No branches" : "No tags",
        };
    }

    private getIconElement(node: GitRefNode): Node | undefined {
        if (node.value === this.currentValue()) {
            return createIconElement("git", {
                width: ICON_SIZE,
                height: ICON_SIZE,
                color: REF_COLOR.head,
            });
        }
        if (node.kind === "tag") {
            return createIconElement("tag", {
                width: ICON_SIZE,
                height: ICON_SIZE,
                color: REF_COLOR.tag,
            });
        }
        if (node.kind === "branch") {
            return createIconElement("git", {
                width: ICON_SIZE,
                height: ICON_SIZE,
                color: REF_COLOR.branch,
            });
        }
        if (node.kind === "remote-branch") {
            return createIconElement("git", {
                width: ICON_SIZE,
                height: ICON_SIZE,
                color: REF_COLOR.remote,
            });
        }
        if (node.value.startsWith("remote:")) return createIconElement("globe");
        if (node.value.startsWith("localdir:") || node.value.startsWith("remotedir:")) {
            return createIconElement("folder-open");
        }
        return undefined;
    }

    private readonly onSelect = (node: GitRefNode): void => {
        if (node.kind) this.model.revealRef(node.refName, node.kind);
    };

    private readonly getContextMenu = (node: GitRefNode): MenuItem[] | undefined => {
        const { kind, refName } = node;
        if (kind === "branch" && refName) {
            const isCurrent = refName === this.currentBranch;
            return [{
                label: `Switch to Branch '${refName}'${isCurrent ? " (current)" : ""}`,
                icon: createIconElement("git", { width: ICON_SIZE, height: ICON_SIZE }),
                disabled: isCurrent,
                onClick: () => void this.model.switchTo({ type: "branch", name: refName }),
            }];
        }
        if (kind === "remote-branch" && refName) {
            return [{
                label: `Switch to Remote Branch '${refName}'`,
                icon: createIconElement("globe", { width: ICON_SIZE, height: ICON_SIZE }),
                onClick: () => void this.model.switchTo({ type: "remote", ref: refName }),
            }];
        }
        if (kind === "tag" && refName) {
            return [{
                label: `Switch to Tag '${refName}' Commit`,
                icon: createIconElement("tag", { width: ICON_SIZE, height: ICON_SIZE }),
                onClick: () => void this.model.switchTo({ type: "tag", name: refName }),
            }];
        }
        return undefined;
    };

    private readonly onExpandChange = (value: string | number, isExpanded: boolean): void => {
        const next = {
            ...(this.model.state.get().branchesExpanded ?? { [BRANCHES_ROOT_VALUE]: true }),
        };
        next[String(value)] = isExpanded;
        this.model.setBranchesExpanded(next);
    };
}
