import { DiffEditor } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Splitter } from "../../uikit/Splitter";
import { FileList, type FileListItem } from "../../components/file-list";
import { GitStatusBadge, type GitTreeModel } from "../../components/git-tree";
import { git } from "../../api/git";
import { fpExtname } from "../../core/utils/file-path";
import { getLanguageByExtension } from "../../core/utils/language-mapping";
import type { GitFileChange } from "../../../ipc/git-ipc";

// =============================================================================
// Git Tree "Diff" tab (EPIC-031 / US-630).
//
// For the commit selected in the commit tree: a list of files that commit
// changed (left) + an inline (single-column) Monaco diff of the file selected
// in that list (right). The diff is the file's change introduced by the commit
// — parent[0] (before) → commit (after); the initial commit shows all files as
// additions. Read-only; renames diff the correct old/new blobs.
// =============================================================================

export function CommitDiffPanel({
    repoRoot,
    gitTree,
    selectedHash,
    listWidth,
    onListWidthChange,
}: {
    repoRoot: string;
    gitTree: GitTreeModel;
    selectedHash?: string;
    listWidth: number;
    onListWidthChange: (w: number) => void;
}) {
    const commits = gitTree.state.use((s) => s.commits);
    const commit = commits.find((c) => c.hash === selectedHash);

    const [changes, setChanges] = useState<GitFileChange[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined);
    const [diff, setDiff] = useState<{ before: string; after: string }>({ before: "", after: "" });
    const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

    // Fetch the changed-file list when the selected commit changes. Reset the
    // file selection to the first file (or none).
    useEffect(() => {
        let live = true;
        if (!commit) {
            setChanges([]);
            setSelectedFile(undefined);
            return;
        }
        void git.commitFiles(repoRoot, commit.hash).then((files) => {
            if (!live) return;
            setChanges(files);
            setSelectedFile(files[0]?.path);
        });
        return () => { live = false; };
        // Keyed on the commit's hash, not the `commit` object — its identity
        // changes on every `commits` rebuild (refresh). Same as CommitInfoPanel.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [repoRoot, commit?.hash]);

    // Resolve before/after blobs when the selected file (or commit) changes.
    // before = parent[0]:oldPath (rename-aware), after = commit:path. `git.show`
    // returns "" when a path is absent at a revision (added → empty before,
    // deleted → empty after, root commit → empty before).
    useEffect(() => {
        let live = true;
        const change = changes.find((c) => c.path === selectedFile);
        if (!commit || !selectedFile || !change) {
            setDiff({ before: "", after: "" });
            return;
        }
        const parent = commit.parents[0] ?? "";
        const beforePath = change.oldPath ?? selectedFile;
        void Promise.all([
            parent ? git.show(repoRoot, parent, beforePath) : Promise.resolve(""),
            git.show(repoRoot, commit.hash, selectedFile),
        ]).then(([before, after]) => {
            if (live) setDiff({ before, after });
        });
        return () => { live = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [repoRoot, commit?.hash, selectedFile, changes]);

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
    const onClick = useCallback((item: FileListItem) => setSelectedFile(item.filePath), []);

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
                <FileList items={items} onClick={onClick} getTrailing={getTrailing} compact />
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
