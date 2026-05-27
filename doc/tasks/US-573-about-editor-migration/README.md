# US-573: About editor migration

*(EPIC-028 Phase C — walkthrough 30 closure, no-host group. First-principles investigation complete 2026-05-27. Ready for implementation.)*

## Goal

Promote the legacy `AboutEditorModel` (a legacy-base `EditorModel` wrapped in `LegacyEditorAdapter` at runtime) to a native v4 `AboutEditor extends EditorModel` (the v4 base). About is the **seventh no-host page-mainEditor migration** after Browser (US-558), PDF (US-568), Image (US-569), Archive (US-570), Video (US-571), and Settings (US-572). It is a **near-exact clone of US-572 (Settings)** — same singleton-well-known-page shape, same identity-only model, same standalone (no-file-acceptance) registration. The only structural difference is that About has an `index.ts` barrel to fold into the new `index.tsx` (AB-IMPL8). It adds **no new architecture**.

## Background

### What About is today

`src/renderer/editors/about/AboutPage.tsx` (~230 LOC) + `about/index.ts` (4-line barrel):

- **Model** (`AboutEditorModel`, lines 30–43) — extends the **legacy** base `EditorModel<AboutEditorModelState, void>` (from `../base`). `noLanguage = true`, `skipSave = true`. State is **identity-only**: `AboutEditorModelState extends IEditorState {}` with `id: ABOUT_PAGE_ID` (`"about-page"`), `type: "aboutPage"`, `title: "About"`. `getRestoreData()` deep-clones state; `restore()` resets `title`. **Byte-for-byte the same shape as `SettingsEditorModel`.**
- **View** (`AboutPage`, lines 67–199) — the logo + version + runtime versions (Electron/Node/Chromium) + "Check for Updates" button + GitHub/Report-Issue links. It is **more dynamic than Settings' view** (local `useState` for `runtimeVersions` / `updateResult` / `checking`; a `useEffect` that calls `shell.version.runtimeVersions()` and subscribes to `rendererEvents[EventEndpoint.eUpdateAvailable]`; reads `app.version`). But like Settings, **every bit of that state is view-local and independent of the editor model** — the `model` prop is unused (`_props`).
- **Module** (`aboutEditorModule`, lines 205–223) — legacy `EditorModule` with `Editor`, `newEditorModel`, `newEmptyEditorModel("aboutPage")`, `newEditorModelFromState`.
- **Barrel** (`about/index.ts`) — re-exports `AboutPage` / `AboutEditorModel` / types + `export { default as AboutPageModule } from "./AboutPage"`. **No external consumer** imports `AboutPageModule` or the barrel (verified by grep — only the barrel references itself).

It is a **singleton well-known page** with fixed id `ABOUT_PAGE_ID = "about-page"`. Opened only via the menu action `pages.showAboutPage()` (PagesLifecycleModel.ts:1027) — **never via `openFile`** (legacy registry entry `id: "about-view"`, `editorType: "aboutPage"`, `category: "standalone"`, no `acceptFile`).

### Registry topology (two ids, by design — identical to Settings)

- **Page id** = editor instance id = `"about-page"` (`ABOUT_PAGE_ID`).
- **Editor registry id** = `"about-view"` (legacy registry; also the v4 `editorId`).
- `deriveEditorId({ type: "aboutPage" })` → finds the legacy registry def whose `editorType === "aboutPage"` → returns `"about-view"`. So pre-migration saved descriptors carry `editorId: "about-view"` — **backward compatible** (AB-IMPL3).

### The no-host template (US-568 PD-IMPL11 / PD-IMPL16; reused by US-572)

US-572 (Settings) is the exact precedent. The generic restore branch in `PagesPersistenceModel.restorePage` (lines 163–182) handles restart restore for any `editorId` in `V4_NO_HOST_EDITOR_IDS`; `wrapLegacyForPage`'s `instanceof V4EditorModel` early-return (PD-IMPL16) lets the open path (preserved legacy `EditorModule.newEmptyEditorModel` returning a v4 editor cast as legacy) get the editor back unwrapped (no `LegacyEditorAdapter`).

### Persistence: About IS saved/restored (existing behavior to preserve)

As established in US-572: `saveState` maps **all** pages via `getDescriptor()` → `editors.map(e => e.getRestoreData())`; there is **no `skipSave` filter at the page level** (`skipSave` only governs file-content save prompts). So the About page is written to `openFiles0.json` and reopens after restart today, and must continue to. Membership in `V4_NO_HOST_EDITOR_IDS` routes the restore correctly after migration.

### MCP hint (no change needed)

`mcp-handler.ts:165` already has `"about-view": "Use execute_script with: await app.pages.showAboutPage()"` in the standalone-editor hints map. It is keyed by the editor id `"about-view"`, which is **unchanged** by this migration — so **no edit** (same as the `settings-view` hint in US-572).

## Implementation plan

Mirror US-572 (Settings) exactly, plus the `index.ts` fold.

### Step 1 — `about/AboutEditor.ts` (NEW, ~45 LOC)

```typescript
import {
    EditorModel as V4EditorModel,
    type EditorStateBase,
} from "../base/v4/EditorModel";

export const ABOUT_PAGE_ID = "about-page";

export interface AboutEditorState extends EditorStateBase {
    /** Discriminator — preserved for `deriveEditorId` and pre-US-573 saved
     *  descriptors (AB-IMPL3). `deriveEditorId({type:"aboutPage"})` === "about-view". */
    type: "aboutPage";
}

export const getDefaultAboutEditorState = (): AboutEditorState => ({
    id: ABOUT_PAGE_ID,
    title: "About",
    modified: false,
    type: "aboutPage",
    editor: "about-view",
});

export class AboutEditor extends V4EditorModel<AboutEditorState> {
    readonly editorId = "about-view";
    noLanguage = true;
    skipSave = true;

    /** Preserve legacy `restore()` title-reset for parity (AB-IMPL5). */
    async restore(): Promise<void> {
        await super.restore();
        this.state.update((s) => { s.title = "About"; });
    }
}
```

Base `getRestoreData()` / `applyRestoreData()` suffice — no transient fields (AB-IMPL4). No `constructor`/`getIcon` (AB-IMPL6).

### Step 2 — rename `AboutPage.tsx` → `AboutView.tsx` (view + preserved legacy module)

- Keep the view body **verbatim** (logo, version, runtime versions, update check, links, `mapUpdateResult`).
- Rename component `AboutPage` → `AboutView`; prop type `{ model: AboutEditor }` (import from `./AboutEditor`). Body keeps ignoring `model` (`_props`).
- **Delete** the in-file `AboutEditorModel` class, `AboutEditorModelState`, `getDefaultAboutPageModelState`, and the `ABOUT_PAGE_ID` const (moved to `AboutEditor.ts`); import `getDefaultAboutEditorState` + `AboutEditor` (+ `AboutEditorState` type) from `./AboutEditor`.
- **Preserve the legacy `EditorModule` default export** with factories returning a **v4 `AboutEditor` cast as legacy** (`as unknown as EditorModel`), mirroring `SettingsView.tsx`:

```typescript
const aboutEditorModule: EditorModule = {
    Editor: AboutView as unknown as EditorModule["Editor"],
    newEditorModel: async () =>
        new AboutEditor(new TComponentState(getDefaultAboutEditorState())) as unknown as EditorModel,
    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "aboutPage") return null;
        return new AboutEditor(new TComponentState(getDefaultAboutEditorState())) as unknown as EditorModel;
    },
    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const initialState: AboutEditorState = {
            ...getDefaultAboutEditorState(),
            ...(state as Partial<AboutEditorState>),
        };
        return new AboutEditor(new TComponentState(initialState)) as unknown as EditorModel;
    },
};
export default aboutEditorModule;
export { AboutView };
export type { AboutEditorProps };
```

### Step 3 — fold `about/index.ts` → `about/index.tsx` (DELETE old, NEW v4 module)

Delete the 4-line `index.ts` barrel and replace with a v4 `index.tsx` mirroring `settings/index.tsx`:

```typescript
import { TComponentState } from "../../core/state/state";
import { AboutEditor, getDefaultAboutEditorState } from "./AboutEditor";
import { AboutView } from "./AboutView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

function AboutEditorComponent({ model }: { model: V4EditorModel }) {
    return <AboutView model={model as AboutEditor} />;
}

export const aboutModule: EditorModule = {
    createEditor: () => new AboutEditor(new TComponentState(getDefaultAboutEditorState())),
    Component: AboutEditorComponent,
};

export { AboutEditor, getDefaultAboutEditorState, ABOUT_PAGE_ID } from "./AboutEditor";
export type { AboutEditorState } from "./AboutEditor";
// Compatibility aliases — retire under US-559.
export { AboutEditor as AboutEditorModel } from "./AboutEditor";
export type { AboutEditorState as AboutEditorModelState } from "./AboutEditor";
// Legacy EditorModule default-export — consumed by `showAboutPage` and the
// legacy registry `loadModule` safety-net.
export { default as aboutEditorModule, default } from "./AboutView";
```

(The old barrel's `AboutPageModule` export is dropped — no consumer. The `AboutPage`/`AboutEditorModel` named exports are preserved via the new aliases for any stale import.)

### Step 4 — `register-editors.ts` (MODIFY, 2 edits)

1. **Legacy entry** (line ~723): change `loadModule` import from `./about/AboutPage` → `./about/AboutView`.
2. **Add v4 registration** (after the `settings-view` block). Standalone — `accepts` returns `-1`; `hasContentHost: false`:

```typescript
// US-573 — native v4 About module. NO-HOST, standalone (no file acceptance).
// Opened only via `showAboutPage`; `accepts` returns -1.
v4EditorRegistry.register({
    id: "about-view",
    name: "About",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { aboutModule } = await import("./about");
        return aboutModule;
    },
});
```

### Step 5 — `PagesPersistenceModel.ts` (MODIFY, 1 line)

Add to `V4_NO_HOST_EDITOR_IDS`:

```typescript
    "about-view",    // US-573 (this PR)
```

### Step 6 — `PagesLifecycleModel.ts` (MODIFY, 1 edit)

`showAboutPage` (line 1027) — change the dynamic import from `"../../editors/about/AboutPage"` to `"../../editors/about"` (the folder index). `aboutModule.default.newEmptyEditorModel("aboutPage")` returns a v4 `AboutEditor` (cast as legacy); `aboutModule.ABOUT_PAGE_ID` is re-exported from `index.tsx`; `wrap(model)` returns it unwrapped via PD-IMPL16. **No logic change** — only the import path.

### Step 7 — verify

`npm run lint` + `tsc` clean on touched files. Manual smoke (see Acceptance criteria).

## Concerns / Open questions

- **AB-IMPL1 — Singleton open path (resolved, same as SE-IMPL1).** `showAboutPage` → `aboutModule.default.newEmptyEditorModel("aboutPage")` + `new PageModel(ABOUT_PAGE_ID)` + `wrap`. The preserved legacy `EditorModule` keeps this exact call shape working; `wrap` unwraps the v4 instance (PD-IMPL16). No change to the open path's logic, only the module import path (Step 6).
- **AB-IMPL2 — No de-dupe in `showAboutPage` (out of scope, preserve).** Calling it twice opens two tabs with the same `ABOUT_PAGE_ID`. Existing behavior shared with Settings/Storybook — **not changed** here.
- **AB-IMPL3 — Backward compatibility (resolved).** Pre-migration sessions saved `editorId: "about-view"` (via `deriveEditorId({type:"aboutPage"})`). After this PR `"about-view"` is in `V4_NO_HOST_EDITOR_IDS`, so restore routes through `createEditor("about-view", "about-page")` → seeds `d.state` → `restore()`. The `type: "aboutPage"` discriminator is retained.
- **AB-IMPL4 — No transient state to strip (resolved).** Identity-only state; base `getRestoreData()` / `applyRestoreData()` suffice — no overrides.
- **AB-IMPL5 — `restore()` title-reset (keep for parity).** Legacy `restore()` set `s.title = "About"`. Keep the one-line reset.
- **AB-IMPL6 — No tab icon today (preserve).** `AboutEditorModel` sets no `getIcon`; with `noLanguage = true`, `PageTab.tsx:614-617` renders nothing in the icon slot (title only). The v4 `AboutEditor` likewise sets no `getIcon` — tab appearance unchanged. (The `PersephoneIcon` in the view body is page content, not a tab icon.)
- **AB-IMPL7 — View ignores `model`, but is more dynamic than Settings (resolved).** The view manages its own `runtimeVersions` / `updateResult` / `checking` via `useState` + a `useEffect` (runtime-versions fetch + `eUpdateAvailable` subscription). None of it touches the model — keep the `model` prop for signature symmetry only; no `model.state.use(...)` / `typedQueue` drain needed. The `useEffect` cleanup (`subscription.unsubscribe()`) is unchanged.
- **AB-IMPL8 — `index.ts` fold (the one difference from Settings).** Unlike Settings (no barrel), About has `about/index.ts` re-exporting `AboutPage` / `AboutEditorModel` / types + `AboutPageModule`. Delete it and fold into the new `about/index.tsx` (mirrors PDF/Image/Archive folds). **No external consumer** imports the barrel or `AboutPageModule` (verified by grep), so the only callers to update are `register-editors.ts` (Step 4.1, → `AboutView`) and `showAboutPage` (Step 6, → folder). Compatibility aliases in `index.tsx` keep `AboutEditorModel` / `AboutEditorModelState` resolvable.
- **AB-IMPL9 — MCP hint unchanged.** `mcp-handler.ts:165` `"about-view"` hint is keyed by the unchanged editor id — no edit.

## Acceptance criteria

- **Open** — Menu → About opens the About page; logo, `Version`, Electron/Node/Chromium rows, "Check for Updates" (with live status), and GitHub/Report-Issue links all render and work.
- **No adapter** — the page's `mainEditorV4` is an `AboutEditor` instance (not a `LegacyEditorAdapter`); `editorId === "about-view"`.
- **Persistence round-trip** — with an About tab open, restart the app; the About tab reopens and renders correctly (restored via the `V4_NO_HOST_EDITOR_IDS` branch as a native `AboutEditor`).
- **Backward compat** — a session saved before this PR (About descriptor `editorId: "about-view"`) restores without error.
- **Tab** — the About tab shows the title "About" with no icon (unchanged).
- `npm run lint` clean; no new `tsc` errors on touched files.

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/editors/about/AboutEditor.ts` | **NEW** — v4 `AboutEditor` class + `AboutEditorState` + `getDefaultAboutEditorState()` + `ABOUT_PAGE_ID` (moved here). |
| `src/renderer/editors/about/AboutView.tsx` | **RENAME** from `AboutPage.tsx` — view (`AboutView`) + preserved legacy `EditorModule` default export (factories return v4 `AboutEditor` cast as legacy). Model class/state/default removed. |
| `src/renderer/editors/about/index.tsx` | **NEW** (replaces `index.ts`) — v4 `aboutModule` (`createEditor` + `Component`) + re-exports + compatibility aliases + legacy `default` re-export. |
| `src/renderer/editors/about/index.ts` | **DELETE** — folded into `index.tsx`. |
| `src/renderer/editors/register-editors.ts` | Legacy `about-view` `loadModule` import → `./about/AboutView`; **add** v4 `about-view` registration (`hasContentHost: false`, `accepts: () => -1`). |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Add `"about-view"` to `V4_NO_HOST_EDITOR_IDS` (7th member). |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | `showAboutPage` dynamic import → `"../../editors/about"` (folder). No logic change. |

*(No change to `mcp-handler.ts` — the `about-view` hint is keyed by the unchanged editor id.)*
