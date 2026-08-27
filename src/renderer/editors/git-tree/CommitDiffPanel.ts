import { app } from "../../api/app";
import { git } from "../../api/git";
import { createLinkData } from "../../../shared/link-data";
import { fpExtname, fpJoin } from "../../core/utils/file-path";
import { getLanguageByExtension } from "../../core/utils/language-mapping";
import type { GitCommit, GitFileChange } from "../../../ipc/git-ipc";
import type { ILinkDiffRevision } from "../../api/types/io.link-data";
import type { MenuItem } from "../../uikit/Menu";
import { createComponentModelDriver, type ComponentModelDriver, TComponentModel } from "../../core/state/model";
import { createPanelElement, applyPanelAttributes, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { FileListView } from "../../components/file-list/FileListView";
import type { FileListItem, FileListProps } from "../../components/file-list/FileList";
import type { GitTreeModel } from "../../components/git-tree/GitTreeModel";
import { gitStatusMeta } from "../../components/git-tree/git-status-meta";
import { SplitterView } from "../../uikit/Splitter/SplitterView";
import { MonacoDiffEditorHostView } from "../shared/MonacoDiffEditorHostView";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../components/file-list/FileList.css";
import "../../components/git-tree/GitTree.css";

export interface CommitDiffPanelProps {
    repoRoot: string;
    gitTree: GitTreeModel;
    selectedHash?: string;
    listWidth: number;
    onListWidthChange: (width: number) => void;
}

interface CommitDiffPanelState {
    changes: GitFileChange[];
    selectedFile: string | undefined;
    diff: { before: string; after: string };
}

const defaultState: CommitDiffPanelState = {
    changes: [],
    selectedFile: undefined,
    diff: { before: "", after: "" },
};

class CommitDiffPanelModel extends TComponentModel<CommitDiffPanelState, CommitDiffPanelProps> {
    setFiles = (changes: GitFileChange[]): void => {
        this.state.update((state) => {
            state.changes = changes;
            state.selectedFile = changes[0]?.path;
        });
    };

    setSelectedFile = (selectedFile: string | undefined): void => {
        this.state.update((state) => { state.selectedFile = selectedFile; });
    };

    setDiff = (diff: { before: string; after: string }): void => {
        this.state.update((state) => { state.diff = diff; });
    };
}

type CommitDiffDriver = ComponentModelDriver<CommitDiffPanelState, CommitDiffPanelProps, CommitDiffPanelModel>;

export class CommitDiffPanelView extends VanillaView<CommitDiffPanelProps> {
    private readonly driver: CommitDiffDriver;
    private readonly filePanel: HTMLDivElement;
    private readonly viewPanel: HTMLDivElement;
    private emptyDiffPanel: HTMLDivElement | undefined;
    private fileList: FileListView | undefined;
    private splitter: SplitterView | undefined;
    private diffHost: MonacoDiffEditorHostView | undefined;

    private gitTreeStateUnsubscribe: (() => void) | undefined;
    private boundGitTree: GitTreeModel | undefined;
    private filesKey: string | undefined;
    private filesGeneration = 0;
    private diffKey: string | undefined;
    private diffGeneration = 0;
    private live = true;
    private itemsChanges: GitFileChange[] | undefined;
    private itemsCache: FileListItem[] = [];
    private mapChanges: GitFileChange[] | undefined;
    private changeMap = new Map<string, GitFileChange>();
    private appliedDiff: { before: string; after: string } | undefined;
    private appliedSelectedFile: string | undefined;

    public constructor(props: CommitDiffPanelProps) {
        super(props, createPanelElement({ name: "commit-diff", direction: "row", flex: 1, overflow: "hidden" }));
        this.filePanel = createPanelElement({
            name: "commit-diff-files",
            direction: "column",
            width: props.listWidth,
            shrink: false,
            overflow: "hidden",
        });
        this.viewPanel = createPanelElement({
            name: "commit-diff-view",
            direction: "column",
            flex: 1,
            overflow: "hidden",
        });
        this.driver = createComponentModelDriver(props, CommitDiffPanelModel, defaultState);
        this.own(() => {
            this.live = false;
            this.filesGeneration++;
            this.diffGeneration++;
        });
        this.own(() => this.driver.dispose());
    }

    protected onMount(): void {
        this.driver.mount();
        this.own(() => {
            this.gitTreeStateUnsubscribe?.();
            this.gitTreeStateUnsubscribe = undefined;
            this.boundGitTree = undefined;
        });
        this.rebindGitTree(this.props.gitTree);
        this.bind(this.driver.model.state, (state) => ({
            changes: state.changes,
            selectedFile: state.selectedFile,
            diff: state.diff,
        }), this.applyState);
    }

    protected onUpdate(props: CommitDiffPanelProps): void {
        this.driver.update(props);
        if (props.gitTree !== this.boundGitTree) this.rebindGitTree(props.gitTree);
        this.onCommitsChanged(props.gitTree.state.get().commits);
        this.applyState(this.driver.model.state.get());
    }

    private rebindGitTree(source: GitTreeModel): void {
        if (source === this.boundGitTree) return;
        this.gitTreeStateUnsubscribe?.();
        this.gitTreeStateUnsubscribe = undefined;
        this.boundGitTree = source;
        this.gitTreeStateUnsubscribe = source.state.subscribe(
            () => this.onCommitsChanged(source.state.get().commits),
            (state) => state.commits,
        );
        this.onCommitsChanged(source.state.get().commits);
    }

    private onCommitsChanged(commits: GitCommit[]): void {
        this.loadFiles(commits);
    }

    private loadFiles(commits: GitCommit[]): void {
        const commit = this.currentCommit(commits);
        const key = `${this.props.repoRoot}\u0000${this.props.selectedHash ?? ""}\u0000${commit?.hash ?? ""}`;
        if (key === this.filesKey) return;
        this.filesKey = key;
        const generation = ++this.filesGeneration;
        // A commit/repository change also invalidates an in-flight diff request. The file
        // request will start the replacement diff after its selected path is known.
        this.diffGeneration++;
        this.diffKey = undefined;
        if (!commit) {
            this.driver.model.setFiles([]);
            this.loadDiff();
            return;
        }
        void git.commitFiles(this.props.repoRoot, commit.hash).then((changes) => {
            if (!this.live || generation !== this.filesGeneration || key !== this.filesKey) return;
            this.driver.model.setFiles(changes);
            this.loadDiff();
        });
    }

    private loadDiff(): void {
        const commit = this.currentCommit();
        const { changes, selectedFile } = this.driver.model.state.get();
        const change = changes.find((item) => item.path === selectedFile);
        const key = commit && selectedFile && change
            ? `${this.props.repoRoot}\u0000${commit.hash}\u0000${selectedFile}\u0000${change.oldPath ?? ""}\u0000${change.status}`
            : `${this.props.repoRoot}\u0000`;
        if (key === this.diffKey) return;
        this.diffKey = key;
        const generation = ++this.diffGeneration;
        if (!commit || !selectedFile || !change) {
            this.driver.model.setDiff({ before: "", after: "" });
            return;
        }
        const parent = commit.parents[0] ?? "";
        const beforePath = change.oldPath ?? selectedFile;
        void Promise.all([
            parent ? git.show(this.props.repoRoot, parent, beforePath) : Promise.resolve(""),
            git.show(this.props.repoRoot, commit.hash, selectedFile),
        ]).then(([before, after]) => {
            if (!this.live || generation !== this.diffGeneration || key !== this.diffKey) return;
            this.driver.model.setDiff({ before, after });
        });
    }

    private readonly applyState = (state: CommitDiffPanelState): void => {
        this.changeMapFor(state.changes);
        const commit = this.currentCommit();
        if (!commit) {
            this.releaseCommitSurface();
            applyPanelAttributes(this.root, resolvePanelAttributes({ padding: "md", align: "center", justify: "center", flex: 1 }));
            this.root.replaceChildren(createTextElement("Select a commit to view its changes.", { color: "light" }));
            return;
        }

        applyPanelAttributes(this.root, resolvePanelAttributes({ name: "commit-diff", direction: "row", flex: 1, overflow: "hidden" }));
        this.ensureCommitSurface(state);
        applyPanelAttributes(this.filePanel, resolvePanelAttributes({
            name: "commit-diff-files",
            direction: "column",
            width: this.props.listWidth,
            shrink: false,
            overflow: "hidden",
        }));
        this.fileList?.update(this.fileListProps(state));
        this.ensureDiffHost(state.selectedFile, state.diff);
        if (!this.diffHost || !state.selectedFile) return;
        this.diffHost.setDiffValues(state.diff.before, state.diff.after);
        this.diffHost.setLanguage(this.languageFor(state.selectedFile));
        if (this.appliedDiff !== state.diff || this.appliedSelectedFile !== state.selectedFile) {
            const editor = this.diffHost.getEditor();
            editor.getOriginalEditor().setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
            editor.getModifiedEditor().setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
        }
        this.appliedDiff = state.diff;
        this.appliedSelectedFile = state.selectedFile;
    };

    private ensureCommitSurface(state: CommitDiffPanelState): void {
        if (!this.fileList) {
            this.fileList = this.child(new FileListView(this.fileListProps(state)));
            this.filePanel.append(this.fileList.root);
            this.fileList.mount();
        }
        if (!this.splitter) {
            this.splitter = this.child(new SplitterView({
                name: "commit-diff-splitter",
                orientation: "vertical",
                value: this.props.listWidth,
                onChange: this.props.onListWidthChange,
                side: "before",
                border: "after",
                min: 140,
            }));
            this.root.append(this.filePanel, this.splitter.root, this.viewPanel);
            this.splitter.mount();
        } else if (!this.root.contains(this.filePanel)) {
            this.root.append(this.filePanel, this.splitter.root, this.viewPanel);
        }
        this.splitter.update({
            name: "commit-diff-splitter",
            orientation: "vertical",
            value: this.props.listWidth,
            onChange: this.props.onListWidthChange,
            side: "before",
            border: "after",
            min: 140,
        });
    }

    private ensureDiffHost(selectedFile: string | undefined, diff: { before: string; after: string }): void {
        if (!selectedFile) {
            if (this.diffHost) {
                this.releaseChild(this.diffHost);
                this.diffHost = undefined;
            }
            this.showDiffPlaceholder();
            return;
        }
        if (!this.diffHost) {
            this.diffHost = this.child(new MonacoDiffEditorHostView({
                language: this.languageFor(selectedFile),
                initialOriginal: diff.before,
                initialModified: diff.after,
                options: {
                    readOnly: true,
                    originalEditable: false,
                    renderSideBySide: false,
                    automaticLayout: true,
                },
            }));
            this.viewPanel.replaceChildren(this.diffHost.root);
            this.diffHost.mount();
        } else if (!this.viewPanel.contains(this.diffHost.root)) {
            this.viewPanel.replaceChildren(this.diffHost.root);
        }
    }

    private showDiffPlaceholder(): void {
        if (!this.emptyDiffPanel) {
            this.emptyDiffPanel = createPanelElement({ padding: "md", align: "center", justify: "center", flex: 1 });
        }
        this.emptyDiffPanel.replaceChildren(createTextElement(
            this.driver.model.state.get().changes.length === 0
                ? "No file changes in this commit."
                : "Select a file to view its diff.",
            { color: "light" },
        ));
        this.viewPanel.replaceChildren(this.emptyDiffPanel);
    }

    private releaseCommitSurface(): void {
        if (this.diffHost) {
            this.releaseChild(this.diffHost);
            this.diffHost = undefined;
        }
        if (this.fileList) {
            this.releaseChild(this.fileList);
            this.fileList = undefined;
        }
        if (this.splitter) {
            this.releaseChild(this.splitter);
            this.splitter = undefined;
        }
        this.filePanel.remove();
        this.viewPanel.remove();
        this.emptyDiffPanel = undefined;
        this.appliedDiff = undefined;
        this.appliedSelectedFile = undefined;
    }

    private fileListProps(state: CommitDiffPanelState): FileListProps {
        return {
            items: this.itemsFor(state.changes),
            onClick: this.handleFileClick,
            getTrailing: this.getTrailing,
            getContextMenu: this.getContextMenu,
            selectedPath: state.selectedFile,
            compact: true,
        };
    }

    private itemsFor(changes: GitFileChange[]): FileListItem[] {
        if (changes !== this.itemsChanges) {
            this.itemsChanges = changes;
            this.itemsCache = changes.map((change) => ({ filePath: change.path, title: change.path }));
        }
        return this.itemsCache;
    }

    private changeMapFor(changes: GitFileChange[]): Map<string, GitFileChange> {
        if (changes !== this.mapChanges) {
            this.mapChanges = changes;
            this.changeMap = new Map(changes.map((change) => [change.path, change]));
        }
        return this.changeMap;
    }

    private readonly getTrailing = (item: FileListItem): Node | null => {
        const change = this.changeMap.get(item.filePath);
        if (!change) return null;
        const meta = gitStatusMeta(change.status);
        const badge = document.createElement("span");
        badge.className = "git-status-badge";
        badge.dataset.type = "git-status-badge";
        badge.title = change.status;
        badge.style.color = meta.hex;
        badge.textContent = meta.letter;
        return badge;
    };

    private readonly handleFileClick = (item: FileListItem): void => {
        this.driver.model.setSelectedFile(item.filePath);
        this.loadDiff();
    };

    private readonly getContextMenu = (item: FileListItem): MenuItem[] => {
        const change = this.changeMap.get(item.filePath);
        const commit = this.currentCommit();
        if (!change || !commit) return [];
        this.driver.model.setSelectedFile(item.filePath);
        this.loadDiff();
        return [{
            label: "Open in new Tab",
            icon: "compare",
            onClick: () => this.openInNewTab(change),
        }];
    };

    private readonly openInNewTab = (change: GitFileChange): void => {
        const commit = this.currentCommit();
        if (!commit) return;
        const parent = commit.parents[0] ?? "";
        const diffFrom: ILinkDiffRevision = parent
            ? { kind: "commit", hash: parent, shortHash: parent.slice(0, 7) }
            : { kind: "commit", hash: "", shortHash: "" };
        const diffTo: ILinkDiffRevision = {
            kind: "commit",
            hash: commit.hash,
            shortHash: commit.shortHash,
        };
        void app.events.openRawLink.sendAsync(
            createLinkData(fpJoin(this.props.repoRoot, change.path), {
                target: "file-diff",
                diffFrom,
                diffTo,
            }),
        );
    };

    private languageFor(filePath: string | undefined): string | undefined {
        if (!filePath) return undefined;
        const extension = fpExtname(filePath);
        return extension ? getLanguageByExtension(extension)?.id : undefined;
    }

    private currentCommit(commits = this.props.gitTree.state.get().commits) {
        return commits.find((commit) => commit.hash === this.props.selectedHash);
    }
}
