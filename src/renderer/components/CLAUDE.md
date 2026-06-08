# `src/renderer/components/` — KEEP-only folder

This folder holds **persephone-coupled components only**. Each remaining sub-folder depends on `app.*` APIs, the page model, the file system, or the scripting system — that's the criterion for living here.

**New reusable primitives do NOT go here.** They go in [`src/renderer/uikit/`](../uikit/CLAUDE.md).

Remaining folders:
- `icons/` — uses Persephone's icon registration system
- `page-manager/` — coupled to `PageModel` lifecycle
- `file-search/` — uses `app.fs`
- `tree-provider/` — coupled to `ITreeProvider` contracts
- `file-list/` — flat file list (icons + single-click) built on `ListBox` + `FileIcon`; reused by the Recent files panel and the Git Tree "Changes" panel
- `git-tree/` — Git Tree component (`AVGrid` + SVG branch graph) and the git data submodels (`GitTreeModel`, `GitChangesModel`)

See [`/doc/standards/uikit-vs-components-split.md`](../../../doc/standards/uikit-vs-components-split.md) for the permanent contract.
