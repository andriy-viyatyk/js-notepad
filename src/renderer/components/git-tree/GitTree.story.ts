import { applyPanelAttributes, createPanelElement, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { GitTreeView } from "./GitTreeView";
import { GitTreeModel } from "./GitTreeModel";
import type { GitTreeProps, GitTreeSideSelect } from "./GitTreeView";
import type { GitCommitRow } from "./swimlane-layout";
import type { GitCommit } from "../../../ipc/git-ipc";
import type { Story } from "../../editors/storybook/storyTypes";

const h = (n: string) => `${n}${"0".repeat(40 - n.length)}`;
const t = (day: number) => Date.UTC(2026, 4, day, 12, 0, 0);

const DEMO_COMMITS: GitCommit[] = [
    { hash: h("A"), shortHash: "Aaaaaaa", parents: [h("B"), h("E")], subject: "Merge feature into main", authorName: "Ada",  authorEmail: "ada@example.com", authorDate: t(20), refs: [{ name: "main", kind: "head" }, { name: "origin/main", kind: "remote" }] },
    { hash: h("B"), shortHash: "Bbbbbbb", parents: [h("C")],         subject: "Update README",            authorName: "Lin",  authorEmail: "lin@example.com", authorDate: t(19), refs: [] },
    { hash: h("C"), shortHash: "Ccccccc", parents: [h("D"), h("E"), h("F")], subject: "Octopus merge of work, feature, hotfix", authorName: "Ada",  authorEmail: "ada@example.com", authorDate: t(18), refs: [] },
    { hash: h("D"), shortHash: "Ddddddd", parents: [h("G")],         subject: "Main line work",            authorName: "Lin",  authorEmail: "lin@example.com", authorDate: t(17), refs: [] },
    { hash: h("E"), shortHash: "Eeeeeee", parents: [h("G")],         subject: "Feature: add X",             authorName: "Sam",  authorEmail: "sam@example.com", authorDate: t(16), refs: [{ name: "feature", kind: "branch" }] },
    { hash: h("F"), shortHash: "Fffffff", parents: [h("G")],         subject: "Hotfix: patch crash",        authorName: "Ada",  authorEmail: "ada@example.com", authorDate: t(15), refs: [{ name: "v1.0", kind: "tag" }] },
    { hash: h("G"), shortHash: "Ggggggg", parents: [h("H")],         subject: "Shared base",                authorName: "Lin",  authorEmail: "lin@example.com", authorDate: t(14), refs: [] },
    { hash: h("H"), shortHash: "Hhhhhhh", parents: [h("I")],         subject: "Project scaffolding",        authorName: "Sam",  authorEmail: "sam@example.com", authorDate: t(13), refs: [] },
    { hash: h("I"), shortHash: "Iiiiiii", parents: [],               subject: "Initial commit",             authorName: "Ada",  authorEmail: "ada@example.com", authorDate: t(12), refs: [{ name: "v0.1", kind: "tag" }] },
];

interface GitTreeDemoProps {
    compact?: boolean;
    sideSelect?: boolean;
}

class GitTreeDemoView extends VanillaView<GitTreeDemoProps> {
    private readonly model: GitTreeModel;
    private selected: string | undefined;
    private from = h("E");
    private to = h("A");
    private treeView: GitTreeView | undefined;

    public constructor(props: GitTreeDemoProps) {
        super(props, createPanelElement({ direction: "column", width: props.compact ? 460 : 760, height: 320 }));
        this.model = new GitTreeModel();
        this.model.state.update((state) => { state.commits = DEMO_COMMITS; });
        this.own(() => this.model.dispose());
    }

    protected onMount(): void {
        const innerPanel = createPanelElement({ direction: "column", flex: 1, height: 0 });
        const tree = this.child(new GitTreeView(this.treeProps(this.props)));
        this.treeView = tree;
        innerPanel.append(tree.root);
        this.root.append(innerPanel);
        tree.mount();
    }

    protected onUpdate(props: GitTreeDemoProps): void {
        applyPanelAttributes(
            this.root,
            resolvePanelAttributes({ direction: "column", width: props.compact ? 460 : 760, height: 320 }),
        );
        this.treeView?.update(this.treeProps(props));
    }

    private readonly onSelectCommit = (hash: string): void => {
        this.selected = hash;
        this.treeView?.update(this.treeProps(this.props));
    };

    private readonly onPickLeft = (row: GitCommitRow): void => {
        this.from = row.hash;
        this.treeView?.update(this.treeProps(this.props));
    };

    private readonly onPickRight = (row: GitCommitRow): void => {
        this.to = row.hash;
        this.treeView?.update(this.treeProps(this.props));
    };

    private treeProps(props: GitTreeDemoProps): GitTreeProps {
        return {
            model: this.model,
            selectedHash: this.selected,
            onSelectCommit: this.onSelectCommit,
            compact: props.compact ?? false,
            sideSelect: this.sideSelect(props.sideSelect ?? false),
        };
    }

    private sideSelect(enabled: boolean): GitTreeSideSelect | undefined {
        if (!enabled) return undefined;
        return {
            selectionKey: `${this.from}|${this.to}`,
            showLeft: () => true,
            isLeftActive: (row) => row.hash === this.from,
            isRightActive: (row) => row.hash === this.to,
            onPickLeft: this.onPickLeft,
            onPickRight: this.onPickRight,
        };
    }

    protected onDispose(): void {
        this.treeView = undefined;
    }
}

export const gitTreeStory: Story<GitTreeDemoProps> = {
    id: "git-tree",
    name: "GitTree",
    section: "Git",
    view: GitTreeDemoView,
    props: [
        { name: "compact", type: "boolean", default: false },
        // The L/R column only exists in the compact layout — turn both on together.
        { name: "sideSelect", type: "boolean", default: false },
    ],
};
