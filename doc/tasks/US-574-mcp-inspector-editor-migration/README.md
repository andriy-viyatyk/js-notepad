# US-574: MCP Inspector editor migration

**Epic:** [EPIC-028 — Unified Editor Architecture](../../epics/EPIC-028.md) · Phase C · walkthrough 30 closure (no-host group)
**Status:** Investigation complete 2026-05-27 — ready for implementation
**Reference walkthrough:** [30-no-host-group.md](../../epics/EPIC-028-editor-architecture/walkthroughs/30-no-host-group.md) (row "MCP Inspector")

---

## Goal

Migrate the MCP Inspector page from a legacy `EditorModel` (wrapped at runtime in
`LegacyEditorAdapter`) to a native v4 `EditorModel` subclass, following the no-host
template established by Browser (US-558) / PDF (US-568) / Image (US-569) / Archive
(US-570) / Video (US-571) and the singleton pair Settings (US-572) / About (US-573).
**Eighth no-host page-mainEditor v4-native migration** and the **most stateful** one
so far.

---

## Background

### What MCP Inspector is

A standalone page editor (`editorType: "mcpInspectorPage"`, registry id `"mcp-view"`,
`category: "standalone"`) with **no file association** (`acceptFile` absent). It connects
to an MCP server over HTTP or stdio and lets the user browse the server's tools,
resources, and prompts and call them interactively. Opened only via
`pagesModel.lifecycle.showMcpInspectorPage({ url? })` — **not** a singleton (each call
creates a fresh page; there is no fixed page id, unlike Settings/About/Storybook).

### Current shape (legacy)

- **`McpInspectorEditorModel.ts`** — class `McpInspectorEditorModel extends EditorModel<McpInspectorEditorState, void>`
  (legacy base from `../base`). This is the meatiest no-host model:
  - **Persisted config state** on `McpInspectorEditorState`: `url`, `transportType`,
    `command`, `args`, `connectionName`, `activePanel`.
  - **Transient runtime state** on the same state object: `connectionStatus`,
    `errorMessage`, `serverName/Title/Version/Description/WebsiteUrl`, `instructions`,
    `hasTools/hasResources/hasPrompts`.
  - **Three sub-state stores** — `toolsState`, `resourcesState`, `promptsState`
    (each a `TOneState<…>` instance field; **never persisted**; reset to defaults on
    disconnect).
  - **`connection: McpConnectionManager`** instance field. Its `onStatusChange`
    callback (wired in the constructor) drives state updates + `loadTools/loadResources/loadPrompts`
    + `autoSaveConnection` on connect, and resets the sub-states + history on disconnect.
  - **`_history: McpRequestEntry[]`** in-memory log; `showHistory()` opens a `log-view`
    page; `clearHistory()`.
  - **`getIcon = () => createElement(McpIcon)`** — MCP **has a tab icon** (unlike
    Settings/About).
  - **`noLanguage = true`**, **`skipSave = true`**.
  - **`getRestoreData()`** returns `Partial<McpInspectorEditorState>` (super + the 6
    config fields). **`applyRestoreData()`** restores the 6 config fields.
  - **`dispose()`** → `await this.connection.dispose(); await super.dispose();`.
  - **`restore()`** → bare `await super.restore()` (no auto-connect — connection is
    user-initiated).
- **`McpInspectorView.tsx`** — the React view (`McpInspectorView({ model })`, **genuinely
  model-driven** — unlike Settings/About). Already correctly named (`…View.tsx`). Holds the
  legacy `mcpInspectorEditorModule` default export (`Editor` + `newEditorModel*`).
  Sub-panels: `ToolsPanel`, `ResourcesPanel`, `PromptsPanel`, plus inline `ServerInfoPanel`
  / `HistoryPanel`.
- **`index.ts`** — barrel re-exporting `McpInspectorEditorModel` + types. **No external
  consumer imports the bare folder/barrel** (verified: all imports target
  `./mcp-inspector/McpInspectorEditorModel` or `./mcp-inspector/McpInspectorView`).
- **Registration** (`register-editors.ts`): legacy def `mcp-view` loadModule already imports
  `./mcp-inspector/McpInspectorView` and returns `module.default`. The v4 mirror loop
  currently registers `mcp-view` as a **throwing stub** (not text-content-view, not yet
  migrated).

### Scripting facade (no change required)

- **`McpInspectorFacade`** wraps the model for `page.asMcpInspector()`. The gate is
  `PageWrapper.currentEditorId() === "mcp-view"` and the body is
  `new McpInspectorFacade(this.model as unknown as McpInspectorEditorModel)`.
- `this.model` is the **unwrapped main editor** (`PageModel.mainEditor`) — i.e. the
  v4-native instance after migration; `this.v4.editorId` (== `mainEditorV4.editorId`)
  gates. This is the **identical pattern to the already-migrated Browser**
  (`asBrowser` → `this.model as unknown as BrowserEditorModel`), which proves the facade
  works unchanged against a v4-native editor: the facade only reads `model.state` and
  calls preserved methods (`connect`/`disconnect`/`historyCount`/`history`/`clearHistory`/`showHistory`).

### Infrastructure already in place (US-568)

- **PD-IMPL11** — `V4_NO_HOST_EDITOR_IDS` in `PagesPersistenceModel.ts`. Adding
  `"mcp-view"` routes restore through the generic v4-native no-host branch
  (`editorRegistry.createEditor` → `Object.assign(state, d.state)` → `applyRestoreData` →
  `restore`).
- **PD-IMPL16** — `wrapLegacyForPage`'s `if (legacy instanceof V4EditorModel) return legacy`
  early-return. The preserved legacy module factory returns a v4 `McpInspectorEditorModel`
  cast as legacy; `wrap()` returns it unwrapped (no adapter).
- **Backward compat** — `deriveEditorId({ type: "mcpInspectorPage" })` === `"mcp-view"`
  (legacy registry def `editorType: "mcpInspectorPage"` → id `"mcp-view"`), so sessions
  persisted while MCP was adapter-wrapped already carry `editorId: "mcp-view"` and restore
  cleanly through the new branch.

---

## Implementation plan

Closest sibling structurally is **Video (US-571)**: real persisted state + transient
resets in `getRestoreData`, a tab icon, instance fields beyond `state`, and a `dispose`
override. The difference is that MCP's model **already lives in its own `.ts` file**
(`McpInspectorEditorModel.ts`, separate from the view), so there is **no file/class
rename** — we re-parent the existing class in place.

### MC-IMPL1 — Re-parent the model to the v4 base (`McpInspectorEditorModel.ts`)

- Change the import from the legacy base to the v4 base:
  - `import { getDefaultEditorModelState, EditorModel } from "../base";` →
    `import { EditorModel as V4EditorModel, type EditorStateBase, type RestoreData } from "../base/v4/EditorModel";`
    plus `import type { EditorDescriptor } from "../../../shared/persistence-v4";`.
- `McpInspectorEditorState extends IEditorState` → `extends EditorStateBase`
  (`EditorStateBase` = `Omit<Partial<IEditorState>, …> & { id; title; modified }`, which
  still exposes `type`, `editor`, `secondaryEditor` as optional — all MCP needs).
- `getDefaultMcpInspectorEditorState()`: replace the `...getDefaultEditorModelState()`
  spread with explicit identity fields:
  `id: crypto.randomUUID(), title: "MCP Inspector", modified: false, type: "mcpInspectorPage", editor: "mcp-view"` (keep all existing mcp-specific defaults).
- Class declaration: `class McpInspectorEditorModel extends V4EditorModel<McpInspectorEditorState>`
  (drop the legacy `, void` second generic — the v4 base defaults `R = unknown`).
- Add `readonly editorId = "mcp-view";` (v4 identity — required abstract member).
- Keep `noLanguage = true; skipSave = true;`, the `connection`/`toolsState`/`resourcesState`/`promptsState`
  fields, `_history`, the constructor's `onStatusChange` wiring, and **all** action
  methods **verbatim**.
- Keep `getIcon = () => createElement(McpIcon);` (overrides the optional v4 `getIcon?`).

### MC-IMPL2 — Convert persistence to the v4 `EditorDescriptor` shape

- **`getRestoreData()`** → return `EditorDescriptor` (mirror Video VD-IMPL5):
  ```ts
  getRestoreData(): EditorDescriptor {
      const s = this.state.get();
      return {
          editorId: this.editorId,
          id: s.id,
          state: {
              ...s,
              // Persist only connection config; reset all transient runtime state.
              connectionStatus: "disconnected",
              errorMessage: "",
              serverName: "", serverTitle: "", serverVersion: "",
              serverDescription: "", serverWebsiteUrl: "", instructions: "",
              hasTools: false, hasResources: false, hasPrompts: false,
          } as unknown as Record<string, unknown>,
      };
  }
  ```
  (The three sub-state stores and `_history` are **not** part of `state`, so they are
  naturally excluded — no extra work.)
- **`applyRestoreData(data: RestoreData<McpInspectorEditorState>)`** — keep restoring the
  six config fields (`url`, `transportType`, `command`, `args`, `connectionName`,
  `activePanel`); call `super.applyRestoreData(data)` first. (The generic no-host restore
  branch also `Object.assign`s `d.state` onto the fresh default state before this runs —
  double-applying the config fields is harmless.)
- **`restore()`** — the bare `await super.restore()` override is a pure passthrough; drop
  it (the v4 base provides the no-op). MCP must **not** auto-connect on restore (preserve
  current behavior).
- **`dispose()`** — keep `await this.connection.dispose(); await super.dispose();`.

### MC-IMPL3 — Preserve the legacy module shim in the view (`McpInspectorView.tsx`)

- No change to the `McpInspectorView` component (already takes `model: McpInspectorEditorModel`).
- The `mcpInspectorEditorModule` default export stays, but its factories now construct a
  v4 editor cast as legacy (mirror Settings/About/Video):
  - `Editor: McpInspectorView as unknown as EditorModule["Editor"]`,
  - `newEditorModel` / `newEmptyEditorModel` / `newEditorModelFromState` →
    `new McpInspectorEditorModel(new TComponentState(...)) as unknown as EditorModel`
    (legacy `EditorModel` import from `../base`).
- This shim is consumed by `showMcpInspectorPage` (via the new `index.tsx` default
  re-export) and by the legacy registry `loadModule` safety-net; `wrap()`'s PD-IMPL16
  early-return unwraps the v4 instance.

### MC-IMPL4 — New `index.tsx`, delete `index.ts`

Create `src/renderer/editors/mcp-inspector/index.tsx` (mirror `about/index.tsx`):

```tsx
import { TComponentState } from "../../core/state/state";
import { McpInspectorEditorModel, getDefaultMcpInspectorEditorState } from "./McpInspectorEditorModel";
import { McpInspectorView } from "./McpInspectorView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

function McpInspectorEditorComponent({ model }: { model: V4EditorModel }) {
    return <McpInspectorView model={model as McpInspectorEditorModel} />;
}

export const mcpModule: EditorModule = {
    createEditor: () =>
        new McpInspectorEditorModel(new TComponentState(getDefaultMcpInspectorEditorState())),
    Component: McpInspectorEditorComponent,
};

export { McpInspectorEditorModel, getDefaultMcpInspectorEditorState } from "./McpInspectorEditorModel";
export type {
    McpInspectorEditorState, McpPanelId,
    McpToolInfo, McpToolResult, McpToolsPanelState,
    McpResourceInfo, McpResourceContent, McpResourcesPanelState,
    McpPromptInfo, McpPromptMessage, McpPromptsPanelState,
} from "./McpInspectorEditorModel";
// Legacy EditorModule default-export — consumed by `showMcpInspectorPage` and the
// legacy registry `loadModule` safety-net.
export { default as mcpInspectorEditorModule, default } from "./McpInspectorView";
```

- `McpInspectorView` must be exported by name from `McpInspectorView.tsx` (add
  `export { McpInspectorView };` if it is only a local function today).
- **Delete `src/renderer/editors/mcp-inspector/index.ts`** (folded into `index.tsx`; no
  external importer — verified).

### MC-IMPL5 — v4 registry registration (`register-editors.ts`)

- **Legacy registration of `mcp-view`** — unchanged (it already imports
  `./mcp-inspector/McpInspectorView` and returns `module.default`, which is the preserved
  legacy shim).
- Add an explicit v4 registration block after the mirror loop (mirror Settings/About):
  ```ts
  // US-574 — replace the legacy bare-adapter mirror for mcp-view with a native v4
  // module. MCP Inspector is NO-HOST (no CONTENT_HOST_TRAIT) AND standalone (no file
  // acceptance) — `accepts` always returns -1 (opened only via showMcpInspectorPage,
  // never via openFile). `hasContentHost: false` keeps it out of the switch widget.
  v4EditorRegistry.register({
      id: "mcp-view",
      name: "MCP Inspector",
      hasContentHost: false,
      accepts: () => -1,
      loadModule: async () => {
          const { mcpModule } = await import("./mcp-inspector");
          return mcpModule;
      },
  });
  ```

### MC-IMPL6 — Opt into the generic no-host restore branch (`PagesPersistenceModel.ts`)

- Add `"mcp-view", // US-574` to `V4_NO_HOST_EDITOR_IDS` (8th member). Update the doc
  comment list (remove the `US-574 MCP Inspector → "mcp-view"` line from the "Append…"
  list, or mark it landed).

### MC-IMPL7 — Repoint the launcher import (`PagesLifecycleModel.ts`)

- `showMcpInspectorPage`: change `import("../../editors/mcp-inspector/McpInspectorView")`
  → `import("../../editors/mcp-inspector")` (folder/`index.tsx`). The default export is
  the same preserved legacy shim; `newEmptyEditorModel("mcpInspectorPage")` returns the v4
  model cast as legacy; the existing `model.state.update((s) => { s.url = … })` and
  `wrap(model)` lines are unchanged.

### MC-IMPL8 — No change to facade / PageWrapper / mcp-handler

- **`McpInspectorFacade.ts`** — imports the model type from `./McpInspectorEditorModel`
  (still present); calls only preserved methods → no change.
- **`PageWrapper.asMcpInspector`** — gate `editorId === "mcp-view"` + cast of the unwrapped
  v4 main editor → no change (proven by Browser's `asBrowser`).
- **`mcp-handler.ts`** — the `"mcp-view"` standalone hint is keyed by the unchanged id →
  no edit (parity with AB-IMPL9 / VD optional-hint note).

---

## Concerns / open questions

- **MC-C1 (class naming — RESOLVED, deviation from US-568+ convention).** Prior no-host
  migrations renamed `XxxEditorModel`/`XxxView` classes to `XxxEditor` (Archive, Video) and
  added a compatibility alias. MCP's class is **kept as `McpInspectorEditorModel`** (no
  rename, no alias). Rationale: the model already lives in a clean standalone `.ts` file
  (the prior renames untangled a class from a `.tsx` view file — not applicable here), and
  `McpInspectorFacade` + `PageWrapper` + `McpInspectorView` already import
  `McpInspectorEditorModel` by that exact name. Renaming would ripple to ≥3 files for zero
  benefit. The v4 identity is carried by `editorId = "mcp-view"`, not the class name.
- **MC-C2 (sub-states & connection survive trivially).** `toolsState`/`resourcesState`/`promptsState`
  (TOneState), `connection` (McpConnectionManager), and `_history` are plain instance
  fields — re-parenting the base class does not touch them. They are **not** part of the
  persisted `state`, so `getRestoreData` excludes them automatically and the editor
  restarts disconnected with empty panels (correct — connection is user-initiated).
- **MC-C3 (transient-state reset on persist).** `getRestoreData` must reset
  `connectionStatus`/`errorMessage`/`server*`/`hasTools/Resources/Prompts` so a session
  that quit while connected does not restore showing a stale "connected" header with a dead
  socket (mirror Video's `playerState`/`streamUrl` reset). Plan covers this in MC-IMPL2.
- **MC-C4 (`mcpBrowserPage` legacy alias — out of scope).** `PAGE_TYPE_MIGRATIONS`
  (`mcpBrowserPage → mcpInspectorPage`) lives in the legacy
  `PagesLifecycleModel.newEditorModelFromState` path. The v4 state discriminator stays
  `type: "mcpInspectorPage"`. A pre-rename `"mcpBrowserPage"` session is a pre-existing edge
  (it would already restore as `"monaco"` because no legacy registry def has that
  `editorType`); US-574 neither fixes nor worsens it. No action.
- **MC-C5 (no toolbar / nav-panel migration).** MCP renders its own connection bar via
  `EditorToolbar` and has no file/`getNavigatorTarget`. Unlike Video (which adopted
  `PageToolbar` for the nav button), MCP needs **no** toolbar/nav changes — the view is
  self-contained. Keep `EditorToolbar` as-is.
- **MC-C6 (not a singleton).** Unlike Settings/About/Storybook, `showMcpInspectorPage`
  builds a fresh `PageModel` (no fixed id) on each call. Multiple MCP pages can coexist and
  each persists/restores independently. No de-dupe logic exists today — out of scope.

---

## Acceptance criteria

1. **Open** — `showMcpInspectorPage()` (and the MCP tool / menu entry that calls it) opens
   a native v4 `McpInspectorEditorModel` page with the MCP tab icon; `page.mainEditorV4`
   is a `McpInspectorEditorModel` (not a `LegacyEditorAdapter`).
2. **Open with URL** — `showMcpInspectorPage({ url })` pre-fills the connection bar URL.
3. **Connect / browse** — HTTP and stdio connect succeed; Info/Tools/Resources/Prompts/History
   panels behave exactly as before; tool calls, resource reads, template expansion, prompt
   gets, and "Open in Log View" all work.
4. **Saved connections** — auto-save on connect, fill-from-saved, and delete all work.
5. **Disconnect** — sub-states + history reset; header clears.
6. **Persist / restore** — config (`url`/`transport`/`command`/`args`/`connectionName`/`activePanel`)
   survives an app restart; the restored page comes back **disconnected** with empty panels
   and no stale server header; restore routes through the `V4_NO_HOST_EDITOR_IDS` branch
   (no adapter).
7. **Scripting** — `page.asMcpInspector()` resolves on an MCP page and reflects/controls
   live connection state; throws on non-MCP pages.
8. **Dispose** — closing the tab disconnects the connection manager (no leaked socket/process).
9. **Lint/build clean**; no new ESLint warnings attributable to this change.

---

## Files changed

| File | Change |
|------|--------|
| `src/renderer/editors/mcp-inspector/McpInspectorEditorModel.ts` | **MODIFY** — re-parent to v4 `EditorModel`; `editorId = "mcp-view"`; state `extends EditorStateBase`; explicit identity defaults; `getRestoreData` → `EditorDescriptor` w/ transient reset; `applyRestoreData` typed `RestoreData`; drop no-op `restore()`; keep connection/sub-states/history/dispose/getIcon verbatim |
| `src/renderer/editors/mcp-inspector/McpInspectorView.tsx` | **MODIFY** — preserved legacy `mcpInspectorEditorModule` factories cast the v4 model `as unknown as EditorModel`; add `export { McpInspectorView }` |
| `src/renderer/editors/mcp-inspector/index.tsx` | **CREATE** — v4 `mcpModule` (`createEditor`/`Component`) + re-exports + legacy default re-export |
| `src/renderer/editors/mcp-inspector/index.ts` | **DELETE** — folded into `index.tsx` (no external consumer) |
| `src/renderer/editors/register-editors.ts` | **MODIFY** — add explicit v4 `mcp-view` registration (`hasContentHost: false`, `accepts: () => -1`, loads `mcpModule`) |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | **MODIFY** — add `"mcp-view"` to `V4_NO_HOST_EDITOR_IDS` (8th member) + comment update |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | **MODIFY** — `showMcpInspectorPage` import path → `editors/mcp-inspector` (folder) |

No changes to `McpInspectorFacade.ts`, `PageWrapper.ts`, `mcp-handler.ts`, or the
`ToolsPanel`/`ResourcesPanel`/`PromptsPanel`/`McpConnectionManager`/`McpConnectionStore`
files.
