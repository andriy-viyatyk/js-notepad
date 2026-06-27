# US-789: Header "snip" menu — quick screenshot to Image View

## Goal

Add a "..." (three-dot) menu button to the Persephone application header (just before the
"Mneme" activity indicator) offering two screen-snip actions. Unlike the Excalidraw editor's
existing "Screen Snip" (which always hides Persephone and inserts the result into the drawing),
these actions open the captured image in a new **Image View** page — where the user can copy it,
save it to a file, or open it in Excalidraw for editing (all existing Image View functionality):

- **Snip Screen** — hides the Persephone window(s), then snips the desktop.
- **Snip Persephone** — keeps the Persephone window visible, so the user can snip part of an
  image / web page / anything shown *inside* Persephone.

## Background

### Existing snip pipeline (reused as-is, with one signature change)

The screen-snip feature already exists end-to-end; it is currently only wired to the Excalidraw
editor toolbar. The full chain:

| Layer | File | Current behavior |
|-------|------|------------------|
| Rust tool | `snip-tool/src/main.rs` | Captures **all monitors first** (`capture_monitors`), **then** shows the selection overlay over the frozen capture, writes the cropped PNG to stdout. |
| Main service | `src/main/snip-service.ts` → `startScreenSnip()` | **Always** `openWindows.hideWindows()` → 200 ms wait → spawn the exe → `nativeImage` → return `img.toDataURL()`; `openWindows.showWindows()` in `finally`. |
| IPC enum + sig | `src/ipc/api-types.ts` | `Endpoint.startScreenSnip`; `[Endpoint.startScreenSnip]: () => Promise<string \| null>` |
| Main controller | `src/ipc/main/controller.ts:237` | `startScreenSnip = async () => { const { startScreenSnip } = await import("../../main/snip-service"); return startScreenSnip(); }` + `bindEndpoint(Endpoint.startScreenSnip, …)` |
| Renderer API | `src/ipc/renderer/api.ts:243` | `startScreenSnip = async () => executeOnce<string \| null>(Endpoint.startScreenSnip)` |
| Consumer | `src/renderer/editors/draw/index.tsx:59` | `handleScreenSnip` → `api.startScreenSnip()` → `addFiles` into Excalidraw |

**Key insight (why "keep Persephone visible" works):** the Rust tool snapshots the screen *before*
the overlay is shown (main.rs steps 2 → 3). So when we *don't* hide Persephone, the capture
contains the live Persephone window, and the user selects a region of that frozen snapshot. No tool
changes are needed — we only need a way to **not** hide the windows.

`executeOnce`/`bindEndpoint` already support multi-arg endpoints (see `createVideoStreamSession`),
so threading a `hideWindows: boolean` parameter through the chain is straightforward.

### Opening an image in Image View (reused, matches the user's P.S.)

`pagesModel.openImageInNewTab(imageUrl, title?)`
(`src/renderer/api/pages/PagesLifecycleModel.ts:1187`) opens a new Image View page for a URL.
It special-cases `blob:` URLs by calling `imgModel.cacheBlobUrl(blobUrl)` after `addPage`, so a
blob-backed image **survives an app restart** (cached to disk). This is the same Image View the
clipboard-paste path uses (the user's P.S.: copy an image → Ctrl+V → opens in Image Viewer), so
reusing `openImageInNewTab` gives identical behavior.

The Excalidraw "Open in new tab" path already does exactly this for a captured/exported image:
`exportAsPngBlob` → `URL.createObjectURL(blob)` → `pagesModel.openImageInNewTab(blobUrl)`
(`draw/index.tsx:150`). The snip service returns a **data URL**, so we convert it to a blob URL
the same way before calling `openImageInNewTab` (avoids persisting a huge `data:` string in the
page descriptor, and gets the `cacheBlobUrl` restart-recovery treatment for free).

### Header / Mneme indicator

`src/renderer/ui/app/MainPage.tsx` renders the header. The bottom-right `.status-indicators`
absolute strip (AppRoot styled block at ~line 133) currently contains `<MnemeIndicator />`
followed by the conditional `.mcp-indicator`. `MnemeIndicator` (line 257) is a small
`fontSize: 9` clickable label. The new "..." trigger goes **first** inside `.status-indicators`,
before `<MnemeIndicator />`.

`MainPage.tsx` is application chrome (`src/renderer/ui/`), so per the UIKit Rule 7 chrome
exception it may use `@emotion` + plain `<button className>` for its own elements, but must use
UIKit components (`WithMenu`, etc.) for primitives. The header already uses plain
`<button className="system-button">` elements — the snip trigger follows that precedent.

### Icons

`src/renderer/theme/icons.tsx` has `SnipIcon` (line 1344) and `MoreVertIcon` (line 1462, three
**vertical** dots). There is **no** horizontal three-dot icon. The user drew "..." (horizontal),
so add a `MoreHorizIcon` mirroring `MoreVertIcon` with the circles laid out horizontally.

### `WithMenu` API

`src/renderer/uikit/Menu/WithMenu.tsx` — render-prop trigger:
`<WithMenu name items placement?>{(setOpen) => <trigger onClick={e => setOpen(e.currentTarget)} />}</WithMenu>`.
`items: MenuItem[]` (label / onClick / optional icon). Default placement `bottom-start`.

## Implementation plan

### Step 1 — Add `hideWindows` param through the snip IPC chain

1. **`src/ipc/api-types.ts`** — change the signature:
   ```ts
   [Endpoint.startScreenSnip]: (hideWindows: boolean) => Promise<string | null>;
   ```
2. **`src/ipc/renderer/api.ts:243`**:
   ```ts
   startScreenSnip = async (hideWindows: boolean): Promise<string | null> => {
       return executeOnce<string | null>(Endpoint.startScreenSnip, hideWindows);
   };
   ```
3. **`src/ipc/main/controller.ts:237`**:
   ```ts
   startScreenSnip = async (hideWindows: boolean): Promise<string | null> => {
       const { startScreenSnip } = await import("../../main/snip-service");
       return startScreenSnip(hideWindows);
   };
   ```
4. **`src/main/snip-service.ts`** — gate hide/show on the param:
   ```ts
   export async function startScreenSnip(hideWindows: boolean): Promise<string | null> {
       const snipExe = getSnipToolPath();
       if (hideWindows) {
           openWindows.hideWindows();
           // Give Windows time to fully hide the app windows and repaint the desktop.
           await new Promise((r) => setTimeout(r, 200));
       }
       try {
           // …spawn + capture unchanged…
       } finally {
           if (hideWindows) openWindows.showWindows();
       }
   }
   ```

### Step 2 — Update the existing Excalidraw consumer

5. **`src/renderer/editors/draw/index.tsx:62`** — `handleScreenSnip` keeps the hide behavior:
   `const dataUrl = await api.startScreenSnip(true);`

### Step 3 — Add `MoreHorizIcon`

6. **`src/renderer/theme/icons.tsx`** (next to `MoreVertIcon`):
   ```tsx
   export const MoreHorizIcon = createIcon(24)(
       <>
           <circle cx="6" cy="12" r="1.5" fill="currentColor" />
           <circle cx="12" cy="12" r="1.5" fill="currentColor" />
           <circle cx="18" cy="12" r="1.5" fill="currentColor" />
       </>,
   );
   ```

### Step 4 — Add the header menu

7. **`src/renderer/ui/app/MainPage.tsx`**:
   - Import `WithMenu` + `MenuItem` from `uikit/Menu`, `MoreHorizIcon` + `SnipIcon` from
     `theme/icons`, `api` from `ipc/renderer/api`.
   - New module-level helper to run a snip and open the result:
     ```ts
     async function runSnip(hideWindows: boolean): Promise<void> {
         const dataUrl = await api.startScreenSnip(hideWindows);
         if (!dataUrl) return;                        // cancelled / failed
         const blob = await (await fetch(dataUrl)).blob();
         const blobUrl = URL.createObjectURL(blob);
         await pagesModel.openImageInNewTab(blobUrl, "Snip");
     }
     ```
     (`fetch(dataUrl)` on a `data:` URL synchronously resolves to the bytes — no network.)
   - A small `<SnipMenu />` component rendering the trigger + menu:
     ```tsx
     const items: MenuItem[] = [
         { label: "Snip Screen", icon: <SnipIcon />, onClick: () => void runSnip(true) },
         { label: "Snip Persephone", icon: <SnipIcon />, onClick: () => void runSnip(false) },
     ];
     return (
         <WithMenu name="header-snip" items={items} placement="bottom-end">
             {(setOpen) => (
                 <button
                     type="button"
                     data-name="header-snip-button"
                     className="snip-indicator"
                     title="Snip screen or Persephone window"
                     onClick={(e) => setOpen(e.currentTarget)}
                 >
                     <MoreHorizIcon width={14} height={14} />
                 </button>
             )}
         </WithMenu>
     );
     ```
   - Render `<SnipMenu />` as the **first** child of `.status-indicators`, before `<MnemeIndicator />`.
   - Add a `.snip-indicator` style block in the `AppRoot` styled (alongside `.mcp-indicator,
     .mneme-indicator`): **accented green** icon — `color: color.misc.green` (the same green the
     MCP/Mneme "active" dots use), `opacity: 0.85`, hover `opacity: 1` + `cursor: pointer`;
     `display: flex`, `alignItems: center`, no button chrome (`background: transparent`,
     `border: none`, `padding: 0`). The `MoreHorizIcon` uses `currentColor`, so it inherits the
     green; do **not** pass a hardcoded color to the icon.

## Concerns / open questions

1. **Menu item naming (RESOLVED).** Confirmed by user:
   - **"Snip Screen"** — hides Persephone, snips the desktop.
   - **"Snip Persephone"** — keeps Persephone visible, snips its content.

2. **Icon: horizontal dots (RESOLVED).** Use a horizontal three-dot `MoreHorizIcon` (step 3) —
   `MoreVertIcon` (vertical) is ruled out because the `.status-indicators` strip is only ~8–10 px
   tall, too short for stacked vertical dots. Rendered small (`width/height={14}`) it reads as the
   "…" glyph the user drew. (A plain text "…" label is an acceptable fallback if the icon ever
   looks off at this size, but the icon is the chosen approach.)

3. **Placement + accent (RESOLVED).** Trigger sits inside `.status-indicators` (the small
   bottom-right indicator strip) as the first child, before the Mneme indicator. Rendered as an
   **accented green** "…" glyph (`color.misc.green`) — deliberately more prominent than the muted
   gray Mneme/MCP indicators, so it reads as an active affordance.

4. **"Snip Persephone" multi-window (RESOLVED).** `hideWindows: false` means the service makes
   **no** `hideWindows`/`showWindows` calls at all — every Persephone window is left exactly as-is.
   The capture includes whichever windows are on screen (expected); the snip overlay covers all
   monitors regardless. No special multi-window handling needed.

5. **No data-URL persistence bloat.** We convert the returned data URL to a blob URL before
   `openImageInNewTab`, so the (potentially large) `data:` string is never written into the page
   descriptor; `getRestoreData` strips `blob:` URLs and `cacheBlobUrl` handles restart recovery.

## Files that need NO changes

- `snip-tool/**` (Rust) — capture-then-overlay flow already supports both modes; no rebuild needed.
- `src/main/open-windows.ts` — `hideWindows`/`showWindows` already exist and are called only when requested.
- `src/renderer/editors/image/**` — Image View already handles blob URLs (copy / save / open-in-Excalidraw).
- `src/renderer/api/pages/PagesLifecycleModel.ts` — `openImageInNewTab` reused unchanged.

## Acceptance criteria

- A "…" button appears in the header immediately before the Mneme indicator.
- Clicking it opens a menu with two items (final names per Concern 1).
- **Snip Screen:** Persephone hides, the snip overlay appears; after selecting a region, Persephone
  reappears and a new Image View page opens with the captured PNG.
- **Snip Persephone:** Persephone stays visible; the snip overlay appears over it; selecting a
  region of the Persephone window opens that capture in a new Image View page.
- Cancelling the snip (Esc / right-click in the tool) opens no page and restores windows.
- The opened Image View supports copy-to-clipboard, save-to-file, and open-in-Excalidraw.
- The Excalidraw editor's existing "Screen Snip" button still hides Persephone and inserts into the drawing.
- `tsc --noEmit` + `eslint` clean.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/ipc/api-types.ts` | `startScreenSnip` signature gains `hideWindows: boolean` |
| `src/ipc/renderer/api.ts` | pass `hideWindows` through `executeOnce` |
| `src/ipc/main/controller.ts` | pass `hideWindows` to the service |
| `src/main/snip-service.ts` | gate hide/show on `hideWindows` |
| `src/renderer/editors/draw/index.tsx` | call `startScreenSnip(true)` (preserve current behavior) |
| `src/renderer/theme/icons.tsx` | add `MoreHorizIcon` |
| `src/renderer/ui/app/MainPage.tsx` | add `SnipMenu` (WithMenu + trigger) in `.status-indicators`; `runSnip` helper; `.snip-indicator` style |
