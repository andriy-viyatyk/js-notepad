import type { WikiSearchHit } from "./MnemeRootEditorModel";

// =============================================================================
// Mneme search results → markdown (US-680).
//
// `search` results are rendered as a single markdown document by
// `MarkdownBlock` instead of bespoke result rows. Each hit's title links to its
// document via a proper `mneme://{root}/{path}` URL, so clicking it rides
// Persephone's standard `openRawLink` flow (opens in a new page).
// =============================================================================

/** Escape markdown-significant characters so snippet/title prose renders verbatim
 *  (snippets may carry FTS5 highlight markers like `[term]` and other metachars). */
function escapeMarkdown(text: string): string {
    return text.replace(/([\\`*_[\]<>])/g, "\\$1");
}

/** Render one search hit as a markdown section: a linked heading, the snippet,
 *  and a trailing metadata line (tags · path · score). */
function hitToMarkdown(hit: WikiSearchHit): string {
    const path = hit.uri.replace(/^mneme:\/\//, "");
    const href = `mneme://${path}`;
    const label = escapeMarkdown(hit.title || path);

    const lines: string[] = [`### [${label}](${href})`];

    const snippet = hit.snippet?.trim();
    if (snippet) lines.push("", escapeMarkdown(snippet));

    const meta: string[] = [];
    if (hit.tags?.length) meta.push(hit.tags.map((t) => `\`${t}\``).join(" "));
    meta.push(`\`${path}\``);
    if (typeof hit.score === "number") meta.push(`score ${hit.score.toFixed(2)}`);
    lines.push("", meta.join("  ·  "));

    return lines.join("\n");
}

/** Build the full markdown document for a ranked result set (render in order). */
export function resultsToMarkdown(results: WikiSearchHit[]): string {
    return results.map(hitToMarkdown).join("\n\n");
}
