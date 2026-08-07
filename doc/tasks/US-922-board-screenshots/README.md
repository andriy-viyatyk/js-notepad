# US-922: Board screenshots in the "Search boards" catalog

## Goal

Give each published board an optional screenshot and show it in the board card on the
**Search boards** tab of the Tools & Editors hub — image on the left, all existing text and
actions on the right. Boards in `persephone-boards` get screenshots added so the catalog
looks like a gallery rather than a text list.

## Background

### The card today

`src/renderer/editors/tools-hub/SearchBoardsTab.tsx` — `BoardCard` is a vertical
`Panel` (`direction="column"`, `border`, `rounded="md"`) stacking four rows: a header
(name · version · size · installed/update tag), the description, the file-mask tag row, an
optional incompatibility warning, and the action buttons. `SearchBoardsTab` groups cards
under **File viewers / File editors / Tools & apps** and filters on name + description +
masks.

The file carries an explicit contract note: *"Pure UIKit composition (editor code — no
Emotion, UIKit Rule 7)."* There is no raw HTML element in it today, and no `Image`
primitive in UIKit — see Concern 4.

### How a card gets its data

`PublishedBoardInfo` (`src/ipc/api-param-types.ts:94`) is one entry of the cached catalog:

```ts
export interface PublishedBoardInfo {
    id: string;
    version: string;
    name: string;
    description?: string;
    fileMasks?: string[];
    folderMasks?: string[];
    editorName?: string;
    editorKind?: "simple" | "content-host";
    standalone?: boolean;
    minAppVersion?: string;
    archive: PublishedBoardArchive;   // { url, size, sha256 }
}
```

The pipeline that fills it:

1. **`persephone-boards/boards/<id>/board-manifest.json`** — the board's own manifest, the
   single source of truth. Hand-edited by the board author.
2. **`persephone-boards/scripts/publish-board.mjs`** — `buildCatalogEntry(id, m, archive)`
   copies a fixed allow-list of manifest fields into the catalog entry and drops
   `undefined` ones. **A new field is invisible to the app until it is added here.**
3. **`boards-manifest.json`** on the `main` branch — machine-written, never hand-edited.
4. **`src/main/published-boards-service.ts`** — `net.fetch`es the raw manifest,
   `validateBoard()` re-validates every field (unknown fields are dropped), caches the
   last-good catalog in `electronStore` for offline use, and broadcasts
   `ePublishedBoardsUpdated`. **A new field must also be added to `validateBoard`** or it
   is stripped on the way in.
5. **`src/renderer/api/published-boards.ts`** — reactive renderer model; `useCatalog()`.

`boardsRepoRawBase()` already resolves the raw base URL, with a
`PERSEPHONE_BOARDS_BRANCH` env override so the whole flow is testable against `develop`
before anything ships to `main`.

### Renderer CSP

`index.html` sets only `script-src` / `worker-src` / `child-src`. There is **no
`img-src` and no `default-src`**, so a remote `<img src="https://…">` in the renderer
loads without any CSP change. (The strict `img-src 'self' data: blob:` in
`board-protocol-service.ts:72` applies to board iframes only, not to the app renderer.)

### Patterns to follow

- `src/renderer/editors/board/board-icon-cache.ts` — the established shape for
  "resolve an image lazily, cache it module-level, re-render on resolution". Mirrors
  `favicon-cache.ts`. If a disk cache is chosen (Concern 2 option B) this is the model.
- `src/renderer/editors/link-editor/pipe-image-src.ts` — the capped/evicting blob-URL
  cache, if bytes ever need to be fetched rather than linked.

### Boards to update

Eight published boards, all in `C:\projects\persephone-boards\boards\`:
`drawio-viewer`, `excel-viewer`, `pdf-viewer`, `pe-viewer`, `powerpoint-viewer`,
`sqlite-viewer`, `todo`, `word-viewer`.

---

## Implementation plan

### Part A — `persephone-boards` repo (do this on `develop`)

1. **Document the convention** in `persephone-boards/CLAUDE.md` and `README.md`:
   a board may carry `screenshot.png` in its folder and declare it in
   `board-manifest.json` as `"screenshot": "screenshot.png"`. Fix the expected shape —
   **16:10, 1120×700 recommended, PNG, under 300 KB** — so cards line up in the grid.
2. **`scripts/publish-board.mjs`** — add `screenshot: m.screenshot` to the entry built in
   `buildCatalogEntry()` (the `undefined`-stripping loop already handles boards without
   one). Decide the ZIP question (Concern 3) and add `screenshot.png` to `EXCLUDE` if it
   should not ship inside the board archive.
3. **Capture a screenshot for each of the eight boards** — open each board on a
   representative file and capture the content area. Save as
   `boards/<id>/screenshot.png`, add `"screenshot": "screenshot.png"` to its
   `board-manifest.json`, bump `version`, and add a `WHATS-NEW.md` line.
4. Merge `develop` → `main` so the publish action releases the new versions and rewrites
   `boards-manifest.json`.

### Part B — Persephone app

5. **`src/ipc/api-param-types.ts`** — add `screenshot?: string` to `PublishedBoardInfo`
   (the manifest-relative file name, e.g. `"screenshot.png"`).
6. **`src/main/published-boards-service.ts`** — in `validateBoard()`, accept
   `screenshot` when it is a string. **Validate it as a plain file name**: reject anything
   containing `/`, `\`, `..`, or a scheme, exactly as `isSafeBoardId` guards `id` — the
   value is interpolated into a URL and must not be able to point off the board's folder.
   Export a helper that resolves an entry to a full URL
   (`${boardsRepoRawBase()}/boards/<id>/<screenshot>`), so the branch override keeps
   working; expose it to the renderer with the catalog entry (either as a resolved
   `screenshotUrl` on the entry, or via a small IPC call).
7. **Shared screenshot component** — a small local component (not a UIKit primitive, per
   decision 4) used by both the Search boards card and Board Info. Suggested home:
   `src/renderer/editors/board-info/BoardScreenshot.tsx`, since both consumers can import
   it from there without a new folder. Renders a plain `<img>` at a fixed **200×125**
   (16:10) with `objectFit: "cover"` and rounded corners via an inline style object, and
   swaps to the placeholder on `onError` as well as when there is no URL. The placeholder
   occupies the identical footprint so card heights stay uniform — a bordered `Panel` with
   a centered neutral glyph.
8. **`SearchBoardsTab.tsx` — `BoardCard` layout.** Wrap today's column in an outer
   `direction="row" gap="md"`: `BoardScreenshot` on the left, the existing column on the
   right with `flex={1} minWidth={0}`. Keep `align="start"` so a short card does not
   stretch the image.
9. **`BoardInfoEditorView.tsx`** — show the same component on both modes (decision 6). In
   install mode the catalog entry is already in hand. In properties mode look the board up
   in the catalog by id to get the URL, and fall back to the placeholder when it is not a
   catalog board.
10. **Verify** against `develop` by launching with `PERSEPHONE_BOARDS_BRANCH=develop`, then
    again against `main` once Part A is merged.

---

## Resolved decisions

All seven questions below were answered. Summary of what was chosen:

| # | Decision |
| :-- | :--- |
| 1 | **Raw branch URL** — `${boardsRepoRawBase()}/boards/<id>/<screenshot>`. No release asset. |
| 2 | **Direct `<img src={url}>`** — no fetch-and-cache, no new service or IPC. |
| 3 | **Exclude `screenshot.png` from the published ZIP** — catalog metadata, not board content. |
| 4 | **No UIKit `Image` primitive** — images are rare in Persephone; render a plain `<img>` in the view. |
| 5 | **Show a placeholder** when a board has no screenshot. |
| 6 | **In scope: Board Info page** — install and properties screens show the screenshot too. |
| 7 | **200px screenshot width** to start, for visual review. |

Notes that change the plan above:

- **On (4)** — a plain `<img>` is *not* a UIKit component, so Rule 7 does not apply to it:
  the rule forbids Emotion imports in app code and `style`/`className` **on UIKit
  components**. So `<img style={{ width: 200, … }}>` inside `BoardCard` is compliant, and
  step 7 of the plan (the `Image` primitive) is **dropped**. Do not reach for
  `@emotion/styled` here — an inline style object on the raw element is the compliant path.
- **On (5)** — since (3) keeps the screenshot out of the ZIP and every catalog board will
  carry one, the placeholder is a safety net rather than a common state. Keep it neutral
  and the exact same 200×125 footprint as a real screenshot so card heights stay uniform.
- **On (6)** — Board Info reads the same `PublishedBoardInfo`, so install mode gets the URL
  for free. Properties mode is for an *installed* board; because of (3) the screenshot is
  not on disk, so it must resolve the catalog entry by id to get the URL, and shows the
  placeholder when the board is not in the catalog (a locally registered board).

## Concerns / Open questions

*(All resolved — see the table above. Kept for the reasoning behind each choice.)*

**1. Where the screenshot is served from — raw branch URL vs. release asset.**
*Recommendation: raw branch URL.* `https://raw.githubusercontent.com/…/<branch>/boards/<id>/screenshot.png`
costs no extra publish plumbing, reuses `boardsRepoRawBase()` and its
`PERSEPHONE_BOARDS_BRANCH` override, and is exactly how the catalog manifest itself is
fetched. The trade-off is that the URL is **mutable** — it always shows the current
`main`, so a user on an older app build sees the newest screenshot. For decoration that is
harmless. The alternative (upload `screenshot.png` as a second asset on the per-board
release and store an immutable URL in the entry) is version-accurate but adds an asset
upload, a second URL field, and history rewriting for old versions. **Needs your call.**

**2. Direct `<img>` vs. fetch-and-cache.**
*Recommendation: direct `<img src={url}>` for this task.* No CSP change is needed, and
Chromium's HTTP cache handles repeat views. Two things to be aware of: it makes the app
**renderer** talk to github directly (every other network call in this feature goes through
main), and screenshots will **not** appear offline even though the catalog itself is
cached offline by design. The alternative is a main-process fetch into
`<userData>/data/board-screenshots/<id>-<version>.png` plus a `board-icon-cache`-style
module — offline-clean and consistent, but a new service, new IPC, and cache eviction.
I lean toward starting direct and adding the cache only if the online-only behavior
annoys you. **Needs your call.**

**3. Should `screenshot.png` ship inside the board ZIP?**
It is catalog metadata rather than board content, and at ~200 KB it would be a visible
share of a small board's download (`todo` is far smaller than that today). Excluding it
from the ZIP keeps installs lean; including it lets an *installed* board show its own
screenshot on the Board Info properties screen without a network round-trip.
*Recommendation: exclude from the ZIP* (add to `EXCLUDE` in the publish script) and treat
the screenshot as purely catalog-side. **Needs your call.**

**4. UIKit `Image` primitive — new component required.**
`SearchBoardsTab` is documented as pure UIKit composition under Rule 7, and there is no
image primitive in UIKit today. A raw `<img>` would need sizing and `object-fit`, which
means a `style=` or Emotion escape hatch in editor code — precisely what Rule 7 forbids.
Adding `Image` is the clean path and it is broadly useful (Board Info could reuse it).
This does mean the task touches UIKit, which widens `/review` scope. The alternative —
one bespoke Emotion-styled component under `editors/tools-hub/` — is smaller but sets the
wrong precedent.

**5. Cards without a screenshot.**
Eight boards get one now, but a third-party board may not. Options: omit the left column
entirely (card looks exactly like today), or show a neutral placeholder (uniform card
heights, but a wall of empty boxes if adoption is low). *Recommendation: omit.*

**6. Scope — Board Info page.**
The install and properties screens in `src/renderer/editors/board-info/` show the same
catalog data as tiles and would benefit from the screenshot too. I have **left this out**
of the plan to keep the task contained. Say the word and I will fold it in — it is a small
addition once the `Image` primitive and the URL resolution exist.

**7. Card width in the hub.**
The Tools & Editors hub page has a Pinned rail on the right, so the card column is
narrower than the full window and narrower still in the sidebar-panel context. A fixed
200px screenshot plus text should be fine, but this wants a look at real widths before
the number is settled.

---

## Acceptance criteria

- [ ] A board can declare `"screenshot": "screenshot.png"` in `board-manifest.json`; the
      publish script carries it into `boards-manifest.json`.
- [ ] `validateBoard()` accepts the field and **rejects** any value containing a path
      separator, `..`, or a scheme.
- [ ] All eight published boards carry a screenshot, with versions bumped and
      `WHATS-NEW.md` updated.
- [ ] The Search boards card renders the screenshot on the left at 200×125 with name,
      version, size, description, masks, tags, and buttons on the right.
- [ ] The Board Info page shows the screenshot in both install and properties modes.
- [ ] A board with no screenshot shows the placeholder at the same 200×125 footprint.
- [ ] A screenshot URL that 404s falls back to the placeholder — no broken-image glyph,
      no layout jump.
- [ ] No `@emotion/styled` import is added to any app-code file.
- [ ] Filtering, grouping, Install / Update / Properties, and the update badge all behave
      as before.
- [ ] Verified end-to-end against `PERSEPHONE_BOARDS_BRANCH=develop` before the merge to
      `main`.
- [ ] `tsc --noEmit` and `npm run lint` clean.
