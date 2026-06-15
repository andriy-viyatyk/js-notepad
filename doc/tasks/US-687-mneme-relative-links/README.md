# US-687: Mneme — relative `mneme://` links in markdown open attachments in the viewer

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 4
**Status:** Implemented (unreviewed) — verified 2026-06-15.
**Depends on:** the primary work (relative-link resolution) depended on **nothing hard** — the
binary-resource read path already worked. The **secondary** sub-task (§3,
`MnemeProvider.writeBinary` → `wiki_upload`) needed [US-686](../US-686-mneme-binary-tools/README.md)
for the `wiki_upload` tool, which has shipped — so §3 is now implemented too.
Thematically completes US-685/US-686 (the agent side of "navigate a root through Mneme"); this is
the **UI** side.

## Goal

1. **(Primary)** When a Mneme markdown document rendered in Persephone (open as
   `mneme://{root}/{path}/guide.md`) contains a **relative** link to a sibling attachment —
   `[Example](attachment/example.png)` or `[Example](/attachment/example.png)` — clicking it resolves
   to the absolute `mneme://{root}/.../attachment/example.png` and opens in the **Image viewer** (and,
   for any other type, the editor that the extension maps to).
2. **(Secondary — needs US-686)** Fix `MnemeProvider.writeBinary` so writing a **binary** file back to
   a root uses the new `wiki_upload` tool (base64) instead of corrupting it through `wiki_write`'s
   UTF-8 text path. Text/markdown writes stay on `wiki_write` (so they keep indexing).

## Background

A `→ Sonnet Explore` pass mapped the full path; almost everything already works. The **only** gap is
relative-link resolution for the `mneme://` scheme.

**Already works (no change needed):**
- **`MnemeProvider`** ([`src/renderer/content/providers/MnemeProvider.ts`](../../../src/renderer/content/providers/MnemeProvider.ts)) supports **binary** — `readBinary()` calls `client.readResource({ uri })` and handles both `text` and base64 `blob` content. (Backed by Mneme's `resources/read` → `read_bytes`, which serves any resolvable file regardless of the index filter — so this works *now*, independent of US-685/686.)
- **Resolver** ([`src/renderer/content/resolvers.ts:99-114`](../../../src/renderer/content/resolvers.ts)) registers the `mneme://` scheme, builds a `MnemeProvider` pipe, and picks the editor by extension via `editorRegistry.resolveId(path)` — so `mneme://…/x.png` → `image-view`.
- **Image viewer** ([`src/renderer/editors/image/ImageEditor.ts`](../../../src/renderer/editors/image/ImageEditor.ts)) reads bytes through the pipe (`readBinary()`) and renders a blob URL — works for any provider, including Mneme.
- **Markdown renderer** ([`src/renderer/editors/markdown/MarkdownBlock.tsx:416-422`](../../../src/renderer/editors/markdown/MarkdownBlock.tsx)) already routes every `<a href>` through `resolveRelatedLink(filePath, href)`, where `filePath` is the document's `mneme://{root}/{path}` source URL. Clicks flow through `openRawLink` → parsers → resolvers → `openContent`.

**The gap:** [`src/renderer/core/utils/path-utils.ts`](../../../src/renderer/core/utils/path-utils.ts)
`resolveRelatedLink` (lines 9-39) only understands **OS file paths** — it calls `fpDirname` +
`fpResolve` + `url.pathToFileURL`. Given `currentFilePath = "mneme://root/docs/guide.md"` and a
relative `link`, it mangles the `mneme://` base into a broken `file://` path. So relative attachment
links in Mneme docs don't open.

## Implementation plan

**Renderer/TypeScript task** — standard completion applies (`/review` + `/userdoc` on completion).

### 1. Add `mneme://` handling to `resolveRelatedLink`

In [`path-utils.ts`](../../../src/renderer/core/utils/path-utils.ts):

**a.** Add `mneme://` to the absolute-scheme early-return guard (lines 13-19) so an *absolute*
`mneme://…` link in markdown is returned unchanged (and never re-resolved as a relative path):

```ts
        lowerLink.startsWith("file://") ||
        lowerLink.startsWith("mneme://") ||   // ← add
        lowerLink.startsWith("mailto:") ||
        lowerLink.startsWith("#")
```

**b.** Before the existing `try` block (the OS-path fallback), branch on a `mneme://` base and
resolve within the mneme namespace using **forward-slash** segment math (NOT `fpResolve`, which
emits OS separators / backslashes on Windows):

```ts
    // Mneme documents address attachments within the mneme:// namespace, not the OS filesystem.
    if (currentFilePath.toLowerCase().startsWith("mneme://")) {
        return resolveMnemeLink(currentFilePath, link);
    }
```

**c.** Add the helper (pure, forward-slash, root-clamped):

```ts
/**
 * Resolve a relative link inside a `mneme://{root}/{path}` document.
 * - leading "/"  → relative to the root top:    mneme://{root}/{link}
 * - otherwise    → relative to the doc's dir.
 * "." / ".." are honored but clamped at {root} (Mneme rejects traversal above a root).
 * A "#fragment" is preserved.
 */
function resolveMnemeLink(currentMnemeUrl: string, link: string): string {
    const decoded = decodeURIComponent(link);
    const hashIndex = decoded.indexOf("#");
    const pathPart = hashIndex >= 0 ? decoded.slice(0, hashIndex) : decoded;
    const fragment = hashIndex >= 0 ? decoded.slice(hashIndex) : "";

    const addr = currentMnemeUrl.slice("mneme://".length); // {root}/{path}/guide.md
    const segs = addr.split("/").filter(Boolean);
    const root = segs[0] ?? "";
    const docDirSegs = segs.slice(1, -1);                  // path within root, minus the filename

    const baseSegs = pathPart.startsWith("/") ? [] : docDirSegs.slice();
    for (const seg of pathPart.split("/")) {
        if (seg === "" || seg === ".") continue;
        if (seg === "..") { if (baseSegs.length) baseSegs.pop(); continue; } // clamp at root
        baseSegs.push(seg);
    }
    return `mneme://${[root, ...baseSegs].join("/")}${fragment}`;
}
```

### 2. Verify the resolution table

**Persephone has no JS/TS test framework** (no committed unit tests anywhere in `src/`), so this is
verified by a throwaway Node script over the pure `resolveMnemeLink` helper (not committed), plus the
manual UI test in §4 — not a committed unit test. Cases the helper must satisfy:

| `currentFilePath` | `link` | expected |
|---|---|---|
| `mneme://myroot/docs/guide.md` | `attachment/example.png` | `mneme://myroot/docs/attachment/example.png` |
| `mneme://myroot/docs/guide.md` | `/attachment/example.png` | `mneme://myroot/attachment/example.png` |
| `mneme://myroot/docs/guide.md` | `../shared/x.png` | `mneme://myroot/shared/x.png` |
| `mneme://myroot/docs/guide.md` | `../../../x.png` | `mneme://myroot/x.png` (clamped) |
| `mneme://myroot/docs/guide.md` | `other.md#section` | `mneme://myroot/docs/other.md#section` |
| `mneme://myroot/docs/guide.md` | `mneme://myroot/a.png` | `mneme://myroot/a.png` (absolute, unchanged) |
| `mneme://myroot/docs/guide.md` | `https://x.com/a.png` | unchanged |
| `C:/notes/guide.md` (non-mneme) | `img/x.png` | existing `file://` behavior (regression guard) |

### 3. `MnemeProvider.writeBinary` → `wiki_upload` (secondary — **needs US-686**) ✅ implemented

[`src/renderer/content/providers/MnemeProvider.ts:46`](../../../src/renderer/content/providers/MnemeProvider.ts)
`writeBinary` is the single write path for **both** text docs and binary attachments. Today it always
calls `wiki_write` with `data.toString("utf8")` — fine for markdown (it indexes), **corrupting for
binary** (PNG bytes → mojibake). It's a latent bug (no UI action writes binary over `mneme://` yet),
but US-686 introduces `wiki_upload`, so make `writeBinary` branch on content type — mirroring the
server's `looks_binary` (NUL byte or invalid UTF-8 ⇒ binary):

```ts
async writeBinary(data: Buffer): Promise<void> {
    const client = mnemeConnection.getClient();
    if (!client) throw new Error("Mneme is not connected");
    if (looksBinary(data)) {
        // Binary attachment (image/PDF/diagram) → wiki_upload (base64; not indexed).
        await client.callTool({
            name: "wiki_upload",
            arguments: { path: this.path, contentBase64: data.toString("base64") },
        });
    } else {
        // Text/markdown → wiki_write (whole-file UTF-8; indexed synchronously).
        await client.callTool({
            name: "wiki_write",
            arguments: { path: this.path, content: data.toString("utf8") },
        });
    }
}
```

Add the module-private helper (matches the server's detection, so a doc written as text indexes and a
binary attachment does not):

```ts
/** A NUL byte or invalid UTF-8 ⇒ treat as binary (mirrors the Rust `looks_binary`). */
function looksBinary(data: Buffer): boolean {
    if (data.includes(0)) return true;
    try {
        new TextDecoder("utf-8", { fatal: true }).decode(data);
        return false;
    } catch {
        return true;
    }
}
```

Update the class doc comment (lines 5-15): writes go through `wiki_write` for text and `wiki_upload`
for binary. **Do not implement this section until US-686 has shipped `wiki_upload`** — calling a
missing tool would throw at runtime.

### 4. Manual verification

Open a Mneme markdown doc that links a sibling image relatively → click → image opens in the Image
viewer. Confirm a non-md text attachment (e.g. `[csv](data/x.csv)`) opens in its editor, and the
non-mneme markdown case (a `file://` doc) is unchanged.

## Concerns / decisions

1. **Traversal clamp.** Mneme's `WikiAddress::parse` rejects `..`/`.` segments, so an unclamped
   `../../..` URL would error on open. The helper clamps at `{root}` and drops `.`/`..` so the
   produced URL is always a valid in-root address.
2. **Leading `/` = root-relative**, matching the user's `[Example](/attachment/example.png)`
   example. Doc-relative is the no-slash form. Both are supported.
3. **No resolver/image-viewer changes** — they already handle `mneme://` + binary. The *primary*
   task is the ~30-line resolver gap plus tests; `MnemeProvider` changes only for the secondary
   `writeBinary` fix (§3).
4. **The click/read path is independent of US-685/686** — it uses `resources/read`, which already
   serves any resolvable file. Only the secondary `writeBinary` fix (§3) depends on US-686's
   `wiki_upload`; ship the primary work first if US-686 lags.
5. **Why `writeBinary` branches instead of always using `wiki_upload`.** It's the sole write path for
   text docs too; markdown must go through `wiki_write` to be indexed (binary is never indexed —
   US-685/686). The UTF-8 check mirrors the server so the text/binary split is identical on both
   sides.

## Acceptance criteria

- [x] A relative image link in a `mneme://` markdown doc resolves to the correct absolute `mneme://`
  URL and opens in the Image viewer. *(manual UI test: `TestWiki/test/relative-link-test.md`, links
  1–4 + 5 all opened the image; verified 2026-06-15.)*
- [x] Leading-`/`, `./`, `../`, and `#fragment` links resolve per the table above; `..` is clamped at
  the root. *(ad-hoc Node check of `resolveMnemeLink` — all 9 cases pass.)*
- [x] Absolute `mneme://` links and external (`http(s)://`, `mailto:`) links are returned unchanged.
  *(early-return guard; UI control links 5–6 behaved correctly.)*
- [x] Non-mneme (OS-path) markdown link resolution is unchanged — the on-disk branch is untouched
  (regression guard).
- [x] **(Secondary, needs US-686)** `MnemeProvider.writeBinary` routes binary bytes through
  `wiki_upload` (base64) and text through `wiki_write`; a written markdown doc still indexes, a
  written binary attachment does not.
- [x] `tsc --noEmit` + `eslint` clean on the changed files. *(Persephone has no JS test framework —
  no committed unit tests; see §2.)*

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/core/utils/path-utils.ts` | `mneme://` early-return guard + `resolveMnemeLink` helper |
| `src/renderer/content/providers/MnemeProvider.ts` | `writeBinary` text/binary branch (`wiki_write` vs `wiki_upload`) + `looksBinary` helper; class doc |

*(No test file — Persephone has no JS test framework; verified by ad-hoc Node check + manual UI test.)*

### Files that need NO changes

- `MnemeProvider.ts` **read path** (`readBinary` already handles base64 blobs — only `writeBinary` changes), `resolvers.ts` (mneme scheme + extension routing), `ImageEditor.ts`, `MarkdownBlock.tsx` (already calls `resolveRelatedLink`).
