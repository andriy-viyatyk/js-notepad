import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../ui/secondary-views/SideBarPanelHeaderView";
import { FileDiffEditor, type FileDiffEditorState } from "./FileDiffEditor";
import { GitTreeView } from "../../components/git-tree/GitTreeView";
import type { GitTreeProps, GitTreeSideSelect } from "../../components/git-tree/GitTreeView";
import { syntheticCommitRow, type GitCommitRow } from "../../components/git-tree/swimlane-layout";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../uikit/IconButton/IconButton.css";

const shortHashOf = (hash: string): string => hash.slice(0, 7);

/** Native File History secondary view backed by the shared native Git tree. */
export default class GitDiffRevisionsSecondaryView extends VanillaView<SecondaryViewProps> {
    private model: FileDiffEditor | undefined;
    private header: SideBarPanelHeaderHandle | undefined;
    private refreshButton: IconButtonView | undefined;
    private tree: GitTreeView | undefined;
    private fallbackHost: HTMLDivElement | undefined;
    private treeHost: HTMLDivElement | undefined;
    private leadingRows: GitCommitRow[] = [syntheticCommitRow("unstaged", "Unstaged changes")];
    private sideSelect: GitTreeSideSelect | undefined;

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "git-diff-revisions",
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

        this.fallbackHost = createPanelElement({ padding: "md" }, [
            createTextElement("Git is unavailable.", { color: "light" }),
        ]);
        this.treeHost = createPanelElement({
            direction: "column",
            flex: true,
            height: 0,
            overflow: "hidden",
        });
        this.root.append(this.fallbackHost, this.treeHost);

        this.refreshButton = this.child(new IconButtonView({
            name: "git-diff-revisions-refresh",
            size: "sm",
            title: "Refresh",
            icon: "refresh",
            onClick: (event) => {
                event.stopPropagation();
                model.refreshPanel();
            },
        }));
        this.tree = this.child(new GitTreeView(this.treeProps(model)));
        this.treeHost.append(this.tree.root);
        this.tree.mount();
        this.refreshButton.mount();

        this.header = createSideBarPanelHeader({
            headerHost: this.props.headerHost,
            icon: this.props.iconElement,
            title: "File History",
            actions: this.refreshButton.root,
        });
        this.bind(
            model.state,
            (state) => ({ from: state.from, to: state.to, hasStaged: state.hasStaged }),
            this.applyDiffState,
        );
        this.bind(
            model.fileTree.state,
            (state) => state.gitOk,
            (gitOk) => this.setUnavailable(!gitOk),
        );
        this.own(() => this.header?.dispose());
        this.updateHeader(this.props);
    }

    protected onUpdate(props: SecondaryViewProps): void {
        const model = this.getModel(props);
        if (model) this.model = model;
        this.updateHeader(props);
    }

    protected onDispose(): void {
        this.header = undefined;
        this.refreshButton = undefined;
        this.tree = undefined;
        this.fallbackHost = undefined;
        this.treeHost = undefined;
        this.model = undefined;
    }

    private getModel(props: SecondaryViewProps): FileDiffEditor | undefined {
        return props.model instanceof FileDiffEditor ? props.model : undefined;
    }

    private readonly applyDiffState = (state: Pick<FileDiffEditorState, "from" | "to" | "hasStaged">): void => {
        const model = this.model;
        if (!model) return;
        this.leadingRows = [syntheticCommitRow("unstaged", "Unstaged changes")];
        if (state.hasStaged) this.leadingRows.push(syntheticCommitRow("staged", "Staged changes"));
        this.sideSelect = this.createSideSelect(model, state.from, state.to);
        this.tree?.update(this.treeProps(model));
    };

    private createSideSelect(
        model: FileDiffEditor,
        from: FileDiffEditorState["from"],
        to: FileDiffEditorState["to"],
    ): GitTreeSideSelect {
        return {
            selectionKey:
                `${from.kind}:${from.kind === "commit" ? from.hash : ""}` +
                `|${to.kind}:${to.kind === "commit" ? to.hash : ""}`,
            showLeft: (row) => row.recordType !== "unstaged",
            isLeftActive: (row) => row.recordType === "staged"
                ? from.kind === "staged"
                : row.recordType === "commit"
                  ? from.kind === "commit" && from.hash === row.hash
                  : false,
            isRightActive: (row) => row.recordType === "unstaged"
                ? to.kind === "unstaged"
                : row.recordType === "staged"
                  ? to.kind === "staged"
                  : to.kind === "commit" && to.hash === row.hash,
            onPickLeft: (row) => {
                if (row.recordType === "staged") model.setFrom({ kind: "staged" });
                else if (row.recordType === "commit") {
                    model.setFrom({ kind: "commit", hash: row.hash, shortHash: shortHashOf(row.hash) });
                }
            },
            onPickRight: (row) => {
                if (row.recordType === "unstaged") model.setTo({ kind: "unstaged" });
                else if (row.recordType === "staged") model.setTo({ kind: "staged" });
                else model.setTo({ kind: "commit", hash: row.hash, shortHash: shortHashOf(row.hash) });
            },
        };
    }

    private treeProps(model: FileDiffEditor): GitTreeProps {
        return {
            name: "git-diff-revisions-tree",
            compact: true,
            model: model.fileTree,
            leadingRows: this.leadingRows,
            sideSelect: this.sideSelect,
        };
    }

    private setUnavailable(unavailable: boolean): void {
        if (!this.fallbackHost || !this.treeHost) return;
        this.fallbackHost.hidden = !unavailable;
        this.fallbackHost.style.display = unavailable ? "" : "none";
        this.treeHost.hidden = unavailable;
        this.treeHost.style.display = unavailable ? "none" : "";
    }

    private updateHeader(props: SecondaryViewProps): void {
        this.header?.update({
            headerHost: props.headerHost,
            icon: props.iconElement,
            title: "File History",
            actions: props.expanded === false ? undefined : this.refreshButton?.root,
        });
    }
}
