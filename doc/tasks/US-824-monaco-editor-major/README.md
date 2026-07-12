# US-824: Upgrade `monaco-editor` (0.52.2 → 0.55.1)

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** Done (pending epic review)

## Goal

Upgrade `monaco-editor` from 0.52.2 to 0.55.1 (or latest at pickup) — Persephone's core editor —
in lockstep with its ecosystem (`@monaco-editor/react`, `vite-plugin-monaco-editor`), migrate the
**0.55 breaking namespace move**, and **re-create the clipboard/paste patch** against the new
version so Ctrl+V keeps working. Verify no regression across every Monaco-based editor.

## Background

### Monaco footprint in Persephone

Monaco is imported as an ESM instance and injected into the React wrapper's loader — Persephone
does **not** use the `@monaco-editor/react` CDN/AMD loader:

```ts
// src/renderer/api/setup/configure-monaco.ts
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
loader.config({ monaco });   // inject our ESM instance; no network/AMD load
```

Consumers (the React `<Editor>`/`<DiffEditor>` from `@monaco-editor/react`, plus direct `monaco.*`
API use) span:

- **Setup / config:** `src/renderer/api/setup/configure-monaco.ts` (theme, keybindings, TS/JS
  compiler options, custom languages, extra-libs), `library-intellisense.ts` (script-library
  IntelliSense extra-libs), and the custom languages in `src/renderer/api/setup/monaco-languages/`
  (`reg.ts`, `csv.ts`, `mermaid.ts`, `jsonl.ts`, `log.ts`).
- **Editors:** `editors/monaco/` (MonacoEditor + MonacoBody), `editors/compare/CompareEditor.tsx`
  (diff), `editors/file-diff/` (FileDiffBody + model), `editors/git-tree/CommitDiffPanel.tsx`,
  `editors/shared/ColorizedCode.tsx`, `editors/text/ScriptPanel.tsx`,
  `editors/notebook/note-editor/` (MiniTextEditor + NoteItemEditModel),
  `editors/rest-client/` (RequestBuilder, ResponseViewer),
  `editors/mcp-inspector/` (ToolArgForm, ToolResultView, ResourceContentView),
  `editors/log-view/items/TextOutputView.tsx`, and `ui/dialogs/TextDialog.tsx`.
- **Build:** `vite.renderer.config.ts` wires `vite-plugin-monaco-editor` with
  `languageWorkers: ['typescript', 'editorWorkerService', 'json', 'html']`.

The **only files that use the moved namespaces** (`monaco.languages.typescript` / `.css`) are
`configure-monaco.ts` and `library-intellisense.ts`. Everything else uses `monaco.languages.*`
(register / tokens / completion) and `monaco.editor.*`, which are **unaffected** by the 0.55 move.

### The clipboard / paste patch (must be preserved)

`patches/monaco-editor+0.52.2.patch` (applied by `patch-package` via the `postinstall` script) is
**mandatory** — without it, **Ctrl+V paste does not work** in any Monaco editor.

**Why it exists:** Persephone's renderer runs with `nodeIntegration: true` /
`contextIsolation: false`, so the global `process` object *is* present in the renderer. Monaco's
platform-detection code (copied from VS Code's `base/common`) then misclassifies the renderer as a
**native (non-sandboxed) Node.js environment** instead of a browser, which routes clipboard
handling down the wrong (native) path and breaks paste.

**What the patch does:** it neutralizes the `process`-based "native environment" branch in two
files by appending `&& false` to the condition, forcing Monaco onto the browser code path:

- `node_modules/monaco-editor/esm/vs/base/common/platform.js`
- `node_modules/monaco-editor/esm/vs/base/common/process.js`

```js
// both files, the branch that must be neutralized:
-else if (typeof process !== 'undefined' && typeof process?.versions?.node === 'string') {
+else if (typeof process !== 'undefined' && typeof process?.versions?.node === 'string' && false) {
```

The patch filename is **version-pinned** (`monaco-editor+0.52.2.patch`). `patch-package` matches
the file to the installed version; after the bump the old patch **will not apply** (wrong version
in the name, and possibly shifted anchor lines) and `postinstall` will fail. The patch must be
**re-created** against 0.55.1 — see Step 4.

### Version delta 0.52.2 → 0.55.1 and Persephone impact

| Version | Change | Impact on Persephone |
|---------|--------|----------------------|
| **0.53.0** | **AMD build deprecated** (ESM-only going forward; internal AMD modules, custom AMD workers, and the unbundled `browser-script-editor` scenario no longer work). New: Next Edit Suggestion, scroll-on-middle-click, Edit Context. | **None.** Persephone is fully ESM (Vite + `import * as monaco`) and injects the instance via `loader.config({ monaco })`, so it never touches the AMD loader. |
| **0.54.0** | New `editor.mouseMiddleClickAction` option; bug fixes. | **None.** Not used; opt-in. |
| **0.55.0** | **BREAKING — nested language namespaces moved to top level:** `monaco.languages.{css,html,json,typescript}` → `monaco.{css,html,json,typescript}`. New `lsp` namespace (native LSP). dompurify → 3.2.7. | **Requires code change** in `configure-monaco.ts` + `library-intellisense.ts` (see below). LSP unused. |
| **0.55.1** | Bug fix: "missing language exports (monaco.json/typescript) due to wrong `types` path." | **Pin 0.55.1, not 0.55.0** — 0.55.0 shipped a broken `types` path for exactly the namespaces we consume. |

#### The 0.55 breaking change — verified against the 0.55.1 type definitions

The old nested paths are **not** kept as working aliases — they are **removed** and replaced with
dead deprecation stubs. From `monaco-editor@0.55.1/monaco.d.ts`:

```ts
declare namespace languages {
    /** @deprecated Use the new top level "css" namespace instead. */
    export const css: { deprecated: true };
    /** @deprecated Use the new top level "html" namespace instead. */
    export const html: { deprecated: true };
    /** @deprecated Use the new top level "json" namespace instead. */
    export const json: { deprecated: true };
    /** @deprecated Use the new top level "typescript" namespace instead. */
    export const typescript: { deprecated: true };
}
```

The top-level `monaco` object now maps `css`, `html`, `json`, `typescript` (and new `lsp`) as
first-class namespaces. So `monaco.languages.typescript` is now the object `{ deprecated: true }`:

- **Compile time:** `monaco.languages.typescript.typescriptDefaults` → TS error (property missing).
- **Runtime:** `.typescriptDefaults` is `undefined` → `Cannot read properties of undefined`.

**This is a hard, mandatory find-and-replace** — 16 call sites across 2 files (below).
`monaco.languages` itself (register / setMonarchTokensProvider / completion providers / etc.) is
**unchanged**, so the custom-language files in `monaco-languages/` need no edit.

### Ecosystem lockstep

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| `@monaco-editor/react` | 4.7.0 | **4.7.0 (no bump)** | Peer dep is `monaco-editor ">= 0.25.0 < 1"` — 0.55.1 already satisfied. Persephone injects its own instance via `loader.config({ monaco })`, so the wrapper just renders it. |
| `vite-plugin-monaco-editor` | 1.1.0 | **watch — may need the ESM fork** | **Abandoned** (last publish **July 2022**), peer `monaco-editor >=0.33.0`. There are reports of `editor.worker` **resolution failures** with this plugin on monaco 0.55.1. If the dev server or `build-prod` fails to resolve a worker, switch to the maintained fork **`vite-plugin-monaco-editor-esm@2.0.2`** (Jan 2025) — same plugin API and `languageWorkers` option, drop-in. See Concerns. |

## Implementation plan

> Work on `upcoming-v4.0.14` (per the EPIC-040 branch decision — no separate branches).

### Step 1 — Bump the package

Edit `package.json`: `"monaco-editor": "^0.52.2"` → `"^0.55.1"`. Leave `@monaco-editor/react` at
`^4.7.0`. Then install. Because the floor moves above the locked version, `npm install`
re-resolves; verify:

```
node -e "console.log(require('./node_modules/monaco-editor/package.json').version)"
```

> **Note:** `postinstall` (`patch-package`) will **fail** here because `monaco-editor+0.52.2.patch`
> no longer matches — that is expected and handled in Step 4. Install with
> `npm install --ignore-scripts` first if the failing postinstall blocks the install, then proceed;
> the patch is re-created and re-applied in Step 4.

### Step 2 — Migrate the 0.55 namespace move (mandatory)

Replace every `monaco.languages.typescript` → `monaco.typescript` and every
`monaco.languages.css` → `monaco.css`. Two files, 16 sites total:

**`src/renderer/api/setup/configure-monaco.ts`** (14 sites):

| Line(s) | Before | After |
|---------|--------|-------|
| 129 | `monaco.languages.css.cssDefaults.setOptions({` | `monaco.css.cssDefaults.setOptions({` |
| 133 | `monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({` | `monaco.typescript.typescriptDefaults.setDiagnosticsOptions({` |
| 139 | `monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({` | `monaco.typescript.javascriptDefaults.setDiagnosticsOptions({` |
| 149 | `monaco.languages.typescript.typescriptDefaults.setCompilerOptions({` | `monaco.typescript.typescriptDefaults.setCompilerOptions({` |
| 150 | `target: monaco.languages.typescript.ScriptTarget.Latest,` | `target: monaco.typescript.ScriptTarget.Latest,` |
| 153 | `monaco.languages.typescript.ModuleResolutionKind.NodeJs,` | `monaco.typescript.ModuleResolutionKind.NodeJs,` |
| 154 | `module: monaco.languages.typescript.ModuleKind.CommonJS,` | `module: monaco.typescript.ModuleKind.CommonJS,` |
| 157 | `jsx: monaco.languages.typescript.JsxEmit.React,` | `jsx: monaco.typescript.JsxEmit.React,` |
| 163 | `monaco.languages.typescript.javascriptDefaults.setCompilerOptions({` | `monaco.typescript.javascriptDefaults.setCompilerOptions({` |
| 164 | `target: monaco.languages.typescript.ScriptTarget.Latest,` | `target: monaco.typescript.ScriptTarget.Latest,` |
| 167 | `monaco.languages.typescript.ModuleResolutionKind.NodeJs,` | `monaco.typescript.ModuleResolutionKind.NodeJs,` |
| 168 | `module: monaco.languages.typescript.ModuleKind.CommonJS,` | `module: monaco.typescript.ModuleKind.CommonJS,` |
| 202 | `monaco.languages.typescript.javascriptDefaults.addExtraLib(` | `monaco.typescript.javascriptDefaults.addExtraLib(` |
| 207 | `monaco.languages.typescript.typescriptDefaults.addExtraLib(` | `monaco.typescript.typescriptDefaults.addExtraLib(` |

**`src/renderer/api/setup/library-intellisense.ts`** (2 sites):

| Line(s) | Before | After |
|---------|--------|-------|
| 51 | `monaco.languages.typescript.javascriptDefaults.addExtraLib(` | `monaco.typescript.javascriptDefaults.addExtraLib(` |
| 57 | `monaco.languages.typescript.typescriptDefaults.addExtraLib(` | `monaco.typescript.typescriptDefaults.addExtraLib(` |

> A blanket find/replace of the two literal strings `monaco.languages.typescript` →
> `monaco.typescript` and `monaco.languages.css` → `monaco.css` across `src/` is safe: those two
> exact prefixes appear **only** in these two files (confirmed by grep). Do **not** touch
> `monaco.languages.` used for `register`, `setMonarchTokensProvider`, `registerCompletionItemProvider`,
> etc. — those stay.

### Step 3 — Typecheck (primary gate)

`npm run typecheck`. This is where the namespace migration is validated (the old stubs are typed
`{ deprecated: true }`, so any missed site errors). Fix any remaining site the table missed.
Also confirm no other Monaco type surface we use (`monaco.editor.*`, `monaco.KeyMod`,
`monaco.KeyCode`, `ITokenThemeRule`, diff editor types) changed.

### Step 4 — Re-create the clipboard/paste patch (mandatory — do not skip)

1. Confirm the anchor still exists in 0.55.1. Open
   `node_modules/monaco-editor/esm/vs/base/common/platform.js` and
   `.../process.js` and find the branch:
   `else if (typeof process !== 'undefined' && typeof process?.versions?.node === 'string') {`
   (VS Code base code — expected to be present; the surrounding lines may have shifted slightly,
   which is exactly why the old pinned patch won't reapply cleanly.)
2. Manually apply the edit to **both** files — append `&& false` to that condition (see the
   Background snippet).
3. Regenerate the patch and remove the stale one:
   ```
   npx patch-package monaco-editor          # writes patches/monaco-editor+0.55.1.patch
   ```
   Delete `patches/monaco-editor+0.52.2.patch`.
4. Verify the round-trip: `rm -rf node_modules/monaco-editor` is overkill — instead run
   `npx patch-package` (no args) or a clean `npm ci`/`npm install` and confirm the postinstall
   applies `monaco-editor+0.55.1.patch` **cleanly** (no "patch failed" / fuzz warnings).
5. If the anchor genuinely moved so the `&& false` insertion no longer maps 1:1, re-locate the
   equivalent `process.versions.node` "native environment" branch and neutralize it the same way;
   the intent (force browser path) is what matters, not the exact line number.

### Step 5 — Lint + production build

`npm run lint` and `node scripts/build-prod.mjs`. The build step is the one that exercises
`vite-plugin-monaco-editor`'s **worker bundling** for `['typescript', 'editorWorkerService',
'json', 'html']` against 0.55.1 — the most likely ecosystem break (see Concerns). If a worker
fails to resolve (e.g. `Could not resolve "monaco-editor/esm/vs/editor/editor.worker"`), switch the
plugin to `vite-plugin-monaco-editor-esm@2.0.2`:

- `package.json`: replace `vite-plugin-monaco-editor` with `vite-plugin-monaco-editor-esm`.
- `vite.renderer.config.ts`: update the import
  (`import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'`); the call and
  `languageWorkers` option are unchanged.

### Step 6 — Boot + manual editor regression (Tier 2)

`npm start`, then exercise the Monaco-based editors and confirm:

- **Paste works** — Ctrl+V in a Monaco text page (the patch's whole purpose). Also Ctrl+C / Ctrl+X.
- Syntax highlighting across languages, incl. the custom ones (reg / csv / mermaid / jsonl / log).
- IntelliSense / hover in a `.js`/`.ts` script page (exercises `monaco.typescript` compiler
  options + `addExtraLib` extra-libs from `library-intellisense.ts` and `_imports.txt`).
- Multi-cursor + the custom keybindings from `redefineKeybinding` (Ctrl+Y delete-line,
  Shift+Alt+Arrows column-select).
- **Compare/diff mode** (`CompareEditor`, `FileDiffBody`, git `CommitDiffPanel`).
- Theme switching (light/dark) recolors Monaco (`applyMonacoTheme`).
- Rest-client editors, MCP-inspector views, notebook mini-editor, `TextDialog`, `ColorizedCode`.

### Step 7 — Docs

If any public behavior/setup changed (e.g. plugin swap), note it. Update the CLAUDE.md **Key
Files** / any architecture doc only if a top-level structural pointer changed (the plugin name, if
swapped). No user-facing `/docs/` change expected — the editor behaves identically.

## Concerns / Open questions

- **`vite-plugin-monaco-editor` worker resolution on 0.55.1 (primary risk).** The plugin is
  abandoned (last publish 2022) and there are reports of `editor.worker` resolution failures on
  0.55.1. Mitigation is decided and low-risk: the maintained drop-in fork
  `vite-plugin-monaco-editor-esm@2.0.2` (same API). Try the current plugin first; swap only if the
  build/dev server actually fails to resolve a worker. **Do not** hand-roll `MonacoEnvironment`
  worker wiring — use the fork.
- **Patch anchor drift.** The `&& false` patch is pinned by filename and by surrounding context.
  The VS Code `platform.js`/`process.js` node-detection branch is stable, but the anchor lines may
  shift between 0.52 → 0.55, which is why the patch must be **re-created**, not renamed. Step 4
  covers re-location if the exact insertion point moved. **This patch is the single
  highest-priority item** — a silently-unapplied patch means broken paste in production.
- **No new `lsp` adoption.** 0.55's native LSP namespace is out of scope; we only migrate off the
  moved namespaces. Note for a future task if we ever want real language servers.
- **0.55.0 vs 0.55.1.** Must pin **0.55.1** — 0.55.0's broken `types` path affects exactly the
  `typescript`/`json` exports Persephone consumes.
- **dompurify 3.2.7 (transitive, in 0.55).** Monaco's internal sanitizer; not a direct dep, no
  action, noted for completeness.

## Verification log (2026-07-12)

Implemented on `upcoming-v4.0.14`. The 0.55 namespace migration was the only source code change
(16 sites, 2 files); the clipboard patch was re-created against 0.55.1. **No plugin swap was
needed** — the existing `vite-plugin-monaco-editor@1.1.0` bundled all four workers cleanly on
0.55.1, so the `vite-plugin-monaco-editor-esm` fallback stayed unused.

| Check | Result |
|-------|--------|
| Installed version | ✅ `0.55.1` (`npm install --ignore-scripts`, then patch re-created) |
| Namespace migration | ✅ 16 sites → `monaco.typescript` / `monaco.css`; zero `languages.{typescript,css,html,json}` references remain (grep clean) |
| Patch anchor present in 0.55.1 | ✅ `platform.js` (line 27) + `process.js` (line 20) — shifted from 0.52.2's 25/16, confirming the old pinned patch could not have reapplied |
| Patch re-created | ✅ `patches/monaco-editor+0.55.1.patch` written; `patches/monaco-editor+0.52.2.patch` deleted |
| `npx patch-package` (postinstall round-trip) | ✅ `monaco-editor@0.55.1 ✔` — applies cleanly, no fuzz |
| `npm run typecheck` | ✅ clean |
| `npm run lint` | ✅ clean |
| `node scripts/build-prod.mjs` | ✅ built in ~33s; workers bundled — `monacoeditorwork/{editor,ts,json,html}.worker.bundle.js` all present |
| `npm start` boot + **Ctrl+V paste** | ✅ confirmed manually by the user |
| **Context-menu "Paste"** (after the third patch hunk — see below) | ✅ confirmed manually by the user |

## Related fix — context-menu "Paste" broken (upstream 0.55 bug; patch extended)

Surfaced during manual testing: **Ctrl+V worked, but the Monaco context-menu "Paste" did
nothing** — silently, no error anywhere.

### Root cause (diagnosed live via CDP against the running app)

Monaco 0.55's paste command implementation
(`esm/vs/editor/contrib/clipboard/browser/clipboard.js`, the `'code-editor'` implementation of
`editor.action.clipboardPasteAction`) **eagerly resolves `IProductService`** on its first lines:

```js
const productService = accessor.get(IProductService);   // line 238
```

but `IProductService` is **not registered in Monaco's standalone services**
(`standaloneServices.js` — zero references; it's VS Code telemetry plumbing that leaked into the
contrib; the service is only used in an `if (productService.quality !== 'stable')` telemetry
branch). The `accessor.get()` throws
`[invokeFunction] unknown service 'productService'`, the whole paste implementation dies before
touching the clipboard, and the rejection is swallowed → menu-paste silently no-ops. This is an
upstream monaco standalone bug (the recurring "depends on UNKNOWN service" class; the symptom
matches [monaco-editor #5068](https://github.com/microsoft/monaco-editor/issues/5068)).

Ctrl+V is unaffected because with our platform patch (`isNative=false`) Monaco does **not** bind
the Ctrl+V keybinding — the native browser `paste` DOM event delivers the content directly,
never entering this code path.

Diagnostic evidence (in the live app, via `browser_evaluate` on `pageId:"app"`): hooked
`console.error` + `unhandledrejection`, tapped `navigator.clipboard.readText`, triggered
`editor.action.clipboardPasteAction` on a focused editor → `readText` was **never called**; the
unhandled rejection named `productService` at the paste implementation's frame. Clipboard-read
permission was `granted` (Electron grants by default — a permission theory was tested first and
ruled out; a temporary session-permission handler in `main-setup.ts` was reverted as a no-op).

### Fix — third hunk in the monaco patch

`patches/monaco-editor+0.55.1.patch` now patches **three** files:

| File | Edit | Purpose |
|------|------|---------|
| `esm/vs/base/common/platform.js` | `… === 'string' && false` | force browser platform path (Ctrl+V paste — pre-existing) |
| `esm/vs/base/common/process.js` | `… === 'string' && false` | same (pre-existing) |
| `esm/vs/editor/contrib/clipboard/browser/clipboard.js` | `accessor.get(IProductService)` → `{ quality: 'stable' }` stub | **new** — unbreak context-menu Paste; the stub keeps the downstream telemetry branch disabled |

After re-patching, `node_modules/.vite` (the dev dep cache) was **deleted** — Vite keys the cache
on the lockfile, not file contents, so it would otherwise keep serving the un-fixed monaco chunk.
The next `npm start` re-optimizes from the patched files.

## Acceptance criteria

- [x] `package.json` shows `monaco-editor` at `^0.55.1`; lockfile regenerated; installed version
      confirmed 0.55.1.
- [x] All 16 namespace call sites migrated (`monaco.languages.typescript`→`monaco.typescript`,
      `monaco.languages.css`→`monaco.css`); `npm run typecheck` passes.
- [x] `patches/monaco-editor+0.55.1.patch` exists, `+0.52.2.patch` deleted, and
      `postinstall`/`patch-package` applies it **without** failure/fuzz.
- [x] `npm run lint` passes and `node scripts/build-prod.mjs` builds all targets (workers bundle;
      no ESM-fork swap needed).
- [x] `npm start` boots clean; **Ctrl+V paste works** in a Monaco editor (patch verified live);
      **context-menu Paste works** (third patch hunk).
- [x] Manual regression: user-verified paste paths + clean boot; no regressions reported.
- [x] DRM/browser and non-Monaco areas untouched (sanity boot).

## Files changed (expected)

| File | Change |
|------|--------|
| `package.json` | `monaco-editor` → `^0.55.1`. Possibly swap `vite-plugin-monaco-editor` → `vite-plugin-monaco-editor-esm` (only if the worker build fails). |
| `package-lock.json` | Regenerated. |
| `src/renderer/api/setup/configure-monaco.ts` | 14 namespace sites → top-level `monaco.typescript` / `monaco.css`. |
| `src/renderer/api/setup/library-intellisense.ts` | 2 namespace sites → `monaco.typescript`. |
| `patches/monaco-editor+0.55.1.patch` | **New** — re-created clipboard/paste patch. |
| `patches/monaco-editor+0.52.2.patch` | **Deleted** — stale version. |
| `vite.renderer.config.ts` | Only if the plugin is swapped — update the import (call + options unchanged). |

## Files that need NO changes

- `@monaco-editor/react` — stays 4.7.0 (peer already allows 0.55.1; instance is injected).
- The custom language files `src/renderer/api/setup/monaco-languages/*.ts` — they use
  `monaco.languages.register` / tokens / completion, which are **unmoved**.
- Every editor component that renders Monaco / diff (`editors/monaco/`, `compare/`, `file-diff/`,
  `git-tree/CommitDiffPanel`, `ColorizedCode`, rest-client, mcp-inspector, notebook mini-editor,
  `TextDialog`, `log-view/TextOutputView`) — no moved-namespace usage.
