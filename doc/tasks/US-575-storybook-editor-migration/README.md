# US-575: Storybook editor migration

**Epic:** [EPIC-028 — Unified Editor Architecture](../../epics/EPIC-028.md) · Phase C · walkthrough 30 closure (no-host group)
**Status:** Investigation complete 2026-05-27 — ready for implementation
**Reference walkthrough:** [30-no-host-group.md](../../epics/EPIC-028-editor-architecture/walkthroughs/30-no-host-group.md) (row "Storybook")

---

## Goal

Migrate the Storybook page from a legacy `EditorModel` (wrapped at runtime in
`LegacyEditorAdapter`) to a native v4 `EditorModel` subclass, following the no-host
template established by Browser (US-558) / PDF (US-568) / Image (US-569) / Archive
(US-570) / Video (US-571) and the singleton pair Settings (US-572) / About (US-573),
plus the in-place re-parent decision from MCP Inspector (US-574). **Ninth no-host
page-mainEditor v4-native migration.**

---

## Background

### What Storybook is

A standalone, developer-only page editor (`editorType: "storybookPage"`, registry id
`"storybook-view"`, `category: "standalone"`) with **no file association**
(`acceptFile` absent). It is a UIKit component gallery: a left **ComponentBrowser**
(story list), a center **LivePreview** (renders the selected story with current
prop values + injected background), and a right **PropertyEditor** (live prop controls).
Stories are registered in `storyRegistry.ts` via `*.story.tsx` files across `uikit/`.

Opened only via `pagesModel.showStorybookPage()` (→ `lifecycle.showStorybookPage`),
wired to the sidebar **Tools → Storybook** entry (`tools-editors-registry.ts:140`).
It is a **singleton well-known page** (fixed id `STORYBOOK_PAGE_ID = "storybook-page"`),
exactly like Settings/About — the launcher builds an explicit `new PageModel(STORYBOOK_PAGE_ID)`.

### Current shape (legacy)

- **`StorybookEditorModel.ts`** — class `StorybookEditorModel extends EditorModel<StorybookEditorState, void>`
  (legacy base from `../base`). Unlike Settings/About (identity-only state), Storybook
  carries **real persisted UI state** on `StorybookEditorState`:
  - `selectedStoryId: string`
  - `propValues: Record<string, unknown>`
  - `previewBackground: "default" | "light" | "dark"`
  - `leftPanelWidth: number`, `rightPanelWidth: number`
  - **No transient runtime fields** — every state field is persist-worthy (contrast
    MCP/Video, which reset connection/playback fields in `getRestoreData`).
  - **No instance fields beyond `state`** — no connection manager, no sub-state stores,
    no history (contrast MCP). Action methods (`selectStory`, `setPropValue`, `resetProps`,
    `setPreviewBackground`, `setLeftPanelWidth`, `setRightPanelWidth`) are pure
    `this.state.update(...)` mutations.
  - **`noLanguage = true`**, **`skipSave = true`**.
  - **No `getIcon`** — Storybook has **no tab icon** (like Settings/About; unlike MCP/Video).
  - **No `getRestoreData` / `applyRestoreData` / `restore` / `dispose` overrides** — pure
    inheritance from the legacy base.
  - Helper `buildInitialProps(story)` and a re-export of `Story`/`PropDef` types live in
    the same file.
- **`StorybookEditorView.tsx`** — the React view (`StorybookEditorView({ model })`,
  genuinely model-driven). Holds the legacy `storybookEditorModule` default export
  (`Editor: StorybookEditorView as any` + `newEditorModel` / `newEmptyEditorModel` /
  `newEditorModelFromState`). Re-exports `STORYBOOK_PAGE_ID`. Sub-components:
  `ComponentBrowser`, `LivePreview`, `PropertyEditor` (each takes `model: StorybookEditorModel`).
- **No `index.ts` / `index.tsx`** in `editors/storybook/` (verified — Glob returns none).
  External consumers import `./storybook/StorybookEditorView` (launcher) or
  `./storybook/storyTypes` / `./storybook/iconPresets` (the `*.story.tsx` files). **No
  consumer imports a bare folder/barrel.**
- **Registration** (`register-editors.ts:690`): legacy def `storybook-view` `loadModule`
  imports `./storybook/StorybookEditorView` and returns `module.default`. The v4 mirror
  loop (line 835) currently registers `storybook-view` as a bare-adapter stub
  (`hasContentHost: false`, not yet migrated).

### Scripting facade (none — no change)

There is **no** `asStorybook()` facade (verified: no match in `src/renderer/scripting`).
Storybook is not script-addressable. No facade / `PageWrapper` / `mcp-handler` changes.

### Infrastructure already in place (US-568)

- **PD-IMPL11** — `V4_NO_HOST_EDITOR_IDS` in `PagesPersistenceModel.ts:50`. Adding
  `"storybook-view"` routes restore through the generic v4-native no-host branch
  (`editorRegistry.createEditor` → `Object.assign(state, d.state)` → `applyRestoreData` →
  `restore`). Because `Object.assign(s, d.state)` copies **all** persisted state fields
  (`selectedStoryId`/`propValues`/`previewBackground`/`leftPanelWidth`/`rightPanelWidth`)
  onto the freshly-created default state, full UI state is restored with **no**
  `applyRestoreData` override required.
- **PD-IMPL16** — `wrapLegacyForPage`'s `if (legacy instanceof V4EditorModel) return legacy`
  early-return. The preserved legacy module factory returns a v4 `StorybookEditorModel`
  cast as legacy; `wrap()` returns it unwrapped (no adapter).
- **Backward compat** — `deriveEditorId({ type: "storybookPage" })` === `"storybook-view"`
  (legacy registry def `editorType: "storybookPage"` → id `"storybook-view"`), so sessions
  persisted while Storybook was adapter-wrapped already carry `editorId: "storybook-view"`
  and restore cleanly through the new branch.
- **Base `getRestoreData()`** (`base/v4/EditorModel.ts:309`) already returns
  `{ editorId, id, state }` with the full `state` — exactly what Storybook needs. No override.

---

## Implementation plan

Closest sibling structurally is **About (US-573)**: a singleton no-host editor opened by a
dedicated launcher with a fixed page id, no toolbar, no nav-panel, no facade, no icon. The
difference from About is that Storybook has **real persisted state** (which the base
`getRestoreData` already serializes — no extra work) and its model **already lives in its
own `.ts` file** (`StorybookEditorModel.ts`), so — like MCP (US-574, MC-C1) — there is **no
file/class rename and no compatibility alias**; we re-parent the existing class in place.

### SB-IMPL1 — Re-parent the model to the v4 base (`StorybookEditorModel.ts`)

- Change the import from the legacy base to the v4 base:
  - `import { getDefaultEditorModelState, EditorModel } from "../base";` →
    `import { EditorModel as V4EditorModel, type EditorStateBase } from "../base/v4/EditorModel";`
  - (No `RestoreData` / `EditorDescriptor` import — no persistence overrides; see SB-C2.)
- `StorybookEditorState extends IEditorState` → `extends EditorStateBase`. Add an explicit
  discriminator (mirror About/MCP):
  ```ts
  export interface StorybookEditorState extends EditorStateBase {
      /** Discriminator — preserved for `deriveEditorId` and pre-US-575 saved
       *  descriptors. `deriveEditorId({type:"storybookPage"})` === "storybook-view". */
      type: "storybookPage";
      selectedStoryId: string;
      propValues: Record<string, unknown>;
      previewBackground: PreviewBackground;
      leftPanelWidth: number;
      rightPanelWidth: number;
  }
  ```
  (`IEditorState` import is no longer needed in this file — remove it.)
- `getDefaultStorybookEditorState()`: replace the `...getDefaultEditorModelState()` spread
  with explicit identity fields (mirror About), keeping all Storybook-specific defaults:
  ```ts
  export const getDefaultStorybookEditorState = (): StorybookEditorState => {
      const first = ALL_STORIES[0];
      return {
          id: STORYBOOK_PAGE_ID,
          title: "Storybook",
          modified: false,
          type: "storybookPage",
          editor: "storybook-view",
          selectedStoryId: first?.id ?? "",
          propValues: first ? buildInitialProps(first) : {},
          previewBackground: "light",
          leftPanelWidth: 200,
          rightPanelWidth: 280,
      };
  };
  ```
- Class declaration: `class StorybookEditorModel extends V4EditorModel<StorybookEditorState>`
  (drop the legacy `, void` second generic — the v4 base defaults `R = unknown`).
- Add `readonly editorId = "storybook-view";` (v4 identity — required abstract member).
- Keep `noLanguage = true; skipSave = true;` and **all** action methods **verbatim**.
- **No** `getRestoreData` / `applyRestoreData` / `restore` / `dispose` overrides — the v4
  base defaults are correct (SB-C2).
- Keep the `buildInitialProps` helper and the `export type { Story, PropDef }` re-export.

### SB-IMPL2 — Preserve the legacy module shim in the view (`StorybookEditorView.tsx`)

- No change to the `StorybookEditorView` component body.
- Add `import type { EditorModel } from "../base";` (legacy type for the casts).
- The `storybookEditorModule` default export stays, but its factories now construct a v4
  editor cast as legacy (mirror About AB-IMPL / MCP MC-IMPL3):
  - `Editor: StorybookEditorView as unknown as EditorModule["Editor"]` (replace `as any`),
  - `newEditorModel` / `newEmptyEditorModel` / `newEditorModelFromState` →
    `new StorybookEditorModel(new TComponentState(...)) as unknown as EditorModel`.
- Add `export { StorybookEditorView };` (named export so `index.tsx` can import it — today
  it is a local function).
- Keep `export default storybookEditorModule;` and `export { STORYBOOK_PAGE_ID };`.

### SB-IMPL3 — New `index.tsx` (no delete)

Create `src/renderer/editors/storybook/index.tsx` (mirror `about/index.tsx`):

```tsx
import { TComponentState } from "../../core/state/state";
import { StorybookEditorModel, getDefaultStorybookEditorState } from "./StorybookEditorModel";
import { StorybookEditorView } from "./StorybookEditorView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-575 — native Storybook editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when the
 * page's `mainEditorV4` is a v4-native StorybookEditorModel instance.
 *
 * Storybook is NO-HOST (no `CONTENT_HOST_TRAIT`) and standalone (no file
 * acceptance) — `Component` is the full gallery. No `<TextChrome>` wrap.
 */

function StorybookEditorComponent({ model }: { model: V4EditorModel }) {
    return <StorybookEditorView model={model as StorybookEditorModel} />;
}

export const storybookModule: EditorModule = {
    createEditor: () =>
        new StorybookEditorModel(new TComponentState(getDefaultStorybookEditorState())),
    Component: StorybookEditorComponent,
};

export {
    StorybookEditorModel,
    getDefaultStorybookEditorState,
    STORYBOOK_PAGE_ID,
} from "./StorybookEditorModel";
export type { StorybookEditorState, PreviewBackground } from "./StorybookEditorModel";
// Legacy EditorModule default-export — consumed by `showStorybookPage` and the
// legacy `editorRegistry` `loadModule` safety-net.
export { default as storybookEditorModule, default } from "./StorybookEditorView";
```

- **No `index.ts` to delete** (none exists). No compatibility alias (class name unchanged).

### SB-IMPL4 — v4 registry registration (`register-editors.ts`)

- **Legacy registration of `storybook-view`** (line 690) — unchanged (it already imports
  `./storybook/StorybookEditorView` and returns `module.default`, the preserved legacy shim).
- Add an explicit v4 registration block after the `mcp-view` v4 block (~line 1484), mirror
  About/Settings/MCP:
  ```ts
  // US-575 — replace the legacy bare-adapter mirror for storybook-view with a
  // native v4 module. Storybook is NO-HOST (no CONTENT_HOST_TRAIT) AND standalone
  // (no file acceptance) — `accepts` always returns -1 (opened only via
  // showStorybookPage, never via openFile). `hasContentHost: false` keeps it out
  // of the switch widget. The `showStorybookPage` launcher constructs via the
  // LEGACY registry's `module.newEmptyEditorModel` (now a v4 StorybookEditorModel
  // cast as legacy via `StorybookEditorView`'s preserved module);
  // `wrapLegacyForPage`'s `instanceof V4EditorModel` early-return (US-568 PD-IMPL16)
  // skips the adapter wrap.
  v4EditorRegistry.register({
      id: "storybook-view",
      name: "Storybook",
      hasContentHost: false,
      accepts: () => -1,
      loadModule: async () => {
          const { storybookModule } = await import("./storybook");
          return storybookModule;
      },
  });
  ```

### SB-IMPL5 — Opt into the generic no-host restore branch (`PagesPersistenceModel.ts`)

- Add `"storybook-view", // US-575` to `V4_NO_HOST_EDITOR_IDS` (9th member, after
  `"mcp-view"`). Remove the `US-575 Storybook → "storybook-view"` line from the "Append…"
  doc comment (leave the `US-576 Category` line).

### SB-IMPL6 — Repoint the launcher import (`PagesLifecycleModel.ts`)

- `showStorybookPage` (line 1118): change
  `import("../../editors/storybook/StorybookEditorView")` → `import("../../editors/storybook")`
  (folder / `index.tsx`). The default export is the same preserved legacy shim;
  `storybookModule.STORYBOOK_PAGE_ID` and `storybookModule.default.newEmptyEditorModel("storybookPage")`
  both still resolve via `index.tsx`'s re-exports. The `new PageModel(...STORYBOOK_PAGE_ID)`
  and `this.addPage(wrap(model), page)` lines are unchanged. Add an EPIC-028/US-575
  explanatory comment (mirror `showVideoPlayerPage`).

### SB-IMPL7 — No change to facade / PageWrapper / mcp-handler / story files

- **No facade** (`asStorybook` does not exist) → no scripting changes.
- **`mcp-handler.ts`** — no `"storybook-view"` hint (Storybook is not script/tool-openable) →
  no edit.
- **`storyRegistry.ts` / `storyTypes.ts` / `iconPresets.tsx`** and the `*.story.tsx` files —
  import from `./storybook/storyTypes` etc. (unchanged paths) → no edit.
- **`ComponentBrowser.tsx` / `LivePreview.tsx` / `PropertyEditor.tsx`** — take
  `model: StorybookEditorModel` (class name unchanged) → no edit.

---

## Concerns / open questions

- **SB-C1 (class naming — RESOLVED, follows MCP MC-C1).** Prior `.tsx`-embedded no-host
  models were renamed `XxxEditorModel`→`XxxEditor` with a compatibility alias (Archive,
  Video, About). Storybook's class is **kept as `StorybookEditorModel`** (no rename, no
  alias) — identical reasoning to MCP: the model already lives in a clean standalone `.ts`
  file, and `StorybookEditorView` + `ComponentBrowser`/`LivePreview`/`PropertyEditor` all
  import `StorybookEditorModel` by that exact name. Renaming would ripple to ≥4 files for
  zero benefit. The v4 identity is carried by `editorId = "storybook-view"`, not the class name.
- **SB-C2 (no persistence overrides — RESOLVED).** Unlike MCP/Video, Storybook has **no
  transient runtime fields** to reset and **no instance state outside `state`**. The base
  `getRestoreData()` (returns `{ editorId, id, state }` with the full state) and the no-host
  restore branch's `Object.assign(s, d.state)` together restore all five UI fields. No
  `getRestoreData` / `applyRestoreData` / `restore` overrides are needed — matching About's
  minimalism, but **with** real state surviving restart (verified against
  `base/v4/EditorModel.ts:309` and the no-host branch in `PagesPersistenceModel`).
- **SB-C3 (stale `selectedStoryId` — pre-existing, out of scope).** If a persisted
  `selectedStoryId` names a story that was removed/renamed between app versions,
  `findStory(id)` returns undefined and `LivePreview` must render an empty/"not found"
  state. This is **pre-existing** behavior — the legacy `newEditorModelFromState` already
  spreads the saved state over defaults, so a stale id breaks identically today. US-575
  neither fixes nor worsens it. (If we wanted to harden this, `restore()` could validate
  `selectedStoryId` against `ALL_STORIES` and fall back to `ALL_STORIES[0]` — noted as a
  possible follow-up, not part of this migration.)
- **SB-C4 (singleton — same as About/Settings).** `showStorybookPage` builds
  `new PageModel(STORYBOOK_PAGE_ID)`; a second invocation should focus the existing page
  rather than duplicate. This de-dupe (if any) is handled by `addPage`'s existing
  well-known-id logic — unchanged by this migration. No new logic.
- **SB-C5 (no toolbar / nav-panel / icon migration).** Storybook renders its own
  `Toolbar` inside the view and has no `getNavigatorTarget` and no `getIcon`. Unlike Video
  (which adopted `PageToolbar`), Storybook needs **no** toolbar/nav/icon changes — the view
  is fully self-contained. No tab icon (parity with Settings/About).
- **SB-C6 (dev-only surface).** Storybook is a developer/QA gallery reached via the Tools
  sidebar; it is not part of the typical end-user flow. The migration changes wiring only —
  no behavior change to story rendering, prop controls, or background injection.

---

## Acceptance criteria

1. **Open** — sidebar **Tools → Storybook** (and any `pagesModel.showStorybookPage()` caller)
   opens a native v4 `StorybookEditorModel` page; `page.mainEditorV4` is a
   `StorybookEditorModel` (not a `LegacyEditorAdapter`). Re-opening focuses the single
   `storybook-page` rather than duplicating.
2. **Browse / preview** — the ComponentBrowser lists all stories; selecting a story renders
   it in LivePreview with its initial prop values; the PropertyEditor controls update the
   preview live; **Reset** restores defaults.
3. **Background** — the segmented Dark/Default/Light control changes the preview background
   and is injected into stories that declare a managed background prop.
4. **Splitters** — left/right panel widths drag and stick.
5. **Persist / restore** — `selectedStoryId`, `propValues`, `previewBackground`,
   `leftPanelWidth`, `rightPanelWidth` all survive an app restart; restore routes through the
   `V4_NO_HOST_EDITOR_IDS` branch (no adapter). A pre-US-575 saved Storybook page (carrying
   `editorId: "storybook-view"`) restores cleanly.
6. **No scripting regression** — `page.asStorybook()` still does not exist (Storybook is not
   script-addressable); no facade gate references it.
7. **Lint/build clean**; no new ESLint warnings attributable to this change.

---

## Files changed

| File | Change |
|------|--------|
| `src/renderer/editors/storybook/StorybookEditorModel.ts` | **MODIFY** — re-parent to v4 `EditorModel`; `editorId = "storybook-view"`; state `extends EditorStateBase` + explicit `type: "storybookPage"` discriminator; explicit identity defaults (drop `getDefaultEditorModelState` spread); drop legacy `, void` generic; keep action methods / `buildInitialProps` / type re-exports verbatim; **no** persistence overrides |
| `src/renderer/editors/storybook/StorybookEditorView.tsx` | **MODIFY** — preserved legacy `storybookEditorModule` factories cast the v4 model `as unknown as EditorModel`; `Editor` cast `as unknown as EditorModule["Editor"]` (replace `as any`); add `import type { EditorModel } from "../base"` and `export { StorybookEditorView }` |
| `src/renderer/editors/storybook/index.tsx` | **CREATE** — v4 `storybookModule` (`createEditor`/`Component`) + re-exports (`STORYBOOK_PAGE_ID`, types) + legacy default re-export |
| `src/renderer/editors/register-editors.ts` | **MODIFY** — add explicit v4 `storybook-view` registration (`hasContentHost: false`, `accepts: () => -1`, loads `storybookModule`) after the `mcp-view` v4 block |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | **MODIFY** — add `"storybook-view"` to `V4_NO_HOST_EDITOR_IDS` (9th member) + comment update |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | **MODIFY** — `showStorybookPage` import path → `editors/storybook` (folder) + explanatory comment |

No changes to `ComponentBrowser.tsx`, `LivePreview.tsx`, `PropertyEditor.tsx`,
`storyRegistry.ts`, `storyTypes.ts`, `iconPresets.tsx`, the `*.story.tsx` files,
`mcp-handler.ts`, `PageWrapper.ts`, or any scripting facade (none exists for Storybook).
**No `index.ts` to delete** (none exists today).
