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
  `board-view`, …). `list_pages` / `list_windows` show what's open; every tool takes an
  optional `windowIndex`.
- **A browser page contains inner tabs.** One `browser-view` page hosts multiple browser tabs
  (like a browser window). Browser pages belong to **profiles** — isolated cookie/login
  sessions. Open one with `pages.openUrlInBrowserTab(url, options)` and drive it through
  `pages[i].editor`.
- **Boards are mini web-apps you build.** A board is a folder (HTML + backend scripts) rendered
  in a sandboxed frame; you scaffold it with `create_board`, open it with `open_board`, and
  drive/test it through `pages[i].editor` (`tabs`, `switchTab`, and `reload` included).
- **The app window itself is automatable.** Use `window.screen` to see and click Persephone's own
  UI (tabs, sidebar, dialogs).
- **`call` is the one tool you can use without reading anything.** It addresses Persephone's live
  object model by path — `""` lists the top level, `pages` the open tabs, `page.content` the active
  text, `pages[0].editor.rowCount` a grid, `windows[1].pages` another window — and every answer
  carries a hint listing what is under it. Unknown members return the valid list. If a resolved
  member returns an image payload, MCP `call` emits its metadata as text plus a native image block;
  this applies to any object-model member, not just browser screenshots. Paths use the same names
  as `app.*` in scripts, so what you learn there transfers to `execute_script`.
- **`execute_script` is the power tool.** JavaScript/TypeScript with the `app` object (pages,
  fs, settings, ui, boards, …) and **full, unsandboxed Node.js** with the user's privileges.
- **Agent Tools are executable memory.** Registered, parameterized scripts you discover with
  `search_tools` and run with `execute_tool` — check there before writing an ad-hoc integration
  script.
- **`ui_push` is your output channel.** Logs, rich output (markdown, mermaid, grids, code), and
  blocking input dialogs, all appended to an auto-managed Log View page.

## Task → tool → guide

| You want to… | Use | Read first |
|---|---|---|
| Inspect main-process state or use gated main scripting | `call` (path `"main"`) | `read_guide("scripting")` before `main.script.execute` |
| Look around, read a page, activate a tab, simple edits — with no guide | `call` (path `""` first) | nothing — the hints are the guide |
| Show results, logs, progress; ask the user something | `ui_push` | `read_guide("ui-push")` |
| Open text/code for the user | `create_page` (editor `monaco`) | nothing — monaco is safe to guess |
| Show a mermaid diagram | `create_page` (`mermaid-view`, language `mermaid`) | nothing |
| Show tabular data | `create_page` (`grid-json` / `grid-csv`) | `read_guide("pages")` |
| Create notebook / links / graph pages | `create_page` (structured editors) | `read_guide("pages")` + the editor's own guide |
| Read or edit what's open | `list_pages`, `get_page_content`, `set_page_content` | `read_guide("pages")` |
| Run code, use `app.*`, touch files | `execute_script` | `read_guide("scripting")` |
| Open a web page or search query | `pages.openUrlInBrowserTab(url, options)` → returns `pageId` | `read_guide("browser")` |
| Open a URL naming a file | `pages.openUrl(url, options)` | `read_guide("browser")` |
| Drive a web page / board / the app UI | `pages[i].editor` / `window.screen` | `read_guide("browser")` |
| Build a custom dashboard/tool/editor | `create_board`, `open_board`, `board_refresh` | `read_guide("boards")` |
| Recurring external-system task (ADO, SQL, email, CLI) | `search_tools` → `execute_tool` | `read_guide("tools")` |

`main` is resolved locally by the main process, alongside root `windows`. Use `main.windows` for
the same live window collection, and use root `main` rather than `windows[i].main`; the latter is
rejected before any renderer bridge. `main.script.execute` is visible for discovery but requires
the Settings → MCP Server toggle `Allow main-process scripts`.

## Reading order

Don't read everything up front. Read this page, then read each guide **just before** first
using its tool — the tool descriptions tell you which guide they require. If you expect a long
session of browser work or board building, `browser` and `boards` are the two guides that repay
reading in full.

## Three habits that prevent most failures

1. **Target explicitly.** Capture `pageId` from path or tool results (`pages.openUrlInBrowserTab`, `open_board`,
   `create_page`, `list_pages`) and pass it to later calls. "Active page" defaults are
   convenient but shift when the user — or another agent in the same session — switches tabs.
2. **Verify, don't assume.** After creating content, check it: `get_page_content` for text,
   `window.screen.snapshot()` to see whether an editor rendered or shows an error.
3. **Read the guide before structured formats.** Wrong JSON for structured editors
   (notebook/links/graph) is accepted silently by `create_page` and fails only at render time.
