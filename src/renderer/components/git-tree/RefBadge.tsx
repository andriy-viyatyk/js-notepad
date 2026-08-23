import type { GitRef } from "../../../ipc/git-ipc";
import { REF_COLOR } from "./git-ref-color";
import "./GitTree.css";

// A decoration-ref chip (branch / tag / HEAD / remote). Shared by the Git Tree
// commit grid (subject column) and the Commit info panel (US-629). Colors picked
// from the shared palette by name (theme-safe, no raw hardcodes): branch = blue,
// remote = lighter blue, tag = pink, HEAD = green.
//
// The chip's *shape* is `.git-ref-badge` in `GitTree.css`, not Emotion, because the grid's subject
// cell is an av-grid `render` string and cannot use Emotion (EPIC-057 / US-1021 D5) — so the chip
// is defined once and both forms stay identical. Only the per-kind text color is inline: these are
// palette hex values, not CSS custom properties, so a stylesheet cannot name them.
export function RefBadge({ refData }: { refData: GitRef }) {
    return (
        <span className="git-ref-badge" style={{ color: REF_COLOR[refData.kind] }}>
            {refData.name}
        </span>
    );
}
