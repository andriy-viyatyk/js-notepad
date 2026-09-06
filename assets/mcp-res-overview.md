# Persephone Overview — start here

Persephone is a developer notepad your MCP tools drive: tabbed pages, specialized editors,
a built-in browser, sandboxed mini web-apps (Boards), a script runtime with full Node.js,
and a registry of reusable tools. This page gives you the mental model and tells you which
guide to read for which task. It is intentionally short — read it once per session.

## The mental model

- **`main` is process-wide.** `call` resolves `main.windows`, `main.mcp`, `main.tor`,
  `main.boards`, `main.downloads`, `main.networkLog`, `main.runtime`, and the settings-gated
  `main.script.execute(code)` branch in the main process. `windows[i].main` is invalid.
- **Windows → pages → editors.** A window holds tabbed **pages**; each page renders through an
  **editor** (`monaco` text, `grid-json`, `md-view`, `notebook-view`, `browser-view`,
  `board-view`, …). `call` at `pages` / `windows` shows what's open; paths under `windows[i]`
  target another window.
- **A browser page contains inner tabs.** One `browser-view` page hosts multiple browser tabs
  (like a browser window). Browser pages belong to **profiles** — isolated cookie/login
  sessions. Open one with `pages.openUrlInBrowserTab(url, options)` and drive it through
  `pages[i].editor`.
- **Boards are mini web-apps you build.** A board is a folder (HTML + backend scripts) rendered
  in a sandboxed frame; you scaffold it with `boards.createBoard`, open it with `boards.openBoard`, and
  drive/test it through `pages[i].editor` (`tabs`, `switchTab`, and `reload` included).
- **The app window itself is automatable.** Use `window.screen` to see and click Persephone's own
  UI (tabs, sidebar, dialogs).
- **`call` is the one tool you can use without reading anything.** It addresses Persephone's live
  object model by path — `""` lists the top level, `pages` the open tabs, `page.content` the active
  text, `pages[0].editor.rowCount` a grid, `windows[1].pages` another window — and every answer
  carries a hint listing what is under it. Unknown members return the valid list. If a resolved
  member returns an image payload, MCP `call` emits its metadata as text plus a native image block;
  this applies to any object-model member, not just browser screenshots. Paths use the same names
  as `app.*` in scripts, so what you learn there transfers to `script.execute`.
- **`script.execute` is the power tool.** JavaScript/TypeScript with the `app` object (pages,
  fs, settings, ui, boards, …) and **full, unsandboxed Node.js** with the user's privileges.
- **Agent Tools are executable memory.** Registered, parameterized scripts you discover with
  `tools.search` and run with `tools.execute` — check there before writing an ad-hoc integration
  script.
- **`pages.logView.push` is your output channel.** Logs, rich output (markdown, mermaid, grids,
  code), and input dialogs are appended to an auto-managed Log View page.

## Task → tool → guide

| You want to… | Use | Read first |
|---|---|---|
| Inspect main-process state or use gated main scripting | `call` (path `"main"`) | `main.$help` and `persephone://guides/scripting` |
| Look around, read a page, activate a tab, simple edits — with no guide | `call` (path `""` first) | nothing — the hints are the guide |
| Show results, logs, progress; ask the user something | `pages.logView.push([...])` | `pages.logView.$help` and `persephone://guides/ui-push` |
| Open text/code for the user | `pages.addEditorPage(...)` (editor `monaco`) | `pages.$help` |
| Show a mermaid diagram | `pages.addEditorPage(...)` (`mermaid-view`, language `mermaid`) | `pages.$help` |
| Show tabular data | `pages.addEditorPage(...)` (`grid-json` / `grid-csv`) | `pages.$help` and `persephone://guides/pages` |
| Create notebook / links / graph pages | `pages.addEditorPage(...)` (structured editors) | `pages.$help` and the editor resource |
| Read or edit what's open | `call` at `pages` and `pages[i].content` | `pages.$help` and `persephone://guides/pages` |
| Run code, use `app.*`, touch files | `script.execute` | `script.$help` and `persephone://guides/scripting` |
| Open a web page or search query | `pages.openUrlInBrowserTab(url, options)` → returns `pageId` | `pages.$help` and `persephone://guides/browser` |
| Open a URL naming a file | `pages.openUrl(url, options)` | `pages.$help` and `persephone://guides/browser` |
| Drive a web page / board / the app UI | `pages[i].editor` / `window.screen` | node `$help` and `persephone://guides/browser` |
| Build a custom dashboard/tool/editor | `boards.createBoard`, `boards.openBoard`, `pages[i].editor` | `boards.$help` and `persephone://guides/boards` |
| Recurring external-system task (ADO, SQL, email, CLI) | `tools.search` → `tools.execute` | `tools.$help` and `persephone://guides/tools` |

`main` is resolved locally by the main process, alongside root `windows`. Use `main.windows` for
the same live window collection, and use root `main` rather than `windows[i].main`; the latter is
rejected before any renderer bridge. `main.script.execute` is visible for discovery but requires
the Settings → MCP Server toggle `Allow main-process scripts`.

## Reading order

Don't read everything up front. Start with `call` at `""`, then inspect the relevant node's
`$help`. Read a focused resource such as `persephone://guides/browser` or
`persephone://guides/boards` when you need its document-sized format or authoring reference.

## Three habits that prevent most failures

1. **Target explicitly.** Capture `pageId` from path results (`pages.openUrlInBrowserTab`, `boards.openBoard`,
   `pages.addEditorPage`, `pages`) and pass it to later calls. "Active page" defaults are
   convenient but shift when the user — or another agent in the same session — switches tabs.
2. **Verify, don't assume.** After creating content, check `pages[i].content` for raw text,
   `window.screen.snapshot()` to see whether an editor rendered or shows an error.
3. **Read the format resource before structured formats.** Wrong JSON for structured editors
   (notebook/links/graph) may be accepted as raw content and fail only at render time; use the
   relevant focused resource and then verify the active page.
