import { DiffEditor } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";

import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Splitter } from "../../uikit/Splitter";
import type { MenuItem } from "../../uikit/Menu";
import { FileList, type FileListItem } from "../../components/file-list";
import { GitStatusBadge, type GitTreeModel } from "../../components/git-tree";
import { app } from "../../api/app";
import { git } from "../../api/git";
import { createLinkData } from "../../../shared/link-data";
import { fpExtname, fpJoin } from "../../core/utils/file-path";
import { getLanguageByExtension } from "../../core/utils/language-mapping";
import { CompareIcon } from "../../theme/icons";
import type { GitFileChange } from "../../../ipc/git-ipc";
import type { ILinkDiffRevision } from "../../api/types/io.link-data";
import { TComponentModel, useComponentModel } from "../../core/state/model";

// =============================================================================
// Git Tree "Diff" tab (EPIC-031 / US-630).
//
// For the commit selected in the commit tree: a list of files that commit
// changed (left) + an inline (single-column) Monaco diff of the file selected
// in that list (right). The diff is the file's change introduced by the commit
// — parent[0] (before) → commit (after); the initial commit shows all files as
// additions. Read-only; renames diff the correct old/new blobs.
// =============================================================================

interface CommitDiffPanelProps {
    repoRoot: string;
    gitTree: GitTreeModel;
    selectedHash?: string;
    listWidth: number;
    onListWidthChange: (w: number) => void;
}

interface CommitDiffPanelState {
    changes: GitFileChange[];
    selectedFile: string | undefined;
    diff: { before: string; after: string };
}

const defaultCommitDiffPanelState: CommitDiffPanelState = {
    changes: [],
    selectedFile: undefined,
    diff: { before: "", after: "" },
};

class CommitDiffPanelModel extends TComponentModel<CommitDiffPanelState, CommitDiffPanelProps> {
    setChanges = (changes: GitFileChange[]) => {
        this.state.update((s) => { s.changes = changes; });
    };

    setSelectedFile = (selectedFile: string | undefined) => {
        this.state.update((s) => { s.selectedFile = selectedFile; });
    };

    setDiff = (diff: { before: string; after: string }) => {
        this.state.update((s) => { s.diff = diff; });
    };

    init() {
        this.effect(() => {
            let live = true;
            const commit = this.props.gitTree.state.get().commits.find(
                (item) => item.hash === this.props.selectedHash,
            );
            if (!commit) {
                queueMicrotask(() => {
                    if (!live || !this.isLive) return;
                    this.setChanges([]);
                    this.setSelectedFile(undefined);
                });
                return () => { live = false; };
            }
            void git.commitFiles(this.props.repoRoot, commit.hash).then((files) => {
                if (!live) return;
                this.setChanges(files);
                this.setSelectedFile(files[0]?.path);
            });
            return () => { live = false; };
        }, () => [
            this.props.repoRoot,
            this.props.selectedHash,
            this.props.gitTree.state.get().commits.find(
                (item) => item.hash === this.props.selectedHash,
            )?.hash,
        ]);

        this.effect(() => {
            let live = true;
            const commit = this.props.gitTree.state.get().commits.find(
                (item) => item.hash === this.props.selectedHash,
            );
            const { changes, selectedFile } = this.state.get();
            const change = changes.find((item) => item.path === selectedFile);
            if (!commit || !selectedFile || !change) {
                queueMicrotask(() => {
                    if (live && this.isLive) this.setDiff({ before: "", after: "" });
                });
                return () => { live = false; };
            }
            const parent = commit.parents[0] ?? "";
            const beforePath = change.oldPath ?? selectedFile;
            void Promise.all([
                parent ? git.show(this.props.repoRoot, parent, beforePath) : Promise.resolve(""),
                git.show(this.props.repoRoot, commit.hash, selectedFile),
            ]).then(([before, after]) => {
                if (live) this.setDiff({ before, after });
            });
            return () => { live = false; };
        }, () => [
            this.props.repoRoot,
            this.props.selectedHash,
            this.props.gitTree.state.get().commits.find(
                (item) => item.hash === this.props.selectedHash,
            )?.hash,
            this.state.get().changes,
            this.state.get().selectedFile,
        ]);
    }
}

export function CommitDiffPanel(props: CommitDiffPanelProps) {
    const {
    repoRoot,
    gitTree,
    selectedHash,
    listWidth,
    onListWidthChange,
    } = props;
    const model = useComponentModel(props, CommitDiffPanelModel, defaultCommitDiffPanelState);
    const { changes, selectedFile, diff } = model.state.use();
    const commits = gitTree.state.use((s) => s.commits);
    const commit = commits.find((c) => c.hash === selectedHash);
    const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

    // Reset the diff scroll to the top whenever a new file's diff loads. Monaco
    // reuses the editor instance across files (setValue), which preserves the
    // previous scroll position — so a file scrolled to the bottom would leave
    // the next file scrolled down too. Keyed on `diff` (a fresh object per load)
    // and runs after @monaco-editor/react's child setValue effect (child effects
    // fire before parent effects), so the reset lands on the new content.
    useEffect(() => {
        const ed = diffEditorRef.current;
        if (!ed || !selectedFile) return;
        ed.getOriginalEditor().setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
        ed.getModifiedEditor().setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
    }, [diff, selectedFile]);

    const items = useMemo<FileListItem[]>(
        () => changes.map((c) => ({ filePath: c.path, title: c.path })),
        [changes],
    );
    const changeMap = useMemo(() => {
        const m = new Map<string, GitFileChange>();
        for (const c of changes) m.set(c.path, c);
        return m;
    }, [changes]);
    const getTrailing = useCallback(
        (item: FileListItem): ReactNode => {
            const c = changeMap.get(item.filePath);
            return c ? <GitStatusBadge status={c.status} /> : null;
        },
        [changeMap],
    );
    const onClick = useCallback((item: FileListItem) => model.setSelectedFile(item.filePath), [model]);

    // Right-click → open this file's change in a NEW Persephone tab as a File Diff
    // preselected to "previous commit ↔ this commit" (US-637). Rides the link
    // pipeline (no pageId → new tab; no sourceId → not a sidebar panel). Root
    // commit → empty-hash "from" = empty left side (all additions).
    const openInNewTab = useCallback(
        (change: GitFileChange) => {
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
                createLinkData(fpJoin(repoRoot, change.path), {
                    target: "file-diff",
                    diffFrom,
                    diffTo,
                }),
            );
        },
        [commit, repoRoot],
    );

    const getContextMenu = useCallback(
        (item: FileListItem): MenuItem[] => {
            const change = changeMap.get(item.filePath);
            if (!change || !commit) return [];
            // Right-click selects the file too (so its diff shows on the right and
            // the row highlights), matching a left click.
            model.setSelectedFile(item.filePath);
            return [{
                label: "Open in new Tab",
                icon: <CompareIcon />,
                onClick: () => openInNewTab(change),
            }];
        },
        [changeMap, commit, openInNewTab, model],
    );

    const language = useMemo(() => {
        if (!selectedFile) return undefined;
        const ext = fpExtname(selectedFile);
        return ext ? getLanguageByExtension(ext)?.id : undefined;
    }, [selectedFile]);

    if (!commit) {
        return (
            <Panel padding="md" align="center" justify="center" flex={1}>
                <Text color="light">Select a commit to view its changes.</Text>
            </Panel>
        );
    }

    return (
        <Panel name="commit-diff" direction="row" flex={1} overflow="hidden">
            <Panel
                name="commit-diff-files"
                direction="column"
                width={listWidth}
                shrink={false}
                overflow="hidden"
            >
                <FileList
                    items={items}
                    onClick={onClick}
                    getTrailing={getTrailing}
                    getContextMenu={getContextMenu}
                    selectedPath={selectedFile}
                    compact
                />
            </Panel>
            <Splitter
                name="commit-diff-splitter"
                orientation="vertical"
                value={listWidth}
                onChange={onListWidthChange}
                side="before"
                border="after"
                min={140}
            />
            <Panel name="commit-diff-view" direction="column" flex={1} overflow="hidden">
                {selectedFile ? (
                    <DiffEditor
                        language={language}
                        original={diff.before}
                        modified={diff.after}
                        onMount={(editor) => { diffEditorRef.current = editor; }}
                        options={{
                            readOnly: true,
                            originalEditable: false,
                            renderSideBySide: false,
                            automaticLayout: true,
                        }}
                        theme="custom-dark"
                    />
                ) : (
                    <Panel padding="md" align="center" justify="center" flex={1}>
                        <Text color="light">
                            {changes.length === 0
                                ? "No file changes in this commit."
                                : "Select a file to view its diff."}
                        </Text>
                    </Panel>
                )}
            </Panel>
        </Panel>
    );
}
