import styled from "@emotion/styled";
import { gitStatusMeta } from "./git-status-meta";

const Badge = styled.span({
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
    paddingLeft: 6,
    userSelect: "none",
});

export function GitStatusBadge({ status }: { status: string }) {
    const { letter, hex } = gitStatusMeta(status);
    return <Badge data-type="git-status-badge" title={status} style={{ color: hex }}>{letter}</Badge>;
}
