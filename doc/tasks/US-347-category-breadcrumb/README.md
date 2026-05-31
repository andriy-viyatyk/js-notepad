# US-347: CategoryView / CategoryEditor Breadcrumb

## Goal

Add a breadcrumb to the CategoryEditor toolbar that shows the folder path from the linked
TreeProvider's root down to the folder currently displayed in CategoryView. Each breadcrumb
segment is clickable and navigates the same category page to that ancestor folder.

## Background

### What CategoryEditor / CategoryView are

- **`CategoryEditor`** (`src/renderer/editors/category/CategoryEditor.tsx`) is a page editor
  (`editorId = "category-view"`). It finds a sibling tree-provider host editor (LinkEditor /
  ExplorerEditor / ArchiveEditor) on the same page, reads its `ITreeProvider`, and renders a
  `CategoryView` for one folder (`categoryPath`). Folder double-click fires
  `app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: hostId }))`, which
  **navigates the same page** to the child folder's `tree-category://` link (see `handleNavigate`,
  `CategoryEditor.tsx:97-102`).
- **`CategoryView`** (`src/renderer/components/tree-provider/CategoryView.tsx`) is the
  presentation: a search box + view-mode button in the toolbar (portaled via
  `toolbarPortalRef`), and a list/tiles body. It does **not** own a breadcrumb today.
- The current folder is encoded in the page's `tree-category://` link. `CategoryEditorModel`
  decodes it: `categoryPath` getter returns `decodedLink.category`; `decodedLink` returns
  `{ type, url, category }` (`CategoryEditorModel.ts:44-55`).

### The toolbar (where the breadcrumb goes)

`CategoryEditor` renders `PageToolbar`. `PageToolbar` lays out:
`NavPanelButton → children → <Spacer/> → rightContributions → SwitchWidget`
(`src/renderer/editors/base/PageToolbar.tsx:27-35`).

Today the search portal is passed as `rightContributions` (right side). The **breadcrumb should
be passed as `children`** so it sits on the **left**, mirroring how `LinkBreadcrumbBits` is the
left `toolbarContributions` in the standalone Link editor (`link-editor/index.tsx:193`).

### The existing UIKit Breadcrumb

`src/renderer/uikit/Breadcrumb/Breadcrumb.tsx` is a string-based breadcrumb:
- Props: `rootLabel`, `value: string`, `onChange(value: string)`, `separators` (default `"/\\"`),
  `separatorContent` (default `">"`), `size`.
- It splits `value` on `separators`, renders the root chip + one chip per segment, and on click
  calls `onChange` with the `/`-joined prefix of the clicked segment (root click → `onChange("")`).
- Already used by `LinkBreadcrumbBits` (`link-editor/index.tsx:58-97`) — so the component is the
  established pattern for this exact UI.

### TreeProvider category-path semantics (the crux)

The three providers do **not** use a single category-path convention. This is the central
complexity of the task:

| Provider | `rootPath` | `category` (the CategoryView prop) | folder navigation key |
|----------|-----------|-------------------------------------|-----------------------|
| **LinkTreeProvider** (`editors/link-editor/LinkTreeProvider.ts`) | `""` | **relative**, `/`-separated, e.g. `"Work/Docs"` | dir `item.href` = full relative category (`prefix + name`) |
| **ArchiveTreeProvider** (`content/tree-providers/ArchiveTreeProvider.ts`) | `""` | **relative** inner path, `/`-separated, e.g. `"src/utils"` | inner path `category + "/" + title` |
| **FileTreeProvider** (`content/tree-providers/FileTreeProvider.ts`) | `sourceUrl` (**absolute**) | **absolute** OS path, e.g. `D:\proj\src` | dir `item.href` = absolute child path |

All three encode folder navigation as
`encodeCategoryLink({ type, url: sourceUrl, category })` (`tree-provider-link.ts:19-23`), where
`category` is the **navigation key** for that folder.

So:
- The **path-from-root** displayed in the breadcrumb is the whole `category` for Link/Archive,
  but only the part of `category` **after `rootPath`** for File.
- The **navigation value** for an ancestor segment is the relative join for Link/Archive, and the
  absolute join (`rootPath` + segments) for File.
- The **root chip** navigates to `category = provider.rootPath` (`""` for Link/Archive, the
  absolute root for File).

### Root-chip label

`provider.displayName` is the natural root label:
- File → `path.basename(sourceUrl)` (folder name)
- Link → `fpBasename(sourceUrl)` or `"Links"`
- Archive → `path.basename(sourceUrl)` (archive file name)

## Implementation plan

The breadcrumb UI is uniform; only the **category ↔ segments** mapping is provider-specific. The
recommended design pushes that mapping into the provider via one new method, keeping
`CategoryEditor` provider-agnostic.

### Step 1 — Add `getCategorySegments` to the `ITreeProvider` contract

File: `src/renderer/api/types/io.tree.d.ts` (canonical type source; `assets/editor-types/` is
generated — never hand-edit, per project convention).

Add a small result type and an interface method:

```ts
/** One breadcrumb segment: a folder on the path from root to the current category. */
export interface ICategorySegment {
    /** Display label for the segment (folder name). */
    label: string;
    /** Category value to navigate to (pass to encodeCategoryLink as `category`). */
    category: string;
}
```

Add to `ITreeProvider` (near `getNavigationUrl`):

```ts
    /** Break a category path into ordered breadcrumb segments (root → leaf), EXCLUDING the
     *  root chip itself. Each segment's `category` can be fed to encodeCategoryLink({ category })
     *  to navigate there. Returns [] when `category` is the root. */
    getCategorySegments(category: string): ICategorySegment[];
```

> The method is **required** (not optional) so every provider owns its own path semantics and the
> editor never branches on provider type. All three current providers are updated in Step 2.

### Step 2 — Implement `getCategorySegments` in the three providers

Add a shared pure helper for the relative case so Link and Archive don't duplicate logic.

File: `src/renderer/content/tree-providers/tree-provider-link.ts` — add:

```ts
import type { ICategorySegment } from "../../api/types/io.tree";

/** Segment a `/`-separated RELATIVE category (Link, Archive). Root category is "". */
export function relativeCategorySegments(category: string): ICategorySegment[] {
    if (!category) return [];
    const parts = category.split("/").filter(Boolean);
    return parts.map((label, i) => ({
        label,
        category: parts.slice(0, i + 1).join("/"),
    }));
}
```

**LinkTreeProvider** (`editors/link-editor/LinkTreeProvider.ts`):

```ts
getCategorySegments(category: string): ICategorySegment[] {
    return relativeCategorySegments(category);
}
```

**ArchiveTreeProvider** (`content/tree-providers/ArchiveTreeProvider.ts`):

```ts
getCategorySegments(category: string): ICategorySegment[] {
    return relativeCategorySegments(category);
}
```

**FileTreeProvider** (`content/tree-providers/FileTreeProvider.ts`) — absolute category; strip the
root prefix for labels, but keep absolute paths as the navigation `category`:

```ts
getCategorySegments(category: string): ICategorySegment[] {
    const root = this.rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const cur = category.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!cur || cur === root) return [];
    const rel = cur.startsWith(root + "/") ? cur.slice(root.length + 1) : cur;
    const parts = rel.split("/").filter(Boolean);
    return parts.map((label, i) => ({
        label,
        // Absolute path of this ancestor. readdirSync accepts "/" on Windows,
        // so a "/"-joined absolute path is a valid navigation category.
        category: root + "/" + parts.slice(0, i + 1).join("/"),
    }));
}
```

> Note: FileTreeProvider stores `category` using `path.join` (OS separators, backslash on
> Windows). Navigating with a `"/"`-joined absolute path is safe because `list()` passes it
> straight to `readdirSync`, which accepts forward slashes on Windows. Verify during testing.

### Step 3 — Add opt-in start-clipping to the UIKit Breadcrumb

File: `src/renderer/uikit/Breadcrumb/Breadcrumb.tsx`.

The current `Breadcrumb` has **no overflow handling** — its `Root` is `display: flex;
align-items: center` and segments render at natural width (verified: no `overflow` / `maxWidth` /
`row-reverse` in the component). For deep category paths we want to clip the **start** (root side)
on overflow and keep the **end** (current folder) visible.

Add an **opt-in** prop so existing call sites (LinkBreadcrumbBits, BookmarksDrawer, notebook
TagsListView) are unaffected (default off):

```ts
    /** When true, the breadcrumb shrinks to fit its container and clips the START (root side)
     *  on overflow, keeping the trailing (current) segment visible. Default: false. */
    clipStart?: boolean;
```

Implement with the `flex-direction: row-reverse` technique (clips the start without breaking
left→right reading order):

- `Root` styled additions, gated on a `data-clip-start` attribute:
  ```ts
  '&[data-clip-start]': {
      overflow: "hidden",
      minWidth: 0,               // allow shrink inside a flex toolbar row
      flexDirection: "row-reverse",
      justifyContent: "flex-start",  // in row-reverse, packs to the visual right (the end)
      whiteSpace: "nowrap",
  },
  ```
- When `clipStart` is set, render the node list (root chip + interleaved separators + segment
  chips) in **reversed order** so that with `row-reverse` the visual order is still root → leaf
  and the overflow falls on the root (left) side. Build the children into an array, then
  `.reverse()` it when `clipStart`. Emit `data-clip-start={clipStart || undefined}` on `Root`.
- Add a `name`-style debug attr already exists; keep `data-type="breadcrumb"`.

> The current segment (leaf) stays fully visible; intermediate/root chips clip under an
> `overflow: hidden` edge. No middle-ellipsis (per agreed scope).

### Step 4 — Render the breadcrumb in CategoryEditor

File: `src/renderer/editors/category/CategoryEditor.tsx`.

1. Add imports:
   ```ts
   import { Breadcrumb } from "../../uikit/Breadcrumb";
   import { encodeCategoryLink } from "../../content/tree-providers/tree-provider-link";
   import type { ICategorySegment } from "../../api/types/io.tree";
   ```

2. Compute segments + the breadcrumb display value (memoized on `provider` + `categoryPath`):
   ```ts
   const segments = useMemo<ICategorySegment[]>(
       () => (provider ? provider.getCategorySegments(categoryPath) : []),
       [provider, categoryPath],
   );
   const breadcrumbValue = useMemo(
       () => segments.map((s) => s.label).join("/"),
       [segments],
   );
   ```

3. Navigation handler — build the `tree-category://` link for the clicked target and reuse the
   exact same `openRawLink` + `pageId` + `sourceId` mechanism as folder navigation:
   ```ts
   const handleBreadcrumbChange = useCallback((value: string) => {
       if (!provider) return;
       const count = value ? value.split("/").length : 0;
       // count === 0 → root chip → provider.rootPath; else the matching segment.
       const targetCategory = count === 0 ? provider.rootPath : segments[count - 1].category;
       const url = encodeCategoryLink({
           type: provider.type,
           url: provider.sourceUrl,
           category: targetCategory,
       });
       app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: hostId }));
   }, [provider, segments, pageId, hostId]);
   ```

4. Pass the breadcrumb as `PageToolbar` `children` (left side) via the existing `renderToolbar`
   helper. Update `renderToolbar` to accept left content, OR add the breadcrumb directly:
   ```tsx
   const renderToolbar = (children?: ReactNode) => (
       <PageToolbar name="category-toolbar" model={model} borderBottom rightContributions={children}>
           {provider && (
               <Breadcrumb
                   name="category-breadcrumb"
                   rootLabel={provider.displayName}
                   value={breadcrumbValue}
                   onChange={handleBreadcrumbChange}
                   separators="/"
                   size="sm"
                   clipStart
               />
           )}
       </PageToolbar>
   );
   ```
   (The search portal panel keeps being passed as the `children` argument of `renderToolbar`,
   which the helper forwards to `rightContributions`. `clipStart` lets the breadcrumb shrink
   within the toolbar row and clip the root side when the path is too long to fit.)

### Step 5 — Manual verification

Run the app (`npm start`) and test all three provider types (see Acceptance criteria).

## Concerns / Open questions

1. **Where should the category→segments mapping live? (please confirm)**
   - **Recommended (this plan):** a required `getCategorySegments` method on `ITreeProvider`,
     with a shared `relativeCategorySegments` helper for Link/Archive and a File-specific
     override. Clean: providers own their own path semantics; the editor never branches on type.
     Cost: touches the interface + all three providers.
   - **Lighter alternative:** compute segments entirely inside `CategoryEditor` using a heuristic
     — "if `provider.rootPath` is non-empty, treat `category` as absolute and strip the prefix;
     otherwise treat it as relative." No interface change, smaller diff. Risk: bakes provider
     semantics into the editor and is fragile if a future provider has a non-empty `rootPath`
     with relative categories.
   - **RESOLVED:** use the interface method (recommended). Confirmed by user.

2. **Windows separators in FileTreeProvider navigation.** Stored `category` uses backslashes
   (`path.join`), but the plan navigates with a `"/"`-joined absolute path. `readdirSync` accepts
   `/` on Windows, so this should work — but it must be verified on a real Windows folder with
   nested directories (this is the primary test risk).

3. **FileTreeProvider `..` entries vs breadcrumb.** The file provider injects a `".."` entry for
   parent navigation. The breadcrumb is an additional, complementary way to jump to any ancestor;
   the `".."` entry stays. No conflict, just noting both exist.

4. **Long paths / overflow. RESOLVED.** A deep folder path can exceed the toolbar width. The
   UIKit Breadcrumb has **no** overflow handling today (verified — no `overflow`/`row-reverse`/
   `maxWidth` in the component; the older pre-UIKit breadcrumb's clip logic was not carried over
   during EPIC-027/028). Per user: **clip the START (root side) on overflow, keep the END (current
   folder) visible; do NOT collapse middle segments.** Implemented as an opt-in `clipStart` prop on
   the UIKit Breadcrumb (Step 3) using the `flex-direction: row-reverse` + reversed-children +
   `overflow: hidden` + `min-width: 0` technique. Default off so existing call sites are unchanged.

5. **Selection state after breadcrumb navigation.** Folder double-click sets
   `host.selectionState.selectedHref = item.href` before navigating. Breadcrumb navigation has no
   item; the plan leaves selection untouched (the destination folder simply loads with whatever
   selection state exists). Acceptable; flag if you'd prefer it cleared.

6. **Root chip label for Link collections.** `LinkTreeProvider.displayName` is `fpBasename(sourceUrl)`
   or `"Links"`. For an unsaved/in-memory link collection `sourceUrl` may be empty → `"Links"`.
   Confirm that label is acceptable as the breadcrumb root.

## Acceptance criteria

- The CategoryEditor toolbar shows a breadcrumb on the **left**, with the provider's
  `displayName` as the root chip followed by one chip per folder from root → current folder.
- Clicking the **root chip** navigates the same page to the provider's root folder.
- Clicking any **intermediate chip** navigates the same page to that ancestor folder; the
  current (leaf) chip is non-clickable and visually marked current (existing Breadcrumb behavior).
- Works for all three provider types:
  - **Explorer / FileTreeProvider** — nested OS directories navigate correctly (incl. Windows).
  - **LinkEditor / LinkTreeProvider** — `/`-separated relative categories.
  - **Archive / ArchiveTreeProvider** — `/`-separated inner paths.
- The search box and view-mode button remain on the right and keep working.
- `npx tsc --noEmit` and `npm run lint` are clean.

## Files changed (planned)

| File | Change |
|------|--------|
| `src/renderer/api/types/io.tree.d.ts` | Add `ICategorySegment` type + required `getCategorySegments` method on `ITreeProvider` |
| `src/renderer/content/tree-providers/tree-provider-link.ts` | Add shared `relativeCategorySegments` helper |
| `src/renderer/content/tree-providers/FileTreeProvider.ts` | Implement `getCategorySegments` (absolute → relative labels, absolute nav categories) |
| `src/renderer/content/tree-providers/ArchiveTreeProvider.ts` | Implement `getCategorySegments` (relative) |
| `src/renderer/editors/link-editor/LinkTreeProvider.ts` | Implement `getCategorySegments` (relative) |
| `src/renderer/uikit/Breadcrumb/Breadcrumb.tsx` | Add opt-in `clipStart` prop (row-reverse start-clipping on overflow) |
| `src/renderer/editors/category/CategoryEditor.tsx` | Render `Breadcrumb` (with `clipStart`) as left toolbar content + navigation handler |

## Files that need NO changes

- `src/renderer/components/tree-provider/CategoryView.tsx` / `CategoryViewModel.tsx` — the
  breadcrumb lives in `CategoryEditor`'s toolbar, not in `CategoryView`. CategoryView already
  reloads when its `category` prop changes (`CategoryViewModel.setProps`), so page navigation
  refreshes the body automatically.
- `src/renderer/editors/category/CategoryEditorModel.ts` — `categoryPath` / `decodedLink` already
  expose everything needed.
- `tree-provider-link.ts` `encode/decodeCategoryLink` — reused as-is.
