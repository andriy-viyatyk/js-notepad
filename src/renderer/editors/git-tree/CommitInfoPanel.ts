import { git } from "../../api/git";
import type { GitCommit, GitRef } from "../../../ipc/git-ipc";
import { createPanelElement, applyPanelAttributes, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { GitTreeModel } from "../../components/git-tree/GitTreeModel";
import { REF_COLOR } from "../../components/git-tree/git-ref-color";
import { dateText } from "../../components/git-tree/git-date";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../components/git-tree/GitTree.css";

export interface CommitInfoPanelProps {
    repoRoot: string;
    gitTree: GitTreeModel;
    selectedHash?: string;
}

export class CommitInfoPanelView extends VanillaView<CommitInfoPanelProps> {
    private gitTreeStateUnsubscribe: (() => void) | undefined;
    private boundGitTree: GitTreeModel | undefined;
    private message = "";
    private messageKey: string | undefined;
    private messageGeneration = 0;
    private live = true;

    public constructor(props: CommitInfoPanelProps) {
        super(props, createPanelElement({
            direction: "column",
            flex: 1,
            overflow: "auto",
            padding: "md",
            gap: "sm",
        }));
        this.own(() => {
            this.live = false;
            this.messageGeneration++;
        });
    }

    protected onMount(): void {
        this.own(() => {
            this.gitTreeStateUnsubscribe?.();
            this.gitTreeStateUnsubscribe = undefined;
            this.boundGitTree = undefined;
        });
        this.rebindGitTree(this.props.gitTree);
        this.applyCommit();
    }

    protected onUpdate(props: CommitInfoPanelProps): void {
        if (props.gitTree !== this.boundGitTree) this.rebindGitTree(props.gitTree);
        this.applyCommit();
    }

    private rebindGitTree(source: GitTreeModel): void {
        if (source === this.boundGitTree) return;
        this.gitTreeStateUnsubscribe?.();
        this.gitTreeStateUnsubscribe = undefined;
        this.boundGitTree = source;
        this.gitTreeStateUnsubscribe = this.ownSubscription(source.state.subscribe(
            () => this.onCommitsChanged(source.state.get().commits),
            (state) => state.commits,
        ));
        this.onCommitsChanged(source.state.get().commits);
    }

    private onCommitsChanged(_commits: readonly GitCommit[]): void {
        this.applyCommit();
    }

    private applyCommit(): void {
        const commit = this.currentCommit();
        const key = commit ? `${this.props.repoRoot}\u0000${commit.hash}` : `${this.props.repoRoot}\u0000`;
        if (key !== this.messageKey) {
            this.messageKey = key;
            this.message = "";
            this.messageGeneration++;
            if (commit) this.loadMessage(commit, key, this.messageGeneration);
        }

        if (!commit) {
            applyPanelAttributes(this.root, resolvePanelAttributes({ padding: "md" }));
            this.root.replaceChildren(createTextElement("Select a commit to see its details.", { color: "light" }));
            return;
        }

        applyPanelAttributes(this.root, resolvePanelAttributes({
            direction: "column",
            flex: 1,
            overflow: "auto",
            padding: "md",
            gap: "sm",
        }));
        this.root.replaceChildren(
            this.row("Author", createTextElement(
                commit.authorEmail ? `${commit.authorName} <${commit.authorEmail}>` : commit.authorName,
                { size: "md" },
            )),
            this.row("Date", createTextElement(dateText(commit.authorDate), { size: "md" })),
            this.row("Commit hash", createTextElement(commit.hash, { size: "md" })),
            ...(commit.refs.length > 0 ? [this.refsRow(commit.refs)] : []),
            createPanelElement({ paddingTop: "sm" }, [
                createTextElement(this.message || commit.subject, { size: "md", preWrap: true }),
            ]),
        );
    }

    private loadMessage(commit: GitCommit, key: string, generation: number): void {
        void git.commitMessage(this.props.repoRoot, commit.hash).then((message) => {
            if (!this.live || generation !== this.messageGeneration || key !== this.messageKey) return;
            this.message = message;
            this.applyCommit();
        });
    }

    private currentCommit(): GitCommit | undefined {
        return this.props.gitTree.state.get().commits.find((commit) => commit.hash === this.props.selectedHash);
    }

    private row(label: string, value: Node): HTMLDivElement {
        return createPanelElement({ direction: "row", gap: "sm", align: "baseline" }, [
            createPanelElement({ width: 92, shrink: false }, [createTextElement(label, { color: "light", size: "md" })]),
            createPanelElement({ flex: 1, overflow: "hidden" }, [value]),
        ]);
    }

    private refsRow(refs: GitRef[]): HTMLDivElement {
        const badges = refs.map((refData) => {
            const badge = document.createElement("span");
            badge.className = "git-ref-badge";
            badge.style.color = REF_COLOR[refData.kind];
            badge.textContent = refData.name;
            return badge;
        });
        return this.row("Refs", createPanelElement({ direction: "row", wrap: true }, badges));
    }
}
