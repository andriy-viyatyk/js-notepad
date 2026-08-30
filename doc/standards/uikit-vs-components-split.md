# UIKit vs `components/` — the permanent split

> This is the permanent contract for where reusable UI code lives.

## The two folders

### `src/renderer/uikit/` — standalone component library

- Canonical home for **all new reusable UI primitives**.
- No imports from `src/renderer/api/`, `src/renderer/ui/`, `src/renderer/editors/`, or any app-specific code. The only allowed dependencies are `core/` (state primitives), `theme/` (design tokens), and other UIKit primitives.
- Pure, prop-driven, testable in isolation.
- Authoring rules live in [`src/renderer/uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md) — read that before adding or modifying a primitive.
- **Future split target:** the folder is structured to be extractable as a separate npm package. Every "must not import from `api/`" rule exists to keep that option open.

### `src/renderer/components/` — persephone-coupled components

- Each remaining folder uses `app.*` APIs, the page model, the file system, or the scripting system — that's the criterion for living here.
- These persephone-coupled folders remain. **No new pure primitives go here.** New primitives go in `uikit/`.

  | Folder | What it does | Why it can't live in `uikit/` |
  |--------|--------------|-------------------------------|
  | `icons/` | `FileIcon`, `LanguageIcon` | Uses Persephone's icon registration system + asset paths |
  | `page-manager/` | Native page / tab host | Couples to `PageModel` and the page lifecycle |
  | `file-search/` | Standalone file content search with virtualized results | Uses `app.fs` + search service IPC |
  | `tree-provider/` | `TreeProviderView` + `CategoryView` — generic tree and folder page over `ITreeProvider`, with their shared plural / drop actions | Coupled to provider-tree contracts defined in `api/`, and the actions reach `app.fs` and OS clipboard / drag IPC |
  | `file-list/` | Flat file list (`ListBox` + `FileIcon`) | Couples to the `FileIcon` registration system |
  | `file-grid/` | `DataGrid`-based file list (range select, sorting, range-copy) | Couples to `FileIcon`; the eventual `FileList` replacement |
  | `git-tree/` | Git history view + git data submodels (`GitTreeModel`, `GitChangesModel`) | Couples to `api/git` + the page model |

## What goes where, in practice

- A new `Slider` → `uikit/Slider/`.
- A new file-picker that uses `app.fs` → `components/file-search/` (extend existing) or a new persephone-coupled folder if the existing ones don't fit.
- A new editor-specific panel that only the Notebook editor uses → `editors/notebook/components/` (private to that editor — not reusable).
- A new dialog or settings panel — reusable UI built from UIKit primitives → consumer code under `editors/`, `ui/`, or wherever it's used. Compose UIKit primitives by props; do not create new wrappers in `uikit/` just to hold a layout.

### Edge case: "this could be persephone-coupled, but doesn't need to be"

If a primitive *could* depend on `app.*` but the dependency can be injected as a prop, **prefer `uikit/` with dependency injection**. The point of `uikit/` is to be extractable as a package — anything pulled into `components/` for convenience is a step away from that goal.

## Cross-references

- [`src/renderer/uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md) — UIKit authoring rules (data-attributes, controlled components, traits, model-view, naming, file template).
- [`/doc/standards/component-guide.md`](./component-guide.md) — decision tree for where a new component goes.
- [`/doc/standards/coding-style.md`](./coding-style.md) — Emotion / `style=` / `className=` boundary (Rule 7).
