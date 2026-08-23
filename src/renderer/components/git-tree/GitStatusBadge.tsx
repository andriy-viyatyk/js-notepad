import { gitStatusMeta } from "./git-status-meta";
import "./GitTree.css";

export function GitStatusBadge({ status }: { status: string }) {
    const { letter, hex } = gitStatusMeta(status);
    return <span className="git-status-badge" data-type="git-status-badge" title={status} style={{ color: hex }}>{letter}</span>;
}
