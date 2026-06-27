# US-792: Mermaid — "Convert to Excalidraw" (editable elements)

## Goal

Add a new **"Convert to Excalidraw"** toolbar button to the Mermaid viewer that converts the diagram into **native, individually-editable Excalidraw elements** (rectangles, arrows, text, …) using the official `@excalidraw/mermaid-to-excalidraw` library — instead of the flat single-image embed produced by the existing **"Open in Drawing Editor"** button. Both buttons coexist; the new one is preferred for supported diagram types and falls back to the image embed for unsupported ones.

## Background

### Current "Open in Drawing Editor" flow (image embed)

`src/renderer/editors/mermaid/index.tsx:27` — `onOpenDraw`:
1. Reads the rendered SVG from `model.state.get().svgUrl` (a `data:image/svg+xml,<percent-encoded>` URL).
2. Decodes it, re-encodes as base64.
3. `getImageDimensions(dataUrl)` → natural size.
4. `buildExcalidrawJsonWithImage(dataUrl, "image/svg+xml", w, h)` (`src/renderer/editors/draw/drawExport.ts:113`) → Excalidraw scene JSON containing **one `image` element**.
5. `pagesModel.addEditorPage("draw-view", "json", title, json)` opens a Draw editor page.

Result: a single non-editable picture. The user can move/resize the whole thing but not the individual shapes.

### The library

`@excalidraw/mermaid-to-excalidraw` is the **official** Excalidraw package (powers Excalidraw's own "Mermaid to Excalidraw" insert). API:

```ts
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

const { elements: skeleton, files } = await parseMermaidToExcalidraw(mermaidSource, {
    themeVariables: { fontSize: "16px" }, // optional
});
const elements = convertToExcalidrawElements(skeleton); // → real OrderedExcalidrawElement[]
```

- Output elements are **native, individually editable** Excalidraw elements.
- `files` is a `BinaryFiles`-shaped map (present when the diagram contains images / unsupported sub-parts rendered as images).
- **One-way** conversion — edited shapes do not round-trip back to Mermaid.

### Important: supported diagram types

The library only emits native shapes for **flowchart**, **sequence**, and **class** diagrams. For every other type (state, gantt, pie, ER, mindmap, gitgraph, …) it renders an **SVG image** and returns it as a single image element in `files` + a matching `image` skeleton — i.e. effectively the same as today's behavior. So "Convert" degrades gracefully but is only an *upgrade* for the three supported types.

### Dependencies already present

- `@excalidraw/excalidraw@^0.18.0` — `package.json:56`. `convertToExcalidrawElements` is already imported in `drawExport.ts:1`.
- `mermaid@^11.12.2` — `package.json:75`. **Note:** `@excalidraw/mermaid-to-excalidraw` bundles its **own** mermaid internally; it does not use the app's mermaid. This is expected (Excalidraw ships it this way) but means a second mermaid copy in the bundle.
- **Missing:** `@excalidraw/mermaid-to-excalidraw` — must be added to `package.json` dependencies.

### Excalidraw scene JSON shape (target output)

Produced today by `buildExcalidrawJsonWithImage` and parsed by `DrawEditor.parseContent` (`DrawEditor.ts:285`):

```json
{ "type": "excalidraw", "version": 2, "source": "persephone",
  "elements": [...], "appState": { "currentItemFontFamily": <Helvetica> }, "files": { ... } }
```

The new path builds the same envelope but with the converted `elements` + `files`.

### Mermaid source location

The raw Mermaid text is the host content: `model.host?.state.get().content`. (`svgUrl` is the *rendered* output and is NOT the input to `parseMermaidToExcalidraw`.)

## Implementation plan

### Step 1 — Add the dependency

`package.json` dependencies: add `"@excalidraw/mermaid-to-excalidraw"` at a version compatible with `@excalidraw/excalidraw@0.18.x`. Pin to a known-good `^1.1.x` (verify against the installed excalidraw at implementation time). Run `npm install`.

### Step 2 — New builder in `drawExport.ts`

Add `buildExcalidrawJsonFromMermaid(mermaidSource: string): Promise<string>` next to `buildExcalidrawJsonWithImage` (`src/renderer/editors/draw/drawExport.ts`):

```ts
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
// convertToExcalidrawElements + FONT_FAMILY already imported

/**
 * Convert Mermaid source into Excalidraw scene JSON containing native,
 * individually-editable elements. Throws if the source is empty or Mermaid
 * fails to parse — caller decides whether to fall back to the image embed.
 */
export async function buildExcalidrawJsonFromMermaid(mermaidSource: string): Promise<string> {
    const { elements: skeleton, files } = await parseMermaidToExcalidraw(mermaidSource);
    const elements = convertToExcalidrawElements(skeleton);
    return JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "persephone",
        elements,
        appState: { currentItemFontFamily: FONT_FAMILY.Helvetica },
        files: files ?? {},
    });
}
```

(Confirm the `files` value shape matches the scene `files` map; `parseMermaidToExcalidraw` returns files already keyed by id. If the key/shape differs from what `DrawEditor.parseContent` expects, normalize here.)

### Step 3 — Toolbar button + handler in `mermaid/index.tsx`

In `MermaidToolbarBits` (`src/renderer/editors/mermaid/index.tsx`):

- Import `buildExcalidrawJsonFromMermaid` from `../draw/drawExport` and a suitable icon. Existing button uses `DrawIcon` (from `../../theme/language-icons`). Pick a **distinct** icon for the new button so the two are visually separable — e.g. a "transform/shapes" icon. Check `theme/icons.tsx` for an existing fit (e.g. a shapes/convert glyph); if none fits, add one (follow icon authoring rules; `currentColor`). Decide final icon during implementation.
- Add `onConvertToExcalidraw`:

```ts
const onConvertToExcalidraw = async () => {
    const source = model.host?.state.get().content?.trim();
    if (!source) return;
    const title = (model.host?.state.get().title ?? "Mermaid").replace(/\.\w+$/, "") + ".excalidraw";
    try {
        const json = await buildExcalidrawJsonFromMermaid(source);
        pagesModel.addEditorPage("draw-view", "json", title, json);
    } catch (err) {
        // Fallback: unsupported diagram type or parse failure → image embed (existing path)
        ui.notify(
            "This diagram type can't be converted to editable shapes — opening as an image instead.",
            "info",
        );
        await onOpenDraw();
    }
};
```

- Add the `IconButton` to the toolbar fragment, between the theme toggle and the existing "Open in Drawing Editor" button (or immediately after it — final order decided during implementation):

```tsx
<IconButton
    name="mermaid-convert-excalidraw"
    size="sm"
    title="Convert to Excalidraw"
    disabled={!svgUrl}
    onClick={onConvertToExcalidraw}
    icon={<ConvertToShapesIcon />}
/>
```

- Keep the existing `mermaid-open-draw` button ("Open in Drawing Editor") unchanged.
- Add `ui` import (`../../api/ui`) for the fallback notify if not already present.

Gating: `disabled={!svgUrl}` mirrors the existing buttons (a rendered diagram implies parseable source). The handler still re-reads host content as the conversion input.

### Step 4 — Verify the round-trip

Opened page is a normal `draw-view` editor; `DrawEditor.parseContent` reads `elements`/`appState`/`files` from the JSON. Converted elements should be selectable/movable immediately. No DrawEditor changes expected.

## Concerns / Open questions

1. **Bundled mermaid duplication** — `@excalidraw/mermaid-to-excalidraw` ships its own mermaid; the bundle will contain two mermaid copies (the app's `mermaid@11` + the library's). Acceptable (Excalidraw does the same) but worth noting for bundle size. No action unless it breaks the build.
2. **Version compatibility** — the library's element-skeleton output must match what `@excalidraw/excalidraw@0.18.0`'s `convertToExcalidrawElements` accepts. Verify the chosen library version against the installed excalidraw before pinning. **Resolved approach:** pick the library release published alongside excalidraw 0.18.x.
3. **Unsupported diagram fallback** — handled by try/catch → `onOpenDraw()` image embed + an info notify. Confirm `parseMermaidToExcalidraw` actually *throws* (vs. returning an image element) for unsupported types in the chosen version; if it returns an image silently, the "editable" promise quietly degrades with no notify. Decide during implementation whether to inspect the result (e.g. all elements are `type: "image"`) and notify accordingly.
4. **Icon choice** — needs a distinct glyph from `DrawIcon` so the two toolbar buttons read differently. Final glyph TBD during implementation (prefer an existing icon; add one only if necessary).
5. **Theme/colors** — converted shapes use Excalidraw's default styling, not the Mermaid light/dark theme. This is expected for the editable path (the user restyles in Excalidraw). The image-embed path keeps honoring `lightMode`.

## Acceptance criteria

- [x] `@excalidraw/mermaid-to-excalidraw` added to `package.json` and installed (`^2.2.2`).
- [x] A new **"Convert to Excalidraw"** toolbar button appears in the Mermaid viewer, visually distinct from "Open in Drawing Editor" (green pencil glyph via `DrawGreenIcon`).
- [ ] Clicking it on a **flowchart / sequence / class** diagram opens a Draw editor page whose shapes are **individually selectable and editable**. *(manual test)*
- [x] Clicking it on an **unsupported** diagram type returns an image-only scene → notifies "opened as an image"; a parse failure falls back to the rendered-SVG embed + notify.
- [x] The existing "Open in Drawing Editor" (image embed) button is unchanged and still works.
- [x] `npm run lint` clean; `tsc --noEmit` clean (0 errors). Production build / dual-mermaid runtime — *verify in manual test*.

## Implementation notes

- Library installed at `^2.2.2`. API confirmed: `parseMermaidToExcalidraw(definition, { themeVariables: { fontSize } })` → `{ elements: skeleton[], files? }`.
- **Concern #3 resolved as:** the library does **not** throw for unsupported diagram types — it auto-returns a single rendered-image element. So `buildExcalidrawJsonFromMermaid` returns `{ json, imageOnly }`; `imageOnly` (all elements `type: "image"`) drives an info notify. The `try/catch` only catches genuine Mermaid parse failures → falls back to `onOpenDraw()` (rendered-SVG embed).
- **Icon:** `DrawOrangeIcon` = same pencil glyph as `DrawIcon`, tinted with a new `color.misc.orange` token (added to `color.ts` + all 9 theme files; palette-fitting oranges where a theme defines one — monokai `#fd971f`, solarized `#cb4b16`). Orange chosen over green because green read too close to the cyan `DrawIcon`.
- **Font:** converted text forced to `FONT_FAMILY.Helvetica` on the skeleton before conversion (Excalidraw's default hand-drawn Excalifont was unwanted). Covers standalone text + container/arrow labels.

## Files changed (summary)

| File | Change |
|------|--------|
| `package.json` | Add `@excalidraw/mermaid-to-excalidraw` dependency |
| `src/renderer/editors/draw/drawExport.ts` | Add `buildExcalidrawJsonFromMermaid(mermaidSource)` |
| `src/renderer/editors/mermaid/index.tsx` | New "Convert to Excalidraw" `IconButton` + `onConvertToExcalidraw` handler (with image-embed fallback); `ui` import |
| `src/renderer/theme/icons.tsx` | (Only if needed) add a distinct convert/shapes icon |

### Files that need NO changes

- `src/renderer/editors/draw/DrawEditor.ts` — consumes the same scene JSON envelope; no changes.
- `src/renderer/editors/mermaid/MermaidEditor.ts` — source already exposed via `model.host`.
- `src/renderer/api/pages/PagesLifecycleModel.ts` / `PagesModel.ts` — `addEditorPage` used as-is.
