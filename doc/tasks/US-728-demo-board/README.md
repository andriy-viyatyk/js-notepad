# US-728: Demo board — bundle + "Create Demo board" entry points (EPIC-034)

## Goal

Ship the prepared demo board as a **bundled template** and let users create a copy of it on demand:
- Bundle the demo board content under `assets/demo-board/`.
- On the empty boards view, add a **"Create Demo board"** button next to "Create board".
- On the management toolbar, turn **"+ New board"** into a **`SplitButton`** whose dropdown offers **"Create Demo board"**.
- "Create Demo board" prompts for a board name (like a normal create), then scaffolds the new board from `assets/demo-board/` instead of the blank template.

## Scope

- **In scope:** bundling the demo content + the two creation entry points + a `createDemoBoard` path that copies the bundled demo.
- **Not in scope (content):** authoring the demo's pages. The demo content is **already built** — it's the working `.persephone/boards/Demo Prototype/` board (Overview / Theming / Capabilities / Build Guide / Debugging tabs, `--p-*` theming, MCP-debugging docs). This task **snapshots** that content into `assets/demo-board/`; it does not rewrite it.
- **Still forthcoming (tracked elsewhere):** the recommended-components **skin links** in the demo's Build Guide depend on **US-727** and remain marked "skin planned" / forthcoming in the content. Not blocked by this task.

## Background

### The demo content (migration source)
`.persephone/boards/Demo Prototype/` — three files: `index.html`, `app.js`, `style.css`. It is the **migration source** for `assets/demo-board/`. After the move, `assets/demo-board/` becomes the canonical demo (edited directly going forward) and the local Demo Prototype board is deleted (see C-A). Copy only the three source files — exclude any transient files like `ui.log`.

### Scaffolding from a bundled template
`src/renderer/editors/board/board-scaffold.ts:15`
```ts
export async function scaffoldBoard(destDir: string): Promise<void> {
    const appRoot = await api.getAppRootPath();
    const templateDir = fpJoin(appRoot, "assets", "board-template");
    await copyDirInto(templateDir, destDir);
}
```
`copyDirInto()` (same file) recursively creates the dest dir and copies entries. The source path is resolved at runtime via `api.getAppRootPath()` → `<appRoot>/assets/<template>`.

### Assets ship automatically
`forge.config.ts:9` → `extraResource: ["./assets"]` copies the **entire** `assets/` folder into the packaged app (dev + prod). So **`assets/demo-board/` needs no build-config change** — dropping the folder under `assets/` is enough.

### Current create flow
`BoardEditorModel.createBoard(name)` (`BoardEditorModel.ts:267`): collision check (`fs.exists` → throw `A board named "<name>" already exists.`) → `scaffoldBoard(dir)` → on failure, `fs.mkdir(dir)` + `ui.notify(..., "warning")` → `refreshBoards()` → `selectBoard(name)`.

### UI surfaces (`BoardEditorView.tsx`)
- **Toolbar** (`:113-115`): `<Button name="board-create" size="sm" icon={<PlusIcon />} onClick={() => void handleCreate()}>New board</Button>`.
- **Empty state** (`:122-129`): `<Button name="board-create-empty" variant="primary" icon={<PlusIcon />} onClick={() => void handleCreate()}>Create board</Button>`.
- `handleCreate()` (`:56`): `showInputDialog({ title, message, value: "", buttons: ["Create","Cancel"] })` → on `"Create"`, `model.createBoard(name.trim())`.

### `SplitButton` (uikit) — already wraps `WithMenu`
`src/renderer/uikit/SplitButton/SplitButton.tsx:12-33` — props: `icon`, `title`, `onClick` (primary action), `items: MenuItem[]` (dropdown), `size`, `menuTitle`, `disabled`, `menuDisabled`. The caret already uses `WithMenu` internally (`:128`), so `SplitButton` is the right component — no need to wire `WithMenu` directly. `MenuItem` shape (`events.d.ts:12-27`): `{ label, onClick?, icon?, disabled?, startGroup?, ... }`. Real usage: `PageTabs.tsx:193-201`.

## Implementation plan

### 1. Bundle the demo — `assets/demo-board/` (NEW)
Copy the three source files from `.persephone/boards/Demo Prototype/` into a new `assets/demo-board/`:
- `index.html`, `app.js`, `style.css` — **only these** (no `ui.log` or other runtime artifacts).
No build-config change (covered by `extraResource: ["./assets"]`).
After this, `assets/demo-board/` is the canonical demo. The user then deletes `.persephone/boards/Demo Prototype/` (C-A) — future demo edits happen in `assets/demo-board/`.

### 2. Generalize the scaffolder — `board-scaffold.ts`
Add an optional template name (default keeps existing callers working):
```ts
export async function scaffoldBoard(destDir: string, template = "board-template"): Promise<void> {
    const appRoot = await api.getAppRootPath();
    const templateDir = fpJoin(appRoot, "assets", template);
    await copyDirInto(templateDir, destDir);
}
```

### 3. `createDemoBoard` — `BoardEditorModel.ts`
Refactor the existing `createBoard` body into a private helper that takes the template, then expose both:
```ts
async createBoard(name: string): Promise<void> {
    return this.createFromTemplate(name, "board-template");
}
async createDemoBoard(name: string): Promise<void> {
    return this.createFromTemplate(name, "demo-board");
}
private async createFromTemplate(name: string, template: string): Promise<void> {
    const dir = fpJoin(this.state.get().persephonePath, "boards", name);
    if (await fs.exists(dir)) {
        throw new Error(`A board named "${name}" already exists.`);
    }
    try {
        await scaffoldBoard(dir, template);
    } catch (err) {
        await fs.mkdir(dir);
        ui.notify(
            `Board created, but the template could not be copied: ${err instanceof Error ? err.message : String(err)}`,
            "warning",
        );
    }
    await this.refreshBoards();
    this.selectBoard(name);
}
```
(Mirrors the current `createBoard` exactly; only the template source becomes a parameter.)

### 4. UI — `BoardEditorView.tsx`
- **Imports:** add `SplitButton` from `../../uikit/SplitButton`. (`BoardIcon` is already imported.)
- **`handleCreateDemo`** (next to `handleCreate`):
  ```tsx
  const handleCreateDemo = async () => {
      const res = await showInputDialog({
          title: "Create Demo board",
          message: "Board name (becomes the folder name):",
          value: "Demo",
          buttons: ["Create", "Cancel"],
      });
      if (res?.button !== "Create") return;
      const name = res.value.trim();
      if (!name) return;
      try {
          await model.createDemoBoard(name);
      } catch (err) {
          ui.notify(err instanceof Error ? err.message : String(err), "error");
      }
  };
  ```
- **Empty state** — second button beside "Create board" (wrap the two in a `row` Panel):
  ```tsx
  <Panel direction="row" gap="sm">
      <Button name="board-create-empty" variant="primary" icon={<PlusIcon />} onClick={() => void handleCreate()}>
          Create board
      </Button>
      <Button name="board-create-demo-empty" icon={<BoardIcon width={16} height={16} />} onClick={() => void handleCreateDemo()}>
          Create Demo board
      </Button>
  </Panel>
  ```
- **Toolbar** — replace the `Button` with a labeled `SplitButton` (primary "+ New board" = blank board, chevron caret = demo dropdown). Requires the `SplitButton` label enhancement below (`children` → text primary):
  ```tsx
  <SplitButton
      name="board-create"
      size="sm"
      icon={<PlusIcon />}
      onClick={() => void handleCreate()}
      menuTitle="More board options"
      items={[{
          label: "Create Demo board",
          icon: <BoardIcon width={14} height={14} />,
          onClick: () => void handleCreateDemo(),
      }]}
  >
      New board
  </SplitButton>
  ```

### 5. `SplitButton` — optional primary label — `uikit/SplitButton/SplitButton.tsx`
Add `children?: React.ReactNode` (primary label). When provided, render the primary as a `Button` (icon + children) instead of the icon-only `IconButton`; import `Button`. Backward compatible — existing icon-only callers pass no children.

### 6. Verify
`tsc` + `eslint` clean; manual test (see Acceptance).

## Concerns / Open questions

- **C-A — `assets/demo-board/` is the single source of truth (resolved, user 2026-06-20).** There is no second canonical copy: future demo edits are made **directly in `assets/demo-board/`**. The current `.persephone/boards/Demo Prototype/` is only the migration *source* — once its content is moved into `assets/demo-board/`, the user **deletes the local Demo Prototype board**. To test demo changes, instantiate a throwaway board via "Create Demo board", verify, then delete it and recreate after the next edit. No sync mechanism needed.

- **C-B — Exclude runtime artifacts when bundling (resolved).** Copy only `index.html`/`app.js`/`style.css` into `assets/demo-board/`. A board's `ui.log` (and any future per-board state) must not ship in the template.

- **C-C — SplitButton primary vs dropdown semantics (resolved, user 2026-06-20).** Primary region = blank board, showing the full **"+ New board"** label; the **chevron-down caret** opens a popup with a single **"Create Demo board"** item. `SplitButton`'s primary was icon-only, so it was **extended** with an optional primary label: when `children` are passed it renders the primary as a text `Button` (icon + label) instead of an `IconButton` (icon-only callers — page-tabs, git-tree — are unchanged). The empty-state buttons remain regular `Button`s.

- **C-D — Default name "Demo" (resolved).** The demo prompt pre-fills `"Demo"`; the user can rename. The normal blank create still defaults to empty.

- **C-E — `createBoard` refactor safety (resolved).** `createBoard` is also called from `BoardEditorView.handleCreate`. Routing it through `createFromTemplate(name, "board-template")` preserves its exact current behavior (same collision message, fallback, refresh, select).

## Acceptance criteria

1. `assets/demo-board/` exists with the three demo files; no `ui.log` or stray files.
2. Empty boards view shows **two** buttons: "Create board" (blank) and "Create Demo board".
3. Toolbar "+ New board" is a `SplitButton`: primary click creates a blank board; the dropdown's "Create Demo board" creates a demo board.
4. "Create Demo board" prompts for a name, then the new board's folder contains a **copy of the bundled demo** (tabs render: Overview / Theming / Capabilities / Build Guide / Debugging).
5. Existing "New board" / "Create board" (blank) behavior is unchanged; duplicate-name collision still errors.
6. `tsc` + `eslint` clean.

## Files Changed

| File | Change |
|------|--------|
| `assets/demo-board/index.html`, `app.js`, `style.css` | **NEW** — snapshot of `.persephone/boards/Demo Prototype/` (source files only). |
| `src/renderer/editors/board/board-scaffold.ts` | `scaffoldBoard(destDir, template = "board-template")` — template source becomes a parameter. |
| `src/renderer/editors/board/BoardEditorModel.ts` | Add `createDemoBoard(name)`; refactor `createBoard` to share a private `createFromTemplate(name, template)`. |
| `src/renderer/editors/board/BoardEditorView.tsx` | Empty-state second button "Create Demo board"; toolbar `Button` → labeled `SplitButton` ("+ New board" primary + "Create Demo board" dropdown); new `handleCreateDemo`; import `SplitButton`. |
| `src/renderer/uikit/SplitButton/SplitButton.tsx` | Add optional primary label: `children` → primary renders as a text `Button` (icon + label); icon-only callers unaffected. |

## Files — no change expected
`forge.config.ts` (assets auto-bundled via `extraResource`), `SplitButton`/`WithMenu` (consumed as-is), the content pipeline / `.persephone` discovery (unaffected).
