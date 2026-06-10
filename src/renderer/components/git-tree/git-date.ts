// Developer-friendly, zero-padded, local-time `YYYY-MM-DD HH:mm` (24-hour, no
// seconds — US-618). Shared by every git-history view (popovers, Revisions
// panel, whole-repo editor's date column, and the Commit info panel — US-629)
// so the format stays consistent in one place.

const pad = (n: number) => String(n).padStart(2, "0");

export const dateText = (ms: number): string => {
    if (!ms) return "";
    const d = new Date(ms);
    return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
};
