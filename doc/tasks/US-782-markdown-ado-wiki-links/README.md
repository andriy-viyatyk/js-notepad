# US-782: Markdown view — resolve Azure DevOps wiki links (attachments + root-relative page links)

## Goal

Make the Markdown view correctly render and navigate **Azure DevOps (ADO) wiki**
links — both `.attachments` images and root-relative page links — when a `.md`
file lives inside a cloned ADO wiki git repository. As a side effect, fix the
latent bug where **relative images never resolve at all** in the Markdown view.

## Background

### The problem

A cloned ADO wiki (e.g. `D:\projects\EverGreen\web-wiki\Applications.wiki`) writes
links in ADO's own dialect. Two real examples from
`Applications\Business-Rule-Engine-(BRE).md`:

```markdown
[![Architecture Diagram](/.attachments/rule-engine-architecture.png)](/.attachments/rule-engine-architecture.png)

[Domain model](/Applications/Business%20Rule%20Engine%20(BRE)/Domain%20model)
```

Neither renders/navigates today. Confirmed on-disk layout of the wiki:

```
Applications.wiki/
  .git/                ← repo-root marker (the only marker we rely on)
  .attachments/        ← ALL images, at the root, already-slugged names
    rule-engine-architecture.png
  .order
  Applications.md          ← a page…
  Applications/            ← …and its children folder (same name)
    Patient-CRM.md
    Patient-CRM/
      EDW-Data-Interface.md
    Business-Rule-Engine-(BRE).md
```

So the two example links map to:

| Link in markdown | On-disk target |
|---|---|
| `/.attachments/rule-engine-architecture.png` | `<root>\.attachments\rule-engine-architecture.png` |
| `/Applications/Business%20Rule%20Engine%20(BRE)/Domain%20model` | `<root>\Applications\Business-Rule-Engine-(BRE)\Domain-model.md` |

### Two root causes

1. **The Markdown renderer never resolves `<img>` sources.** In
   `MarkdownBlock.tsx`, `getComponents()` overrides `a`, `code`, `pre`, `input` —
   **not** `img`. Anchor links get `resolveRelatedLink(filePath, href)` (relative
   → `file://`), but image `src` only passes through the global `urlTransform`
   (`decodeURIComponent`) — no path resolution. So **every** relative image is
   broken, not just ADO's. (CSP imposes no `img-src` restriction — `file://` and
   `data:` images render fine; the `a` resolver already relies on this.)

2. **ADO uses a leading-slash + slug dialect** that the normal relative resolver
   can't handle:
   - leading `/` means **wiki root**, not filesystem/drive root (on Windows
     `fpResolve(dir, "/x")` resolves to the **drive root** — wrong).
   - spaces in titles become `-` on disk (`Domain model` → `Domain-model`).
   - page links carry **no extension** → the on-disk file is `<slug>.md`.

### Link encoding is NOT plain `encodeURI`

Two distinct encodings are in play:

- **Link text** in the `.md` is standard URL percent-encoding (space = `%20`),
  reversed by `decodeURIComponent` (built-in).
- **On-disk filename** uses ADO's slug encoding, which is **not** `encodeURI`:
  space → `-`, plus a small fixed special-char table where even a **literal `-`**
  is percent-encoded (`%2D`) so it doesn't collide with slug dashes. `encodeURI`
  leaves `-` untouched and turns space into `%20` (the opposite). So we need a
  tiny custom `adoSlugEncode` helper, not a library call.

  Core table (apply **before** space→`-`): `:`→`%3A`, `<`→`%3C`, `>`→`%3E`,
  `*`→`%2A`, `?`→`%3F`, `|`→`%7C`, `"`→`%22`, `-`→`%2D`. For this wiki's content
  (letters + spaces + parentheses) the transform collapses to "decode `%20`, then
  space→`-`"; the table only matters for the long tail. Pin the exact set against
  ADO docs during implementation.

### Click-to-open already works

No new click wiring is needed. `src/main/open-window.ts` (`will-navigate`,
~line 153) intercepts any click on an `<a href="file://…">`, calls
`event.preventDefault()` + `fileURLToPath(url)`, and sends `eOpenFile` → the file
opens as a new Persephone page. As long as our resolver emits a valid
`file://<root>\…\Domain-model.md` href (via `url.pathToFileURL`), page-link clicks
open the target `.md` automatically.

### Key existing code

- `src/renderer/editors/markdown/MarkdownBlock.tsx` — `getComponents()`
  (line ~403, override `a`; add `img`), `components` memo (line ~445),
  `urlTransform` (line ~535). `MarkdownBlock` is also reused embedded in the
  notebook editor, so the fix benefits both.
- `src/renderer/core/utils/path-utils.ts` — `resolveRelatedLink()` (the only
  resolver used by `MarkdownBlock`; blast radius is just this one file).
- `src/renderer/core/utils/file-path.ts` — `fpDirname`, `fpJoin`, `fpExtname`,
  `fpResolve`, `fpBasename` (all present).
- `src/renderer/api/fs.ts` — `fs.stat(path)` returns `{ exists, isDirectory, … }`
  for the root walk-up.

## Design decisions (resolved with user)

1. **Detection marker: `.git` only.** Walk up from the file's folder; the first
   ancestor containing `.git` is the wiki root. (Attachment-less wikis still work;
   `.attachments`/`.order` are not required.) Minor implication: any `.md` in any
   git repo gets the dialect applied to **leading-slash** links only — relative
   links are unaffected, and leading-slash links outside wikis are rare, so this
   is acceptable.
2. **Encoding:** `decodeURIComponent` to undo the link encoding + a small custom
   `adoSlugEncode` for the on-disk name (not `encodeURI`).
3. **Page-link clicks open in a new page** — free, via the existing
   `will-navigate` → `eOpenFile` interceptor.
4. **Missing targets** resolve to a non-existent path and fail on click —
   accepted (matches "not-yet-created wiki page" behavior).
5. **ADO slug/`.md` transform is scoped to leading-slash (root-relative) links
   only.** Plain relative links keep generic file-relative resolution.
6. **Attachment vs page disambiguation:** a leading-slash link whose last segment
   ends in a **known media/file extension** (png, jpg, jpeg, gif, svg, webp, bmp,
   ico, pdf, drawio, …) is treated as a literal file (resolve `<root>\<path>`, no
   slug); otherwise it's a page (slug-encode each segment, append `.md`). Using a
   known-extension list (not "any dot") avoids mis-handling page titles that
   contain dots (e.g. `Node.js` → `Node.js.md`).
7. **Synchronous render, async detection.** The wiki root is detected once
   asynchronously (per file path, cached) and fed into the synchronous resolver —
   no per-link I/O, no flicker beyond a single re-render when the root resolves.

## Implementation plan

### 1. `src/renderer/core/utils/path-utils.ts`

- [x] Add `adoSlugEncode(title: string): string` — apply the special-char table,
      then replace spaces with `-`. (Pure string helper; export for tests.)
- [x] Add `detectGitRoot(filePath: string): Promise<string | undefined>` — walk up
      with `fpDirname`, `fs.stat(fpJoin(dir, ".git"))`; return the first dir whose
      `.git` exists (file or dir — submodules use a `.git` file). Stop when
      `fpDirname(dir) === dir`. Memoize results in a module-level `Map<string,
      string|undefined>` keyed by the starting directory (cheap repeat calls from
      notebook embeds). Verify importing `fs` here introduces no circular
      dependency (`fs.ts` → `file-path` only); if it does, host `detectGitRoot`
      where `fs` is already available and pass the root in.
- [x] Extend `resolveRelatedLink(currentFilePath?, link?, wikiRoot?)` with a new
      branch, placed **after** the existing protocol/anchor/mneme guards and
      **before** the generic relative-resolution block (also added `data:` /
      `blob:` to the early-return guard so embedded `<img>` URIs aren't mangled
      by the new `img` resolver):
      - If `link` starts with `/` (root-relative):
        - If `wikiRoot` is set:
          - Split off `#fragment`; `decodeURIComponent` the path part; drop the
            leading `/`.
          - If the last segment ends in a known media/file extension → join
            `fpJoin(wikiRoot, decodedPath)` literally (no slug). 
          - Else (page) → `adoSlugEncode` each segment, append `.md`, join
            `fpJoin(wikiRoot, …)`.
          - Return `url.pathToFileURL(target).href + fragment`.
        - If no `wikiRoot` → fall through to existing behavior (unchanged).
      - Non-slash relative links → unchanged (existing relative resolution).
- [x] Keep all existing early-returns and the `mneme://` path intact.

### 2. `src/renderer/editors/markdown/MarkdownBlock.tsx`

- [x] Add `wikiRoot` state: `const [wikiRoot, setWikiRoot] = useState<string>()`.
- [x] `useEffect` keyed on `filePath`: if `filePath` is a real OS path (not
      `mneme://`, not empty), call `detectGitRoot(filePath)` and `setWikiRoot`
      (guard against races with a `cancelled` flag). Clear to `undefined` when no
      filePath.
- [x] Thread `wikiRoot` into `getComponents(filePath, mermaidLightMode, wikiRoot)`
      and add it to the `components` memo deps.
- [x] In `getComponents`:
      - `a`: `href={resolveRelatedLink(filePath, href, wikiRoot)}` (add arg).
      - **Add** `img`: render `<img src={resolveRelatedLink(filePath, src, wikiRoot)} {...rest} />`
        (pull `src` from props; preserve `alt`, `title`, etc.).
- [x] Left `urlTransform` as-is. The resolver re-decodes defensively (try/catch);
      since the value is already `urlTransform`-decoded, the second decode is a
      no-op for normal content, so both code paths converge to the same slug. A
      literal `%` in a page title is the only divergence — accepted long-tail.

### 3. Tests

The project has no unit-test harness wired for the renderer utils, so test cases
are documented here for manual verification instead of automated:
- `adoSlugEncode`: special-char table + space→`-` ordering (literal `-` → `%2D`).
- `resolveRelatedLink` leading-slash: attachment (png) literal; page (no ext) →
  slug + `.md`; dotted title (`Node.js` → `Node.js.md`); fragment preserved;
  no-`wikiRoot` fallback; plain-relative unchanged; `data:`/`blob:` passthrough.

## Concerns / open questions

- **Circular import** of `fs` into `path-utils` — verify; relocate `detectGitRoot`
  if needed (see step 1).
- **`urlTransform` vs resolver decoding** — ensure no harmful double-decode for the
  leading-slash branch (step 2 last bullet).
- **Special-char table completeness** — ship the core 8-entry table; treat rarer
  ADO escapes as a known limitation if they surface.
- **`.git`-only detection breadth** — accepted (decision #1); revisit only if a
  non-wiki repo's leading-slash links misbehave.

## Acceptance criteria

- [ ] Opening `Applications\Business-Rule-Engine-(BRE).md` from the cloned wiki:
      the `/.attachments/rule-engine-architecture.png` image **renders**.
- [ ] The `[Domain model](/Applications/…/Domain%20model)` link resolves to
      `<root>\Applications\Business-Rule-Engine-(BRE)\Domain-model.md`; **clicking**
      it opens that `.md` as a new Persephone page (or shows a benign failure if
      the target doesn't exist yet).
- [ ] A plain relative image (`![](images/x.png)`) in any markdown file now renders
      (latent bug fixed).
- [ ] Markdown files **outside** a git repo behave exactly as before.
- [ ] `npm run lint` and `tsc --noEmit` are clean.

## Files changed

| File | Change |
|---|---|
| `src/renderer/core/utils/path-utils.ts` | Add `adoSlugEncode` + `resolveAdoWikiLink`; extend `resolveRelatedLink` with the leading-slash ADO branch + `data:`/`blob:` guards |
| `src/renderer/editors/markdown/detect-git-root.ts` | **New.** `detectGitRoot` (async, module-cached). Lives in `editors/` — not `core/` — because it imports `api/fs` (see concern resolution below) |
| `src/renderer/editors/markdown/MarkdownBlock.tsx` | Detect `wikiRoot` (async, cached); add `img` resolver; pass `wikiRoot` to `a`/`img` |

### Review outcome

`/review` flagged one must-fix: placing `detectGitRoot` in `core/utils/path-utils.ts`
made `core/` import `api/fs`, violating the layering rule and forming a circular
edge (`core → api/fs → core/file-path`). **Resolved** by moving `detectGitRoot`
(and its cache) into the new `editors/markdown/detect-git-root.ts` — `editors/`
may import both `api/` and `core/`. The pure string/url helpers (`adoSlugEncode`,
`resolveAdoWikiLink`) stay in `core/` since they touch no `fs`. Suggestions on the
regex char-class and a cache-lifetime comment were also applied.
