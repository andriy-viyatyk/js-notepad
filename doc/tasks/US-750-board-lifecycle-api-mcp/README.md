# US-750: App API + MCP for board lifecycle (+ agent boards guide)

**Epic:** [EPIC-035 — Boards Anywhere](../../epics/EPIC-035.md)
**Depends on:** US-745 (manifest), US-746 (`createBoardFromTemplate`, single-board mode), US-747 (board trust + auto-trust on create), US-748 (`persephone-board://` open-by-link)
**Status:** Implemented — awaiting user testing. (`tsc` + ESLint clean.)

## Goal

Let an agent stand up and develop a board **with zero user clicks**. Web Boards are
first-class MCP functionality, so the lifecycle gets dedicated MCP tools **and** a script API:

1. **MCP tools (C750-3, revised):** **`create_board { name, dir, demo? }`** → `{ boardRoot }`
   (scaffold, auto-trusted) and **`open_board { path }`** (open it). The agent runs the whole
   loop with these tools — no `execute_script` + hand-encoded link needed.
2. **Script API `app.boards`:** `createBoard(name, dir)` / `createDemoBoard(name, dir)` → board
   root, and **`openBoard(root)`** (C750-4, revised) — the same lifecycle from `execute_script`.
   Boards created this way are **auto-trusted at creation** (C5 — `createBoardFromTemplate`), so
   the loop never hits the trust gate.
3. **Generic `app.openRawLink(href)`:** opens any href (file / URL / in-app scheme) in a new or
   reused tab and makes it active. `app.boards.openBoard` and the `open_board` tool both route a
   `persephone-board://` link through it; the encoding lives in one tested place
   (`encodePersephoneBoardLink`), never hand-built by the agent.

After opening, the board is the **active page** (`editor: "board-view"`); the agent verifies via
`get_active_page` / `list_pages` and uses the page's `pageId` for `browser_*` testing.

This task also **documents the capability for agents**: a "Web Boards" scenario in the MCP
server instruction, and a new **`boards` guide** (`read_guide("boards")` / `notepad://guides/boards`)
— a self-contained board-authoring reference (what a board is → `create_board`/`open_board`
lifecycle → develop → test) combining the in-board guide (`assets/board-template/CLAUDE.md`) with
the Demo board pointer.

> **Design revised 2026-06-21 (after MCP testing).** The original carve had **no** MCP tools
> (C750-3) and **no** `openBoard` (C750-4) — the agent was to use `execute_script` + a
> hand-encoded `persephone-board://` link. A live test with two fresh, context-free agents
> showed the hand-encoded `btoa(JSON.stringify(...))` open step was the one real friction point,
> and that boards — a new, important capability — warrant first-class MCP tools. So C750-3/C750-4
> were reopened: dedicated `create_board` / `open_board` tools + an `app.boards.openBoard` method
> were added (generic `app.openRawLink` is kept).

## Background

### Everything the lifecycle needs already exists (US-745…US-748)

The canonical, **editor-independent** create function is already built and already does auto-trust:

`src/renderer/editors/board/board-scaffold.ts:48`
```ts
// Creates board `name` inside container `dir` from `template`; scaffolds files +
// board-base.css, guarantees board-manifest.json, AUTO-TRUSTS (C5), returns boardRoot.
export async function createBoardFromTemplate(name: string, dir: string, template: string): Promise<string>
```
- Errors on name collision (`boardRoot` already exists).
- On template-copy failure still produces a usable empty board + warns.
- Always `ensureBoardManifest(boardRoot)`.
- Always `boardTrust.trust(boardRoot)` → **a board this API creates is trusted by provenance** (C5), never by a manifest field (C2).
- Returns the new board's absolute root path.

Opening a board by path is the US-748 pipeline — fire `openRawLink` with a `persephone-board://` link (pattern already live in `ExplorerSecondaryView.tsx:88`):
```ts
app.events.openRawLink.sendAsync(
    createLinkData(encodePersephoneBoardLink(boardRoot), { pageId, sourceId: "..." }),
);
```
This routes to `target: "board-view"` → `BoardEditorModel.initFromBoardRoot(boardRoot)` (single-board mode). A foreign/untrusted board renders `UntrustedBoardView`; a missing/non-board path renders `BoardNotFoundView` (US-748 C748-3). **No new open-pipeline code is needed.**

Manifest helper for validation: `src/renderer/editors/board/board-manifest.ts` — `isBoardFolder(boardRoot): Promise<boolean>`, `BOARD_MANIFEST_FILE`.

### The `app` script-API surface — how a namespace is wired

`app` is a singleton `App` class (`src/renderer/api/app.ts:314 export const app = new App()`). Each namespace is a private field + public getter, lazily imported in `initServices()`. The `proc` namespace is the exact template to mirror:

- field: `app.ts:39` `private _proc = undefined as unknown as IProc;`
- getter: `app.ts:83` `get proc(): IProc { return this._proc; }`
- init: `app.ts:134-155` — `import("./proc")` in the `Promise.all`, then `this._proc = proc;`
- script wrapper: `src/renderer/scripting/api-wrapper/AppWrapper.ts:109` `get proc() { return app.proc; }`
- types: `src/renderer/api/types/proc.d.ts` declares `IProc`; `IApp` in `src/renderer/api/types/app.d.ts:24` lists `readonly proc: IProc;`. The Vite `editorTypesPlugin` flat-copies every `*.d.ts` from `api/types/` into `assets/editor-types/` and regenerates `_imports.txt` automatically — **no manual registry edit** for a new `boards.d.ts`.

`proc` is exported as a plain singleton object from `src/renderer/api/proc.ts` (`export const proc: IProc = { ... }`). `app.boards` mirrors this: a new `src/renderer/api/boards.ts` exporting `export const boards: IBoards = { ... }`.

A **top-level method** (not a namespace) is the `app.fetch` shape — an arrow-function field on the `App` class (`app.ts:95 fetch = async (url, options) => ...`), declared on `IApp` as `fetch(url, options)` (`app.d.ts:83`), and re-exported in the script wrapper as a bound field (`AppWrapper.ts:124 fetch = app.fetch;`). **`app.openRawLink(href)` follows this exact pattern.**

### MCP: no new tools (C750-3)

No board-specific MCP tools are added. The agent already has the generic **`execute_script`** tool — it runs `app.boards.createBoard(...)` / `openBoard(...)` through it exactly as it runs any other `app` API. So **`src/renderer/api/mcp-handler.ts` and the `server.tool(...)` declarations in `src/main/mcp-http-server.ts` are NOT touched.** The only main-process edits are additive docs: register the new guide and update the instruction text (see below).

### MCP instruction text + guides registry

All in `src/main/mcp-http-server.ts` inside `createMcpServer()`:
- **Instruction string:** `:143-182` — an array joined with `"\n"`, passed as `instructions`. Starts with `"Persephone is a developer notepad ..."` (`:144`). "Common scenarios" section at `:152`.
- **Guides registry:** `resourceFiles` array `:200-243` — `{ name, uri, file, description }`. Each maps a guide name → `assets/mcp-res-*.md`. Auto-registered as MCP resources by the loop at `:680`, and auto-concatenated into `notepad://guides/full` (`:696`).
- **`read_guide` tool:** `:640-676` — the `guide` param is `z.enum([...])` (`:655`, 7 names today); the tool description (`:642-653`) lists each guide. Both must gain `"boards"`.
- **Asset bundling:** `getAssetPath()` (`src/main/utils.ts:28`) resolves `assets/` in dev and `process.resourcesPath/assets` packaged; `forge.config.ts:9 extraResource: ["./assets"]` ships the whole folder — **a new `assets/mcp-res-boards.md` needs no build-config change.**

## Recommended design

**Signatures:**
```ts
// app.boards namespace — CREATE only
interface IBoards {
    createBoard(name: string, dir: string): Promise<string>;      // → new board root (blank template)
    createDemoBoard(name: string, dir: string): Promise<string>;  // → new board root (demo template)
}

// top-level app method — OPEN (generic, any href)
app.openRawLink(href: string): Promise<void>;
```
- `dir` is **required** (the "user-specified path" — the container folder the board is created inside). A script/agent has no implicit "current project," so there is no default.
- `create*` **returns the absolute board root** and **does not auto-open** — clean separation. They delegate to `createBoardFromTemplate(name, dir, "board-template" | "demo-board")`, inheriting auto-trust + manifest + collision-error for free, and first **ensure `dir` exists** (`fs.mkdir(dir)` recursive) so creating into a not-yet-existing container works (C750-5).
- **`app.openRawLink(href)`** is a thin wrapper over `app.events.openRawLink.sendAsync(createLinkData(href, { sourceId: "app-api" }))`. It is **generic** (opens files, URLs, folders, boards — any scheme the parsers handle), not board-specific. With **no `pageId`** it opens a new (or reuses the existing) tab and that tab becomes **active**.
- **Opening a board** = `app.openRawLink(<persephone-board:// link for the board root>)`. The `persephone-board://` link is base64-of-JSON (US-748 — Windows paths can't ride raw in a URL), so the agent builds it inline; the guide gives the copy-paste snippet:
  ```js
  const root = await app.boards.createBoard("My Board", "C:/work/boards");
  await app.openRawLink("persephone-board://" + btoa(JSON.stringify({ boardRoot: root })));
  ```
  No validation in `app.openRawLink` (C750-4): a missing/non-board path renders US-748's `BoardNotFoundView`, and a foreign/untrusted board renders `UntrustedBoardView` + trust prompt — both already graceful. The agent confirms success with `get_active_page` / `list_pages`.

**MCP surface: none added (C750-3).** The agent uses the existing `execute_script` tool. The `boards` guide shows the exact script.

**Module coupling:** `api/boards.ts` reaches into `editors/board/board-scaffold.ts` (`createBoardFromTemplate`). To avoid statically coupling the core `api` bundle to editor-adjacent code (and to keep code-splitting), the create methods use **dynamic `import()`** for `board-scaffold`. `app.openRawLink` lives on the `App` class itself and only needs `createLinkData` (a `shared/` import — no coupling concern). (C750-6.)

**Agent guide:** new `assets/mcp-res-boards.md` — self-contained, agent-facing. It combines the *what/how-to-develop* content from `assets/board-template/CLAUDE.md` (execute() channel, `--p-*` theme contract, local-vendoring/CSP, manifest, icon, reload, `browser_*` testing) with the *lifecycle via `execute_script`*: call `app.boards.createBoard(name, dir)` (auto-trusted) → `app.boards.openBoard(root)` → edit files (the agent's own file tools, or `app.fs` inside another `execute_script`) → iterate. It includes a **copy-paste `execute_script` snippet** for create-and-open. Ends by pointing at the Demo board (`assets/demo-board/`) as the richer reference. (C750-7 covers the duplication-maintenance trade-off.)

## Implementation plan

### Step 1 — Script API types: `src/renderer/api/types/boards.d.ts` (new)

Declare `IBoards` with the **two create methods** + thorough doc comments and an `@example` that shows the create→open flow with `app.openRawLink` (mirror `proc.d.ts`'s self-contained style — no cross-dir imports; the flat-copy can't follow them).

### Step 2 — Register `boards` + `openRawLink` on `IApp`

**Edit `src/renderer/api/types/app.d.ts`:**
- `import type { IBoards } from "./boards";` at the top (alongside `IProc`).
- add `readonly boards: IBoards;` to `IApp` (after `proc`, `:56`).
- add the `openRawLink` method declaration (after `fetch`, `:83`) with a doc comment + example:
  ```ts
  /**
   * Open any link through Persephone's navigation pipeline — a file path, a URL,
   * or an in-app scheme (`persephone-board://`, `persephone-folder://`, …). Opens a
   * new tab (or reuses a matching one) and makes it the active page.
   *
   * @example
   * await app.openRawLink("C:/data/report.json");          // open a file
   * await app.openRawLink("https://example.com");           // open a URL in the browser
   */
  openRawLink(href: string): Promise<void>;
  ```

### Step 3 — Implementation module: `src/renderer/api/boards.ts` (new)

```ts
import { fs } from "./fs";
import type { IBoards } from "./types/boards";

async function create(name: string, dir: string, template: string): Promise<string> {
    await fs.mkdir(dir); // ensure the container exists (recursive); no-op if present
    const { createBoardFromTemplate } = await import("../editors/board/board-scaffold");
    return createBoardFromTemplate(name, dir, template);
}

export const boards: IBoards = {
    createBoard: (name, dir) => create(name, dir, "board-template"),
    createDemoBoard: (name, dir) => create(name, dir, "demo-board"),
};
```
(Confirm `fs.mkdir` is recursive / no-throw-if-exists; if not, guard with `fs.exists`.)

### Step 4 — Wire `app.boards` + add `app.openRawLink`

**Edit `src/renderer/api/app.ts`:**
- `app.boards`: `private _boards` field (after `:39`); `get boards(): IBoards { return this._boards; }` (after `:85`); add `import("./boards")` to the `initServices()` `Promise.all` destructure (`:134-155`) and `this._boards = boards;`; import `IBoards` at the top.
- `app.openRawLink`: add an arrow-field method on the `App` class next to `fetch` (`:95`):
  ```ts
  openRawLink = async (href: string): Promise<void> => {
      await this._events.openRawLink.sendAsync(createLinkData(href, { sourceId: "app-api" }));
  };
  ```
  Add `import { createLinkData } from "../../shared/link-data";` at the top (the `App` class already holds `this._events = new AppEvents()`).

**Edit `src/renderer/scripting/api-wrapper/AppWrapper.ts`:**
- `get boards() { return app.boards; }` (after `:111`).
- `openRawLink = app.openRawLink;` (next to `fetch = app.fetch;`, `:124`).

### Step 5 — New agent guide: `assets/mcp-res-boards.md` (new)

Self-contained board-authoring reference for an agent that has only `execute_script` and no board yet. Sections:
1. **What a board is** — frontend (`index.html`+`app.js`) + backend scripts + the `persephone.execute()` channel (condensed from board-template/CLAUDE.md).
2. **Create & open one (via `execute_script`)** — a copy-paste snippet:
   ```js
   const root = await app.boards.createBoard("My Board", "C:/work/boards"); // blank; createDemoBoard for the demo
   await app.openRawLink("persephone-board://" + btoa(JSON.stringify({ boardRoot: root }))); // open it
   return root;
   ```
   Note: `createBoard`/`createDemoBoard` return the board root and auto-trust it; `dir` is the container folder (created if missing); a name collision throws. The board opens on the **active page** — confirm with `get_active_page` and read its `pageId` for `browser_*` testing.
3. **Develop it** — edit `index.html`/`app.js`/`scripts/*` (the agent's own file tools, or `app.fs` inside another `execute_script`); the `persephone.execute()` buffered/streaming/marker patterns; the integration tier (`openRawLink`/`notify`/dialogs); the `--p-*` theme contract; **vendor libraries locally (CSP blocks CDNs)**; the manifest; the optional `icon.*`; reload behavior.
4. **Test it** — drive the open board with `browser_*` tools (`list_pages` → `browser_snapshot` → `browser_click`/`type`/`evaluate`).
5. **Richer reference** — read the bundled Demo board files (`assets/demo-board/`).

### Step 6 — Register the guide

**Edit `src/main/mcp-http-server.ts`:**
- add to `resourceFiles` (`:200-243`):
  ```ts
  { name: "boards-guide", uri: "notepad://guides/boards", file: "mcp-res-boards.md",
    description: "Web Boards guide — what a board is, the execute_script + app.boards create/open lifecycle, the execute() channel, --p-* theme contract, local vendoring, and browser_* testing. Read BEFORE building or opening a board." },
  ```
- `read_guide` enum `:655`: add `"boards"`.
- `read_guide` description `:642-653`: add `"- boards — what a board is, the app.boards create/open lifecycle (via execute_script), develop & test a board."`
- the unknown-guide fallback string `:662` lists names — add `boards`.

### Step 7 — Update the MCP instruction text

**Edit `src/main/mcp-http-server.ts:152-173`** — add a "Web Boards" scenario in "Common scenarios" (before Browser automation):
```
"**Build a custom board/editor for the user:**",
"Persephone has custom **Web Boards** — sandboxed mini web-apps (HTML + backend scripts) that you, the agent, can build for the user: dashboards, tools, viewers, custom editors. Create one with `execute_script` calling `app.boards.createBoard(name, dir)` (auto-trusted), open it with `app.openRawLink(...)`, then develop it by editing its files. IMPORTANT: read read_guide(\"boards\") first.",
```

### Step 8 — Teach the `/document` skill to track + reconcile the board docs (C750-7)

**Edit `.claude/skills/document/SKILL.md` § "4. Board documentation (`assets/` — consumer-facing)":**
- Add a third row to the doc table:
  | `assets/mcp-res-boards.md` | The **agent-facing** boards guide served by `read_guide("boards")` / `notepad://guides/boards` — what a board is, the `execute_script` create→open lifecycle (`app.boards.createBoard`/`createDemoBoard` + `app.openRawLink`), develop & test. | The board lifecycle API (`app.boards`, `app.openRawLink`), the `persephone.*` bridge, the `--p-*` contract, or the `browser_*` testing flow changes. |
- Add a bullet under the table:
  > - The three board docs overlap on authoring content (`board-template/CLAUDE.md` is the canonical *authoring* reference; `mcp-res-boards.md` is the condensed agent-facing copy **plus** the create/open lifecycle; `demo-board/` is the living example). **Each run, cross-check them for discrepancies and fix the drift** — bring the condensed copy back in line with the canonical authoring guide and the current API.

Keep these edits ticket-free (the skill file is process doc, but the board docs it points at are consumer-facing — no `US-`/`EPIC-` ids leak into them).

## Concerns / open questions

- **C750-1 — `app.boards` namespace vs. extending an existing one. ✅ Decided (user, 2026-06-21): a separate `app.boards` namespace.** Cohesive and discoverable; mirrors `app.proc`. Not hung off `app.pages`.
- **C750-2 — Signatures: `dir` required, `create*` returns root, no auto-open in the script API. ✅ Decided (user, 2026-06-21).** `createBoard(name, dir)` / `createDemoBoard(name, dir)` → return the absolute board root; `dir` is required; no auto-open (the agent opens explicitly via `app.openRawLink`).
- **C750-3 — MCP tool surface. ✅ Decided (user, 2026-06-21), then REVISED after MCP testing: add `create_board` + `open_board` MCP tools.** Initially no tools (use `execute_script`); reversed once testing showed boards warrant first-class tools and the hand-encoded open link was real friction. `create_board { name, dir, demo? }` → `{ boardRoot }` and `open_board { path }` are declared in `mcp-http-server.ts` and dispatched in `mcp-handler.ts` (→ `app.boards.*`). The script API (`app.boards` + `app.openRawLink`) stays as the `execute_script` path.
- **C750-4 — Open method. ✅ Decided (user, 2026-06-21), then REVISED: add `app.boards.openBoard(root)`.** Initially "no `openBoard`; open via generic `app.openRawLink` + hand-encoded link"; reversed because the hand-encoded `btoa(JSON.stringify(...))` step was the one friction point two fresh agents hit. `openBoard(root)` validates `isBoardFolder`, encodes the `persephone-board://` link via `encodePersephoneBoardLink` (one tested place), and opens it through `app.openRawLink`. The generic `app.openRawLink(href)` is **kept** (useful for files/URLs/any scheme). US-748's `BoardNotFoundView` / `UntrustedBoardView` still cover bad/foreign paths in-view. Confirmed in testing: a no-`pageId` open makes the board the active page.
- **C750-5 — Ensure the container `dir` exists.** *Recommend:* `app.boards.create*` does a recursive `fs.mkdir(dir)` before scaffolding, so creating into a fresh path works without a separate mkdir call. **Confirm** (and confirm `fs.mkdir` is recursive/no-throw — else guard with `fs.exists`).
- **C750-6 — `api → editors` coupling.** `api/boards.ts` needs `createBoardFromTemplate` from `editors/board/board-scaffold.ts`. *Recommend:* dynamic `import()` inside the create methods to avoid statically pulling editor-adjacent code into the core api bundle and to respect the code-splitting convention. (`app.openRawLink` has no such coupling — it only uses `shared/link-data`.) **Confirm** (vs. a plain top-level import — `board-scaffold` is a React-free utility, so static import is also defensible).
- **C750-7 — Guide duplication / drift with `board-template/CLAUDE.md`. ✅ Decided (user, 2026-06-21): the `/document` skill reconciles the drift.** The new `mcp-res-boards.md` necessarily restates authoring content already in `assets/board-template/CLAUDE.md` (an agent can't read the in-board file before a board exists, so the guide must be self-contained). Rather than rely on an ad-hoc reminder, **extend `.claude/skills/document/SKILL.md`** (run on every task/epic completion) to (a) include `assets/mcp-res-boards.md` in its board-documentation checklist and (b) **cross-check the three board docs for discrepancies and fix the drift** each run. Design intent: `board-template/CLAUDE.md` is the canonical *authoring* reference; `mcp-res-boards.md` is the condensed agent-facing version **plus** the `app.boards` / `app.openRawLink` lifecycle; `demo-board/` is the living example. The skill keeps them in agreement. (See Step 8.)
- **C750-8 — A foreign board opened by the agent shows the in-app trust gate; the agent can't click it. ✅ Confirmed (user, 2026-06-21): by design, no code change.** The gate (C5) is reserved for boards Persephone did not create. An agent's *own* `app.boards.create*` boards are auto-trusted, so its loop is never blocked. Opening a *foreign* board via `app.openRawLink(persephone-board://…)` correctly surfaces `UntrustedBoardView` to the **user**. Documented in the `boards` guide so the agent expects it.

## Acceptance criteria

1. `app.boards.createBoard("My Board", "<dir>")` (via `execute_script`) creates a blank board under `<dir>/My Board`, returns its absolute root, and the board is already trusted (no gate on open). `createDemoBoard` does the same from the demo template.
2. Creating into a `<dir>` that doesn't exist yet works (container created recursively); a name collision throws a clear error.
3. MCP `create_board { name, dir }` returns `{ boardRoot }` and the board is trusted; `open_board { path: boardRoot }` opens it in single-board mode (no sidebar list) **on the active page**; re-opening reuses the same tab (no duplicate). `demo: true` uses the Demo template.
4. The agent runs the full loop with the two tools — `create_board` → `open_board` → develop — no user interaction. `get_active_page` then returns the board page (`editor: "board-view"`).
5. `open_board` on a **foreign** (untrusted) board shows the user the trust prompt (`UntrustedBoardView`); a board created via `create_board` opens trusted immediately. `open_board` on a missing/non-board path returns a clear error (and the editor's `BoardNotFoundView` covers a stale link).
6. Script API parity (via `execute_script`): `app.boards.createBoard/createDemoBoard` → board root; `app.boards.openBoard(root)` opens it; `app.openRawLink(href)` opens a file/URL/in-app link generically.
7. `read_guide("boards")` returns the new guide; `notepad://guides/boards` resolves as an MCP resource; the guide appears in `notepad://guides/full`. The MCP server instruction advertises the Web Boards capability (`create_board` / `open_board`).
8. Script IntelliSense: `app.boards.` autocompletes `createBoard`/`createDemoBoard`/`openBoard` and `app.openRawLink` autocompletes (the `boards.d.ts` flat-copy reached `assets/editor-types/` + `_imports.txt`).
9. `npm run lint` and `tsc` clean.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/api/types/boards.d.ts` | **New.** `IBoards` (`createBoard` / `createDemoBoard` / `openBoard`) with doc comments + create→open example. |
| `src/renderer/api/types/app.d.ts` | Add `readonly boards: IBoards;` + the `openRawLink(href)` method to `IApp` (+ `IBoards` import). |
| `src/renderer/api/boards.ts` | **New.** `export const boards: IBoards` — `createBoard`/`createDemoBoard` (dynamic-import `createBoardFromTemplate`, ensure-dir) + `openBoard` (validate `isBoardFolder` → encode link → `app.openRawLink`). |
| `src/renderer/api/app.ts` | `_boards` field + `get boards()` + `import("./boards")` in `initServices()`; **new `openRawLink` arrow-field method** (+ `createLinkData` import); import `IBoards`. |
| `src/renderer/scripting/api-wrapper/AppWrapper.ts` | `get boards() { return app.boards; }` + `openRawLink = app.openRawLink;`. |
| `src/renderer/api/mcp-handler.ts` | `create_board` / `open_board` switch cases + handlers → `app.boards.*` (param validation, error mapping). |
| `src/main/mcp-http-server.ts` | **`create_board` + `open_board` `server.tool` declarations**; `boards` entry in `resourceFiles`; `read_guide` enum + description + fallback; "Web Boards" instruction scenario. |
| `assets/mcp-res-boards.md` | **New.** Agent-facing board guide (what / `create_board`+`open_board` lifecycle / develop / test + Demo pointer). |
| `assets/mcp-res-scripting.md` | Add `app.boards` + `app.openRawLink` to the `app` object table (test-found gap). |
| `assets/demo-board/index.html` | Fix the Debugging tab — agents **can** create+open boards now (was "an agent cannot open boards"). |
| `.claude/skills/document/SKILL.md` | Add `mcp-res-boards.md` to the board-docs checklist + a drift-reconciliation instruction across the three board docs (C750-7). |

### Files that need NO change (verified)

- `src/renderer/editors/board/board-scaffold.ts` — `createBoardFromTemplate` already does scaffold + manifest + **auto-trust** (C5); used as-is.
- `src/renderer/content/persephone-board-link.ts`, `parsers.ts`, `open-handler.ts`, `editors/board/index.tsx`, `BoardEditorModel.ts`, `BoardEditorView.tsx`, `BoardNotFoundView.tsx`, `UntrustedBoardView.tsx` — the entire US-748 open pipeline + trust/not-found views are reused unchanged.
- `src/renderer/api/board-trust.ts` — trust is written inside `createBoardFromTemplate`; never exposed on `app`.
- `forge.config.ts` — `extraResource: ["./assets"]` already ships `mcp-res-boards.md`.
- `vite.renderer.config.ts` — `editorTypesPlugin` auto-discovers the new `boards.d.ts`.
