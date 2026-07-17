/** Human-readable byte size (B / KB / MB) for download-size / file-size labels. */
export function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    if (n < 1024) return `${n} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}
