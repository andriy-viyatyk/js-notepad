# US-784: In-page navigation + Back history for the Markdown view

> **Status:** Implemented (all 7 plan steps done; `tsc --noEmit` + `eslint` clean).
> Pending user testing. `BrowserPanelHost` (a second `IPageHost`) also gained the
> new `navBackCount` state + inert `pushNavBack`/`popNavBack` to satisfy the
> interface.

## Goal

When the user clicks a link to a **local markdown file** inside the Markdown
("Preview") view, open the target **in the same page** instead of spawning a new
Persephone tab. Track a per-page **back history** and surface a **Back** button on
the Markdown view header so the user can return to the previously-viewed document.
All other links (http/https, images, non-markdown files, `mailto:`, anchors) keep
opening exactly as they do today (new tab / current behavior).

## Background

### How a markdown link is rendered and clicked today

- `MarkdownBlock.tsx` renders each link as a plain anchor whose `href` is the
  **resolved** link: `<a href={resolveRelatedLink(filePath, href, wikiRoot)} …>`
  (`src/renderer/editors/markdown/MarkdownBlock.tsx:417-423`). For a relative
  `.md` link `resolveRelatedLink` returns a `file:///…/doc.md` URL
  (`src/renderer/core/utils/path-utils.ts:16-64`).
- `MarkdownBlock` has **no click handler** for links (only `onContextMenu` for the
  copy/open menu). So a plain left-click bubbles up and is caught by the **main
  process**: `OpenWindow`'s `will-navigate` handler
  (`src/main/open-window.ts:131-186`):
  - `file://` URL → `event.preventDefault()` + `send(eOpenFile, filePath)`
  - other URLs → `event.preventDefault()` + `send(eOpenUrl, url)`
- The renderer receives those IPC events in `RendererEventsService`
  (`src/renderer/api/internal/RendererEventsService.ts`):
  - `eOpenFile` → `handleOpenFile` → `app.events.openRawLink.sendAsync(createLinkData(filePath))`
  - `eOpenUrl`  → `handleOpenUrl`  → `openRawLink(createLinkData(url))`
  - **Neither sets `pageId`**, so the content pipeline opens the file in a **new
    tab** (or activates an already-open page for that file).

### The content pipeline & in-place navigation precedent

`openRawLink` → `openLink` (parsers, `content/parsers.ts`) → `openContent`
(resolvers, `content/resolvers.ts`) → **open-handler** (`content/open-handler.ts`).
The open-handler branches on `data.pageId`:

- `pageId` set → `pagesModel.lifecycle.navigatePageTo(pageId, filePath, {…})` —
  **navigates the existing page in place** (swaps its main editor).
- `pageId` absent → `pagesModel.lifecycle.openFile(filePath, pipe, {…})` — new/existing tab.

The Explorer already uses the in-place form — clicking a file fires
`openRawLink(createLinkData(url, { pageId, sourceId: "explorer" }))`
(`src/renderer/editors/explorer/ExplorerSecondaryView.tsx:57-63`). The current
page id is read as `model.page?.id`. **This is the exact mechanism we reuse for
markdown in-page navigation.**

`navigatePageTo` (`src/renderer/api/pages/PagesLifecycleModel.ts:702-882`) builds a
fresh editor for the new file and calls `page.setMainEditor(adapter)`. For a `.md`
target it lands on the `md-view` preview editor (`md-view` is the highest-priority
preview editor for `markdown` — `editor-matchers.ts:65-68`, registered as "Preview"
in `register-editors.ts:172-182`). Passing an explicit `target: "md-view"`
guarantees the page stays in the rendered Markdown view.

### Page model & editor swap

- `PageModel` (`src/renderer/api/pages/PageModel.ts`) owns the page's editors and
  the reactive `IPageState`. It **survives main-editor swaps** — the right home
  for navigation history (each in-place navigation builds a *new* `MarkdownEditor`,
  so history can't live on the editor).
- `PageModel` already has a transient store (`getTransient`/`setTransient`) and a
  reactive `state` (`TOneState<IPageState>`); UI subscribes via `page.state.use()`.
- `MarkdownEditor` (`src/renderer/editors/markdown/MarkdownEditor.ts`) is a thin
  editor over a `TextFileModel` host. The current file path is
  `model.host.state.get().filePath`; the view reads `content`/`filePath` off the
  host.
- The Markdown header is the `PageToolbar` inside `TextChrome`
  (`src/renderer/editors/base/TextChrome.tsx`). `index.tsx` already contributes a
  right-side compact-view toggle via `rightToolbarContributions`. `PageToolbar`
  renders `toolbarContributions` (left, after the nav-panel button, before the
  spacer) — the natural slot for a **Back** button.
- `ArrowLeftIcon` / `ChevronLeftIcon` exist in `src/renderer/theme/icons.tsx`.
- `useOptionalState(model.page?.state, selector, default)`
  (`src/renderer/core/state/state.ts:131`) lets the toolbar subscribe to page state
  without violating hook rules when `page` is null (precedent:
  `GitPanelSecondaryView.tsx`).

### File-URL helpers

`content/link-utils.ts` exports `isFileUrl(raw)` and `normalizeFileUrl(raw)`
(`file:///C:/…` → `C:/…`, URI-decoded). Use these to detect/convert the anchor href.

## Design

### Behavior matrix (what the new click interceptor does)

| Clicked link (resolved href) | Action |
|------------------------------|--------|
| `file://…/X.md` or `.markdown` (local markdown file) | **Intercept**: `preventDefault`, push current doc to page back-history, `openRawLink` with `pageId` + `target: "md-view"` → navigate **in place** |
| any other `file://…` (non-md file) | Not intercepted → falls through to main-process `will-navigate` → `eOpenFile` → **new tab** (today's behavior) |
| `http(s)://…`, `mailto:`, `data:`, `blob:`, `#fragment`, `mneme://`, etc. | Not intercepted → falls through → **today's behavior** |

Only the local-markdown case is intercepted; everything else is byte-for-byte the
current behavior, satisfying "any other links … open in a new persephone page as
it is now."

### Back history (per page)

A simple **back stack** on `PageModel` (browser-style back, **no forward** — the
user only asked for Back):

- Entry shape: `NavEntry { href: string; title?: string }` (`href` is the
  `file://` URL or path; `title` for the button tooltip).
- **Push** (on a markdown-link click): the interceptor pushes the *current* doc
  (`{ href: currentFileUrl, title: currentTitle }`) **before** firing the in-place
  navigation to the new doc.
- **Back**: pops the last entry and re-navigates the page to it in place
  (`openRawLink(createLinkData(entry.href, { pageId, target: "md-view" }))`).
  Back navigation does **not** push.
- **No clearing** (decision): history lives for the full life of the page. We do
  **not** reset it on unrelated in-place navigations. (If testing shows a stale-Back
  problem, a clear hook can be added later — not now.)
- Reactive count `navBackCount` lives on `IPageState`; the Back button shows iff
  `navBackCount > 0`.
- **Persisted** (decision): the stack is serialized into the `PageDescriptor`, so it
  survives app restart **and** moving the page to another Persephone window (window
  moves use the same descriptor save/restore path — `restorePage`). This is the key
  reason it must NOT be transient.

### Monaco ↔ Markdown switch must not be tracked

The editor-type switch widget (`PageToolbar` → `SwitchWidget` → `switchMainEditor`)
swaps the editor over the **same** `TextFileModel` host without going through the
markdown click interceptor or `openRawLink`. So a Monaco↔Markdown switch **never
pushes history** — no special handling needed; it just works. The back stack lives
on `PageModel`, so it survives the switch and the Back button reappears (with the
same history) when the user switches back to the Markdown view. Confirm this holds
(no accidental push) during implementation.

### Where each piece lives

| Concern | Location |
|---------|----------|
| Back stack storage + reactive count + push/pop | `PageModel` (+ `IPageState.navBackCount`) |
| Back stack **persistence** (serialize/restore) | `PageModel.getDescriptor()` + `PagesPersistenceModel.restorePage()` + `PageDescriptor.navBack` field |
| Click interception + push + in-place navigate | `MarkdownBody` (`onClickCapture` on the scroll panel) — has `model` + `model.page` |
| Markdown-target / local-file detection | small helper in the markdown editor folder |
| Back button (show/hide + click) | `index.tsx` `MarkdownToolbarBits` (or a new left contribution) → `PageToolbar` `toolbarContributions` |

Doing the **push** in the interceptor (which already knows the current file and the
page) keeps `navigatePageTo` and the open-handler untouched and the logic localized.

## Implementation plan

### 1. `PageDescriptor` — persisted history field

`src/shared/persistence.ts`

- [ ] Add optional `navBack?: NavEntry[]` to `PageDescriptor` (and define/export
      `NavEntry { href: string; title?: string }`). **Additive optional field** — per
      the file's own note, this does NOT bump `schemaVersion` (stays `4`).

### 2. `PageModel` — back-history store + persistence

`src/renderer/api/pages/PageModel.ts`

- [ ] Add `navBackCount: number` to `IPageState` (default `0` in `defaultPageState`).
- [ ] Add private `_navBack: NavEntry[] = []`.
- [ ] `pushNavBack(entry: NavEntry): void` — push; `state.update(s => s.navBackCount = this._navBack.length)`.
- [ ] `popNavBack(): NavEntry | undefined` — pop; update count.
- [ ] `get navBackCount(): number` (optional convenience; the reactive value is the
      one on `state`).
- [ ] **Persist**: include `navBack: this._navBack` (or omit when empty) in
      `getDescriptor()`.
- [ ] **Restore**: in `PagesPersistenceModel.restorePage()`, seed
      `page._navBack` from `desc.navBack` and set `navBackCount` (add a small
      `PageModel.seedNavBack(entries)` setter rather than touching the private from
      outside). This restore path is shared by app-restart restore, `movePageIn`
      (window move), and `duplicatePage` — so persistence covers all three.

### 3. Markdown nav helper

`src/renderer/editors/markdown/markdown-nav.ts` (new)

- [ ] `isLocalMarkdownHref(href: string): boolean` — `isFileUrl(href)` **and** the
      path (after stripping `#`/`?` and `normalizeFileUrl`) ends with `.md` or
      `.markdown` (case-insensitive). Reuse `isFileUrl`/`normalizeFileUrl` from
      `content/link-utils.ts` and `fpExtname` from `core/utils/file-path`.
- [ ] (Detection only — the interceptor passes the original `file://` href to
      `openRawLink`; the file parser normalizes it.)

### 4. Click interceptor in `MarkdownBody`

`src/renderer/editors/markdown/MarkdownBody.tsx`

- [ ] Add `onClickCapture` to the `markdown-scroll` `<Panel>` (mirrors
      `ResourceContentView.onMarkdownClickCapture`).
- [ ] Handler:
  - `const anchor = (e.target as HTMLElement).closest("a"); if (!anchor) return;`
  - `const href = anchor.getAttribute("href") || ""; if (!isLocalMarkdownHref(href)) return;`
  - Ignore modified clicks (`e.metaKey || e.ctrlKey || e.shiftKey || e.altKey`) so
    "open in new tab"-style intent still falls through to default.
  - `const page = model.page; const pageId = page?.id; if (!pageId) return;`
  - `e.preventDefault(); e.stopPropagation();`
  - Push current doc: read current `{ filePath, title }` from `model.host.state.get()`;
    build the current `file://` href (e.g. `url.pathToFileURL` via `path-utils`, or
    keep the host filePath as the entry href — `openRawLink` accepts a plain path).
    `page.pushNavBack({ href: currentHref, title: currentTitle });`
  - `app.events.openRawLink.sendAsync(createLinkData(href, { pageId, target: "md-view", sourceId: "markdown-link" }));`
    (`sourceId` is provenance only — no longer used for history reset; keep it for
    consistency with the Explorer's `"explorer"` tag.)
- [ ] **Embedded guard**: only intercept in the full editor, not the notebook-embedded
      body. Gate on `editorConfig.maxEditorHeight === undefined` (the existing
      `embedded` flag) so embedded markdown keeps current behavior.

### 5. Back button on the Markdown header

`src/renderer/editors/markdown/index.tsx`

- [ ] In `MarkdownToolbarBits` (or a dedicated `MarkdownBackButton`), read
      `const navBackCount = useOptionalState(model.page?.state, s => s.navBackCount, 0);`
- [ ] Render an `IconButton` (`ArrowLeftIcon`, `title="Back"`) only when
      `navBackCount > 0`. Place it via `toolbarContributions` (left side) on
      `TextChrome` — add a `toolbarContributions` prop to the `MarkdownEditorView`
      `TextChrome` call (currently only `rightToolbarContributions` is passed).
- [ ] On click: call a `model.navigateBack()` (see step 6) — keeps the openRawLink
      wiring out of the view.

### 6. `MarkdownEditor.navigateBack()`

`src/renderer/editors/markdown/MarkdownEditor.ts`

- [ ] `navigateBack = (): void => { … }`:
  - `const page = this.page; const pageId = page?.id; if (!pageId) return;`
  - `const entry = page.popNavBack(); if (!entry) return;`
  - `app.events.openRawLink.sendAsync(createLinkData(entry.href, { pageId, target: "md-view" }));`
    (No push: Back goes straight through `openRawLink`, not the anchor interceptor.)
  - (Import `app`/`createLinkData` lazily if needed to avoid import cycles — match
    existing patterns.)

### 7. Verify build & lint

- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run lint` clean.

## Decisions (resolved)

1. **Force `target: "md-view"`** — **yes**. A clicked `.md` always stays in the
   rendered Preview.
2. **History clearing** — **do not clear**. History lives for the full life of the
   page. If testing later reveals a stale-Back problem, a clear hook can be added
   then. (No `clearNavBack` / open-handler reset in this task.)
3. **Forward button** — **no**. Out of scope.
4. **Persist history** — **yes**. Serialized into `PageDescriptor.navBack` so it
   survives app restart **and** moving the page to another Persephone window (window
   moves reuse the descriptor save/restore path).
5. **Mneme (`mneme://`) markdown docs** — **excluded** for now. v1 scopes to
   `file://` markdown; mneme in-page navigation is a possible follow-up.
6. **Existing-page dedupe vs in-place nav** — **accepted**. The in-place
   `navigatePageTo` path navigates the current page even if the target is already
   open elsewhere (matches the Explorer's in-place behavior).
7. **Modified-doc prompt** — **handled by the existing mechanism**. Markdown is a
   read-only preview, but the user can switch to Monaco, edit, and switch back — so a
   Markdown page CAN be modified. `navigatePageTo` already calls `confirmRelease` on
   the outgoing editor when it won't survive navigation, so the save prompt fires
   normally on in-place markdown navigation. **The Monaco↔Markdown switch itself is
   never recorded in history** (it goes through `switchMainEditor`, not the link
   interceptor) — see the design note above.

## Files changed

| File | Change |
|------|--------|
| `src/shared/persistence.ts` | Add `NavEntry` type + optional `PageDescriptor.navBack?` (additive; no schema bump) |
| `src/renderer/api/pages/PageModel.ts` | `IPageState.navBackCount`; `_navBack`; `pushNavBack`/`popNavBack`/`seedNavBack`; serialize in `getDescriptor()` |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Seed `navBack` from descriptor in `restorePage()` |
| `src/renderer/editors/markdown/markdown-nav.ts` (new) | `isLocalMarkdownHref(href)` helper |
| `src/renderer/editors/markdown/MarkdownBody.tsx` | `onClickCapture` interceptor → push + in-place `openRawLink` (full-editor only) |
| `src/renderer/editors/markdown/MarkdownEditor.ts` | `navigateBack()` |
| `src/renderer/editors/markdown/index.tsx` | Back `IconButton` via `TextChrome` `toolbarContributions` (shown when `navBackCount > 0`) |

### Files that need NO change

- `src/renderer/content/open-handler.ts`, `content/parsers.ts`, `content/resolvers.ts`
  — the existing `pageId` + `target` pipeline already does in-place navigation; the
  interceptor just feeds it. (No history-reset logic, per decision 2.)
- `src/renderer/api/pages/PagesLifecycleModel.ts` (`navigatePageTo`) — unchanged; the
  interceptor and Back both drive it via `openRawLink`.
- `src/main/open-window.ts` — non-markdown links keep flowing through `will-navigate`
  exactly as today.

## Acceptance criteria

- [ ] Clicking a relative/local **markdown** link in the Preview view replaces the
      **current page's** content with the target markdown (no new tab), staying in the
      Markdown view.
- [ ] After such a navigation, a **Back** button appears on the Markdown header;
      clicking it returns to the previous document. Repeated Back walks the stack to
      the original doc, then the button disappears (`navBackCount === 0`).
- [ ] Clicking a non-markdown file link, an `http(s)` link, an image, a `mailto:`, or
      an in-page `#anchor` behaves exactly as today (new tab / current behavior).
- [ ] Back history is per page, survives in-place editor swaps, and is **not** cleared
      by unrelated in-place navigation (history lives for the page's full life).
- [ ] Back history **survives app restart and moving the page to another Persephone
      window** (persisted in the page descriptor).
- [ ] Switching Monaco↔Markdown is **not** recorded in history; the Back button and
      its history reappear unchanged after switching back to Markdown.
- [ ] Notebook-embedded markdown is unaffected (no interception, no Back button).
- [ ] `tsc --noEmit` and `eslint` are clean.
