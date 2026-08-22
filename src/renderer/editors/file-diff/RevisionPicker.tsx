import { useCallback, useMemo, useRef, useState } from "react";

import { Popover } from "../../uikit/Popover";
import { Panel } from "../../uikit/Panel";
import { Button } from "../../uikit/Button";
import {
    GitTree,
    syntheticCommitRow,
    type GitCommitRow,
    type GitTreeModel,
} from "../../components/git-tree";
import type { RevSel } from "./FileDiffEditor";

interface RevisionPickerProps {
    /** Which diff side this picker controls. `from` (left) omits the "Unstaged" option. */
    side: "from" | "to";
    /** The editor-owned, file-scoped commit-list model for this side. */
    picker: GitTreeModel;
    /** Current selection (drives the button label + commit highlight). */
    value: RevSel;
    /** Whether to offer the "Staged" option (hidden when the file has no staged changes). */
    showStaged: boolean;
    onPick: (sel: RevSel) => void;
}

function labelFor(sel: RevSel): string {
    switch (sel.kind) {
        case "unstaged": return "Unstaged";
        case "staged": return "Staged";
        case "head": return "HEAD";
        case "commit": return sel.shortHash;
    }
}

export function RevisionPicker({ side, picker, value, showStaged, onPick }: RevisionPickerProps) {
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);

    // Quick (non-commit) endpoints, combined INTO the commit grid as synthetic
    // leading rows (US-625) — the same inline treatment as the "File History"
    // panel (US-618), instead of separate buttons above the table. `to` may
    // compare against the working tree (Unstaged); `from` (left/original) never
    // does. "HEAD" is intentionally absent — the latest committed version is
    // reached by picking the top commit (the editor defaults the base to it).
    // Staged is offered on both sides only when the file has staged changes.
    const leadingRows = useMemo<GitCommitRow[]>(() => {
        const rows: GitCommitRow[] = [];
        if (side === "to") rows.push(syntheticCommitRow("unstaged", "Unstaged changes"));
        if (showStaged) rows.push(syntheticCommitRow("staged", "Staged changes"));
        return rows;
    }, [side, showStaged]);

    // Highlight the row holding the current selection: the commit hash for a
    // commit, otherwise the matching synthetic row's sentinel hash (derived from
    // `leadingRows` so the sentinel format stays owned by `syntheticCommitRow`).
    const selectedHash = useMemo(() => {
        if (value.kind === "commit") return value.hash;
        return leadingRows.find((r) => r.recordType === value.kind)?.hash;
    }, [value, leadingRows]);

    const toggle = () => {
        setOpen((o) => !o);
        void picker.ensureLoaded(); // lazy first fetch
    };

    // A click resolves to the synthetic endpoint when it lands on a leading row,
    // otherwise to a commit (shorthash = first 7 chars, matching the panel).
    // Memoized so the av-grid-backed `<GitTree>` keeps a stable `onSelectCommit`.
    const pick = useCallback(
        (hash: string) => {
            const lead = leadingRows.find((r) => r.hash === hash);
            if (lead) onPick({ kind: lead.recordType } as RevSel);
            else onPick({ kind: "commit", hash, shortHash: hash.slice(0, 7) });
            setOpen(false);
        },
        [leadingRows, onPick],
    );

    return (
        <>
            <Button
                ref={anchorRef}
                name={`file-diff-picker-${side}`}
                size="sm"
                variant="ghost"
                onClick={toggle}
            >
                {labelFor(value)}
            </Button>
            <Popover
                name={`file-diff-picker-${side}-popover`}
                open={open}
                elementRef={anchorRef.current}
                onClose={() => setOpen(false)}
                placement="bottom-start"
            >
                <Panel direction="column" gap="xs" padding="xs" width={460}>
                    {/* Fixed-height column-flex ancestor + the `flex={1} height={0}`
                        filler — the proven structure for RenderGrid (flex:1 1 auto
                        with a 100px fallback) to fill instead of staying 100px. */}
                    <Panel direction="column" height={280}>
                        <Panel direction="column" flex={1} height={0}>
                            <GitTree
                                model={picker}
                                compact
                                leadingRows={leadingRows}
                                selectedHash={selectedHash}
                                onSelectCommit={pick}
                            />
                        </Panel>
                    </Panel>
                </Panel>
            </Popover>
        </>
    );
}
