import { useRef, useState } from "react";

import { Popover } from "../../uikit/Popover";
import { Panel } from "../../uikit/Panel";
import { Button } from "../../uikit/Button";
import { Text } from "../../uikit/Text";
import { Divider } from "../../uikit/Divider";
import { GitTree, type GitTreeModel } from "../../components/git-tree";
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

// Quick (non-commit) endpoints. `to` may compare against the working tree;
// `from` (left/original) never does. "HEAD" is intentionally absent — the
// latest committed version is reached by picking the top commit in the grid
// (the editor defaults the base to it).
const ENDPOINTS: Record<"from" | "to", { kind: Exclude<RevSel["kind"], "commit">; label: string }[]> = {
    to: [
        { kind: "unstaged", label: "Unstaged" },
        { kind: "staged", label: "Staged" },
    ],
    from: [
        { kind: "staged", label: "Staged" },
    ],
};

export function RevisionPicker({ side, picker, value, showStaged, onPick }: RevisionPickerProps) {
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);

    const endpoints = ENDPOINTS[side].filter((ep) => ep.kind !== "staged" || showStaged);

    const toggle = () => {
        setOpen((o) => !o);
        void picker.ensureLoaded(); // lazy first fetch
    };

    const pickEndpoint = (kind: Exclude<RevSel["kind"], "commit">) => {
        onPick({ kind } as RevSel);
        setOpen(false);
    };

    const pickCommit = (hash: string) => {
        onPick({ kind: "commit", hash, shortHash: hash.slice(0, 7) });
        setOpen(false);
    };

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
                    {endpoints.length > 0 && (
                        <>
                            {endpoints.map((ep) => (
                                <Button
                                    key={ep.kind}
                                    block
                                    size="sm"
                                    variant={value.kind === ep.kind ? "primary" : "ghost"}
                                    onClick={() => pickEndpoint(ep.kind)}
                                >
                                    <Panel flex={1} justify="start">
                                        <Text>{ep.label}</Text>
                                    </Panel>
                                </Button>
                            ))}
                            <Divider />
                        </>
                    )}
                    <Text size="sm" color="light">Compare with a commit</Text>
                    {/* Fixed-height column-flex ancestor + the `flex={1} height={0}`
                        filler — the proven structure for RenderGrid (flex:1 1 auto
                        with a 100px fallback) to fill instead of staying 100px. */}
                    <Panel direction="column" height={280}>
                        <Panel direction="column" flex={1} height={0}>
                            <GitTree
                                model={picker}
                                compact
                                selectedHash={value.kind === "commit" ? value.hash : undefined}
                                onSelectCommit={pickCommit}
                            />
                        </Panel>
                    </Panel>
                </Panel>
            </Popover>
        </>
    );
}
