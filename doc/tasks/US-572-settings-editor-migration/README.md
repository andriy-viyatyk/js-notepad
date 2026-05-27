# US-572: Settings editor migration

*(EPIC-028 Phase C — walkthrough 30 closure, no-host group. First-principles investigation complete 2026-05-27. Ready for implementation.)*

## Goal

Promote the legacy `SettingsEditorModel` (a legacy-base `EditorModel` wrapped in `LegacyEditorAdapter` at runtime) to a native v4 `SettingsEditor extends EditorModel` (the v4 base). Settings is the **sixth no-host page-mainEditor migration** after Browser (US-558), PDF (US-568), Image (US-569), Archive (US-570), and Video (US-571) — and the **simplest no-host editor of all**: identity-only state, no content host, no toolbar, no nav-panel, no secondary editors, no file acceptance, no transient state to strip. It adds **no new architecture** — it consumes US-568's already-established no-host restore branch.

## Background

### What Settings is today

`src/renderer/editors/settings/SettingsPage.tsx` (~1230 LOC, all in one file):

- **Model** (`SettingsEditorModel`, lines 86–99) — extends the **legacy** base `EditorModel<SettingsEditorModelState, void>` (from `../base`). `noLanguage = true`, `skipSave = true`. State is **identity-only**: `SettingsEditorModelState extends IEditorState {}` with `id: SETTINGS_PAGE_ID` (`"settings-page"`), `type: "settingsPage"`, `title: "Settings"`. `getRestoreData()` deep-clones state; `restore()` resets `title`.
- **View** (`SettingsPage`, lines 1050–1203) — a big composition of section components (Theme grid, Browser Profiles, Tor, Links, Default Browser, File Search, MCP Server, Script Library, Drawing Library, Video Player, View Settings File). **Every section reads/writes `app.settings` directly via `settings.use(...)` / `settings.set(...)`** — the section state is entirely independent of the editor model. The `model` prop is unused (`_props`).
- **Module** (`settingsEditorModule`, lines 1209–1229) — legacy `EditorModule` with `Editor`, `newEditorModel`, `newEmptyEditorModel("settingsPage")`, `newEditorModelFromState`.

It is a **singleton well-known page** with the fixed id `SETTINGS_PAGE_ID = "settings-page"`. Opened only via the menu action `pages.showSettingsPage()` (PagesLifecycleModel.ts:1036) — **never via `openFile`** (it has no file acceptance; legacy registry entry `id: "settings-view"`, `editorType: "settingsPage"`, `category: "standalone"`, no `acceptFile`).

### Registry topology (two ids, by design — same as Video)

- **Page id** = editor instance id = `"settings-page"` (`SETTINGS_PAGE_ID`).
- **Editor registry id** = `"settings-view"` (legacy registry; also the v4 `editorId`).
- `deriveEditorId({ type: "settingsPage" })` → finds legacy registry def whose `editorType === "settingsPage"` → returns `"settings-view"`. So pre-migration saved descriptors carry `editorId: "settings-view"` — **backward compatible** with the v4 migration (see SE-IMPL3).

### The no-host template (US-568 PD-IMPL11 / PD-IMPL16 — already landed)

Every no-host migration since PDF only needs to: build its files, register a v4 module in `register-editors.ts`, and **add one line to `V4_NO_HOST_EDITOR_IDS`** (`PagesPersistenceModel.ts:53`). The generic restore branch (lines 163–182) then handles restart restore:

```typescript
if (V4_NO_HOST_EDITOR_IDS.has(d.editorId)) {
    const { editorRegistry: v4Registry } = await import("../../editors/base/v4");
    const editor = await v4Registry.createEditor(d.editorId, d.id);
    editor.state.update((s) => { Object.assign(s as object, d.state); (s as { id: string }).id = d.id; });
    editor.applyRestoreData(d.state as ...);
    await editor.restore();
    return editor;
}
```

`wrapLegacyForPage` (PagesLifecycleModel.ts:66) has the `instanceof V4EditorModel` early-return (PD-IMPL16) so the **open path** — which still flows through the preserved legacy `EditorModule.newEmptyEditorModel` returning a v4 editor cast as legacy — gets the editor back unwrapped (no `LegacyEditorAdapter`).

### Persistence: Settings IS saved/restored (existing behavior to preserve)

`PagesPersistenceModel.saveState` maps **all** pages via `getDescriptor()` → `editors.map(e => e.getRestoreData())`. There is **no `skipSave` filter at the page level** — `skipSave` only governs file-content save prompts (`TextFileActionsModel`), not session persistence. So the Settings page is written to `openFiles0.json` and **reopens after restart today**, and must continue to. Membership in `V4_NO_HOST_EDITOR_IDS` is what routes the restore correctly after migration.

### Closest sibling

PDF (US-568) / Image (US-569) for the no-host page-mainEditor shape; but Settings is even simpler — **no `getNavigatorTarget`, no toolbar/`PageToolbar`, no rightContributions, no cache file, no `dispose` override, no transient fields**. The view is self-contained chrome that owns its own scroll container. The only nuance vs. Video is the **singleton open path** (menu action reading `SETTINGS_PAGE_ID` + `newEmptyEditorModel`, not `openFile`).

## Implementation plan

Mirror US-571 (Video) file-split exactly, minus everything Video-specific.

### Step 1 — `settings/SettingsEditor.ts` (NEW, ~40 LOC)

The v4 native model + state + default-state factory + the `SETTINGS_PAGE_ID` constant (moved here from `SettingsPage.tsx`).

```typescript
import { TComponentState } from "../../core/state/state";
import { EditorModel as V4EditorModel, type EditorStateBase } from "../base/v4/EditorModel";

export const SETTINGS_PAGE_ID = "settings-page";

export interface SettingsEditorState extends EditorStateBase {
    /** Discriminator — preserved for `deriveEditorId` and pre-US-572 saved
     *  descriptors (SE-IMPL3). `deriveEditorId({type:"settingsPage"})` === "settings-view". */
    type: "settingsPage";
}

export const getDefaultSettingsEditorState = (): SettingsEditorState => ({
    id: SETTINGS_PAGE_ID,
    title: "Settings",
    modified: false,
    type: "settingsPage",
    editor: "settings-view",
});

export class SettingsEditor extends V4EditorModel<SettingsEditorState> {
    readonly editorId = "settings-view";
    noLanguage = true;
    skipSave = true;

    /** Preserve legacy `restore()` title-reset for parity (SE-IMPL5). */
    async restore(): Promise<void> {
        await super.restore();
        this.state.update((s) => { s.title = "Settings"; });
    }
}
```

Base `getRestoreData()` (`{ editorId, id, state }`) and base `applyRestoreData()` (no-op) are sufficient — there are no transient fields to strip (SE-IMPL4). No `constructor`/`getIcon` (SE-IMPL6).

### Step 2 — rename `SettingsPage.tsx` → `SettingsView.tsx` (view + preserved legacy module)

- Keep all section components and inline-style constants **verbatim**.
- Rename the exported component `SettingsPage` → `SettingsView`; change its prop type to `{ model: SettingsEditor }` (import from `./SettingsEditor`). The body ignores `model` (it already does: `_props`).
- **Delete** the in-file `SettingsEditorModel` class, `SettingsEditorModelState`, `getDefaultSettingsPageModelState`, and the `SETTINGS_PAGE_ID` const (moved to `SettingsEditor.ts`); import `SETTINGS_PAGE_ID` + `getDefaultSettingsEditorState` + `SettingsEditor` from `./SettingsEditor`.
- **Preserve the legacy `EditorModule` default export** so `showSettingsPage` and the legacy-registry `loadModule` safety-net keep working — its factories return a **v4 `SettingsEditor` cast as legacy** (mirror Video's `as unknown as EditorModel`):

```typescript
const settingsEditorModule: EditorModule = {
    Editor: SettingsView as EditorModule["Editor"],
    newEditorModel: async () =>
        new SettingsEditor(new TComponentState(getDefaultSettingsEditorState())) as unknown as LegacyEditorModel,
    newEmptyEditorModel: async (editorType) =>
        editorType === "settingsPage"
            ? (new SettingsEditor(new TComponentState(getDefaultSettingsEditorState())) as unknown as LegacyEditorModel)
            : null,
    newEditorModelFromState: async (state) =>
        new SettingsEditor(new TComponentState({ ...getDefaultSettingsEditorState(), ...state })) as unknown as LegacyEditorModel,
};
export default settingsEditorModule;
export { SettingsView };
export type { SettingsEditorProps };
```

(Re-export `SETTINGS_PAGE_ID` too if any importer reaches it through this module — but the canonical home is now `SettingsEditor.ts` and `index.tsx`.)

### Step 3 — `settings/index.tsx` (NEW, ~30 LOC) — v4 module + re-exports

```typescript
import { TComponentState } from "../../core/state/state";
import { SettingsEditor, getDefaultSettingsEditorState } from "./SettingsEditor";
import { SettingsView } from "./SettingsView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

function SettingsEditorComponent({ model }: { model: V4EditorModel }) {
    return <SettingsView model={model as SettingsEditor} />;
}

export const settingsModule: EditorModule = {
    createEditor: () => new SettingsEditor(new TComponentState(getDefaultSettingsEditorState())),
    Component: SettingsEditorComponent,
};

export { SettingsEditor, getDefaultSettingsEditorState, SETTINGS_PAGE_ID } from "./SettingsEditor";
export type { SettingsEditorState } from "./SettingsEditor";
// Compatibility aliases — retire under US-559.
export { SettingsEditor as SettingsEditorModel } from "./SettingsEditor";
export type { SettingsEditorState as SettingsEditorModelState } from "./SettingsEditor";
// Legacy EditorModule default-export — consumed by `showSettingsPage` and the
// legacy registry `loadModule` safety-net.
export { default as settingsEditorModule, default } from "./SettingsView";
```

### Step 4 — `register-editors.ts` (MODIFY, 2 edits)

1. **Legacy entry** (line ~736): change `loadModule` import from `./settings/SettingsPage` → `./settings/SettingsView`.
2. **Add v4 registration** (after the `video-view` block, ~line 1414). Settings is **standalone** — `accepts` always returns `-1` (never resolved by `openFile`); `hasContentHost: false` keeps it out of the switch widget:

```typescript
// US-572 — native v4 Settings module. NO-HOST, standalone (no file
// acceptance). Opened only via `showSettingsPage`; `accepts` returns -1.
v4EditorRegistry.register({
    id: "settings-view",
    name: "Settings",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { settingsModule } = await import("./settings");
        return settingsModule;
    },
});
```

### Step 5 — `PagesPersistenceModel.ts` (MODIFY, 1 line) — opt into no-host restore

Add to `V4_NO_HOST_EDITOR_IDS` (line 53):

```typescript
    "settings-view", // US-572 (this PR)
```

### Step 6 — `PagesLifecycleModel.ts` (MODIFY, 1 edit) — open path import

`showSettingsPage` (line 1036) — change the dynamic import from `"../../editors/settings/SettingsPage"` to `"../../editors/settings"` (the folder index). `settingsModule.default.newEmptyEditorModel("settingsPage")` returns a v4 `SettingsEditor` (cast as legacy); `settingsModule.SETTINGS_PAGE_ID` is re-exported from `index.tsx`; `wrap(model)` returns it unwrapped via PD-IMPL16. **No logic change** — only the import path.

### Step 7 — verify

`npm run lint` + `tsc` clean on touched files. Manual smoke (see Acceptance criteria).

## Concerns / Open questions

- **SE-IMPL1 — Singleton open path differs from Video (resolved).** Video opens via `showVideoPlayerPage` → `videoModule.default.newEmptyEditorModel("videoPage")` + `wrap`, with a fresh-UUID page. Settings opens via `showSettingsPage` → `settingsModule.default.newEmptyEditorModel("settingsPage")` + `new PageModel(SETTINGS_PAGE_ID)` + `wrap`. The preserved legacy `EditorModule` (Step 2) keeps this exact call shape working — `newEmptyEditorModel` returns a v4 `SettingsEditor`, `wrap` unwraps it (PD-IMPL16). **No change to the open path's logic, only the module's import path (Step 6).**
- **SE-IMPL2 — No de-dupe in `showSettingsPage` (out of scope; preserve as-is).** `showSettingsPage` does not focus an existing Settings tab — calling it twice opens two tabs with the same `SETTINGS_PAGE_ID`. This is **existing behavior** shared with About/Storybook and is **not changed** by this migration. (A `requireWellKnownPage`-style de-dupe would be a separate UX task.)
- **SE-IMPL3 — Backward compatibility (resolved).** Pre-migration sessions saved the Settings descriptor with `editorId: "settings-view"` (via `deriveEditorId({type:"settingsPage"})`). After this PR, `"settings-view"` is in `V4_NO_HOST_EDITOR_IDS`, so restore routes through `v4Registry.createEditor("settings-view", "settings-page")` → seeds `d.state` → `restore()`. The `type: "settingsPage"` discriminator is retained in state so `deriveEditorId` keeps resolving for any residual legacy path.
- **SE-IMPL4 — No transient state to strip (resolved).** Unlike Video (`streamUrl`/`playerState`) and Image (blob URLs), Settings state is identity-only. Base `getRestoreData()` / `applyRestoreData()` suffice — **no overrides needed.**
- **SE-IMPL5 — `restore()` title-reset (keep for parity).** Legacy `restore()` set `s.title = "Settings"`. Default state already sets it, and the descriptor carries it, so a no-op would also work — but keep the one-line reset to exactly preserve legacy behavior and guard against a descriptor with a stale title.
- **SE-IMPL6 — No tab icon today (preserve).** `SettingsEditorModel` sets no `getIcon`; with `noLanguage = true`, `PageTab.tsx:614-617` renders nothing in the icon slot (title only). The v4 `SettingsEditor` likewise sets no `getIcon` — **tab appearance unchanged.** (If a gear icon is desired, that's a separate UX decision, not this migration.)
- **SE-IMPL7 — View ignores `model` (resolved).** Every settings section reads `app.settings` directly; the `model` prop is unused. The view needs no `model.state.use(...)` subscription and no `typedQueue` drain (unlike Mermaid/text editors). Keep the prop for signature symmetry only.
- **SE-IMPL8 — No `index.ts` to delete.** Settings has only `SettingsPage.tsx` today (no `index.ts`), so unlike PDF/Image there is no folder-barrel delete — just the rename + two new files.

## Acceptance criteria

- **Open** — Menu → Settings opens the Settings page; all sections render and read/write `app.settings` correctly (theme switch applies live; profile add/remove; MCP toggle; port edits; library browse; etc.).
- **No adapter** — the page's `mainEditorV4` is a `SettingsEditor` instance (not a `LegacyEditorAdapter`); `editorId === "settings-view"`.
- **Persistence round-trip** — with a Settings tab open, restart the app; the Settings tab reopens and renders correctly (restored via the `V4_NO_HOST_EDITOR_IDS` branch as a native `SettingsEditor`).
- **Backward compat** — a session saved before this PR (Settings descriptor `editorId: "settings-view"`) restores without error.
- **Tab** — the Settings tab shows the title "Settings" with no icon (unchanged).
- `npm run lint` clean; no new `tsc` errors on touched files.

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/editors/settings/SettingsEditor.ts` | **NEW** — v4 `SettingsEditor` class + `SettingsEditorState` + `getDefaultSettingsEditorState()` + `SETTINGS_PAGE_ID` (moved here). |
| `src/renderer/editors/settings/SettingsView.tsx` | **RENAME** from `SettingsPage.tsx` — view (`SettingsView`) + preserved legacy `EditorModule` default export (factories return v4 `SettingsEditor` cast as legacy). Model class/state/default removed. |
| `src/renderer/editors/settings/index.tsx` | **NEW** — v4 `settingsModule` (`createEditor` + `Component`) + re-exports + compatibility aliases + legacy `default` re-export. |
| `src/renderer/editors/register-editors.ts` | Legacy `settings-view` `loadModule` import → `./settings/SettingsView`; **add** v4 `settings-view` registration (`hasContentHost: false`, `accepts: () => -1`). |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Add `"settings-view"` to `V4_NO_HOST_EDITOR_IDS` (6th member). |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | `showSettingsPage` dynamic import → `"../../editors/settings"` (folder). No logic change. |

*(Optional, low-value: `mcp-handler.ts` has no standalone-editor hint for settings — none needed; Settings is not script/MCP-openable.)*
