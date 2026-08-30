# UI Element Addressing Contract

How elements of the Persephone shell are addressed by MCP agents
driving the app window (`browser_snapshot`/`browser_click` with `pageId: "app"`), by injected
overlay scripts, and by tests.

## The convention: `data-name`

UIKit primitives accept a `name` prop and emit it as `data-name` on their root element — `Panel`,
`Button`, `IconButton`, `SplitButton`, `ListBox`, `Splitter`, `Tree`, `Select`, `Tag`, `Text` and
others. Plain DOM elements in the shell set the attribute directly.

```tsx
<IconButton name="menubar-settings" … />        →  [data-name="menubar-settings"]
<div className="app-header" data-name="app-header">
```

`className` is not an addressing mechanism. Emotion generates class names, and the semantic
classes that do exist (`app-header`, `mcp-indicator`) exist to drive styles from a parent's style
object — they are free to change with the styling. `data-name` is the handle.

## `data-name` vs `data-type` / `data-part` / state attributes

Four distinct roles, and the tab strip uses all of them:

| Attribute | Role | Example |
|---|---|---|
| `data-name` | What kind of element this is | `data-name="page-tab"` |
| `data-type` | Structural marker used by component logic and Emotion selectors | `data-type="page-tab"` |
| `data-part` | A named part *inside* a component | `data-part="title-label"` |
| `data-component` | Stable kind marker for an inspectable native component root | `data-component="panel"` |
| `data-*` state | Which instance / what state | `data-active`, `data-pinned`, `data-modified` |

`data-name` is not unique when an element repeats. Every open tab carries
`data-name="page-tab"`; the state attributes select among them:

```
[data-name="page-tab"][data-active]                          the active tab
[data-name="page-tab"][data-active] [data-name="tab-language"]  its language button
[data-name="page-tab"][data-pinned]                          pinned tabs
```

`data-type` and `data-part` are **load-bearing** — `TabsModel.scrollToActive` queries
`[data-type="page-tab"][data-active]`, and `PageTabRoot`'s styles select on `data-part`. Never
remove or rename them in the course of adding a `data-name`.

`data-component` is an additive inspection marker. Native `Panel` roots emit both
`data-component="panel"` and `data-type="panel"`; the component marker remains stable when an
app-specific caller must override `data-type` for its own styling. It is not a replacement for
`data-type`, `data-part`, or state attributes.

## The public-contract rule

A `data-name` **quoted in an MCP guide** (`assets/mcp-res-*.md`) is part of Persephone's
agent-facing API, not an internal label. The values listed in the table below are quoted there.

- **Renaming one is a documentation change.** Update the guide in the same commit, or an agent
  will confidently point a user at an element that no longer exists.
- **Adding one is always safe.** New names cost nothing and break nothing.
- **Everything else stays a debug label.** A `name` on some `Panel` inside an editor carries no
  stability promise; only the table below is contractual.

## Shell selectors

The always-visible chrome, top to bottom.

### Header strip

| Element | Selector |
|---|---|
| Header strip | `[data-name="app-header"]` |
| Menu button (Persephone glyph) — opens the Menu Bar | `[data-name="persephone-menu"]` |
| Tab strip | `[data-name="page-tabs"]` |
| Tab strip scroll area | `[data-name="page-tabs-wrapper"]` |
| Tab strip scroll arrows (only when tabs overflow) | `[data-name="page-tabs-scroll-left"]`, `[data-name="page-tabs-scroll-right"]` |
| Add-page button (split button — click adds, arrow opens the editor menu) | `[data-name="page-tabs-add"]` |
| Autoload reload button (only when scripts need reloading) | `[data-name="autoload-reload"]` |
| Zoom indicator (only when zoomed) | `[data-name="zoom-indicator"]` |
| Window minimize / maximize-restore / close | `[data-name="window-minimize"]`, `[data-name="window-toggle"]`, `[data-name="window-close"]` |

### Status indicators (bottom-right of the header strip)

| Element | Selector |
|---|---|
| Indicator cluster | `[data-name="status-indicators"]` |
| Snip menu trigger (the green "…") | `[data-name="header-snip-button"]` |
| Mneme indicator (only when Mneme is enabled) | `[data-name="mneme-indicator"]` |
| MCP indicator (only when the MCP server is running) | `[data-name="mcp-indicator"]` |

### A page tab

| Element | Selector |
|---|---|
| Any tab | `[data-name="page-tab"]` |
| The active tab | `[data-name="page-tab"][data-active]` |
| Language / editor-type button | `[data-name="tab-language"]` |
| Close (or ungroup) button | `[data-name="tab-close"]` |
| Mute button (only when audible or muted) | `[data-name="tab-sound"]` |
| Tab title text | `[data-part="title-label"]` |

State attributes available on a tab: `data-active`, `data-modified`, `data-pinned`, `data-temp`,
`data-deleted`, `data-grouped`, `data-has-encryption`.

Two tab shapes do not match the common case, and both occur in ordinary use:

- **Editors that declare `noLanguage`** (most non-text editors) have **no**
  `[data-name="tab-language"]` button. In its place is `[data-part="empty-language"]` showing the
  editor's icon. Treat a missing language button as "this editor has no language", not as a
  failed selector.
- **A pinned tab renders no title text.** `[data-part="title-label"]` exists but is empty — the
  tab shows only icons, and the file path lives in a hover tooltip. Read a page's title from
  `list_pages`, never from the tab's DOM.

### Menu Bar (opens from the Persephone glyph)

| Element | Selector |
|---|---|
| Backdrop — always in the DOM; `display: none` when closed, so presence is not openness | `[data-name="menu-bar"]` |
| Sliding panel | `[data-name="menu-bar-content"]` |
| Open File / New Window / About / Settings | `[data-name="menubar-open-file"]`, `[data-name="menubar-new-window"]`, `[data-name="menubar-about"]`, `[data-name="menubar-settings"]` |
| Category list (Open Tabs, Recent Files, Tools & Editors, Script Library, user folders) | `[data-name="menubar-folders"]` |
| Right-hand content pane | `[data-name="menubar-content"]` |
| Add Folder button | `[data-name="menubar-add-folder-button"]` |
| Width splitter | `[data-name="menubar-splitter"]` |

### Page area

| Element | Selector |
|---|---|
| Content region below the header | `[data-name="app-content"]` |
| Page host (all pages live here) | `[data-name="pages-container"]` |
| The active page's editor container | `[data-name="page-editor"]` |
| An empty page | `[data-name="page-empty"]` |
| Sidebar panel container (only when a page has panels open) | `[data-name="secondary-views-container"]` |
| Sidebar panel stack | `[data-name="secondary-views-stack"]` |
| Sidebar width splitter | `[data-name="secondary-views-splitter"]` |

### Inspectable panel roots

Panel roots that are useful inspection targets expose the stable selector
`[data-component="panel"][data-name="…"]`. The current named roots are:

| Panel | Selector |
|---|---|
| TreeProvider error / empty message | `[data-component="panel"][data-name="tree-provider-error"]` / `[data-component="panel"][data-name="tree-provider-empty"]` |
| TreeProvider search | `[data-component="panel"][data-name="tree-provider-search"]` |
| Board Info | `[data-component="panel"][data-name="board-info-editor"]` |
| Search boards | `[data-component="panel"][data-name="search-boards-tab"]` |
| Tools hub | `[data-component="panel"][data-name="tools-hub"]` |
| Toolset | `[data-component="panel"][data-name="toolset-editor"]` |
| Script library | `[data-component="panel"][data-name="sidebar-script-library"]` |

These names are debug/inspection handles rather than uniqueness guarantees. Existing app-specific
`data-type` values remain available to component CSS; in particular, TreeProvider message and
search roots retain their `tree-provider-*` types.

## Scope

This contract covers the **shell** — the chrome around the content. An editor's own internals are
deliberately not enumerated: they vary per editor type, they are numerous, and an agent reaches
them perfectly well through the accessibility tree returned by
`browser_snapshot({ pageId: "app" })`. Exhaustive `data-name` coverage inside editors would be
maintenance with no consumer.

Transient surfaces (dialogs, popup menus, toasts) are likewise out of scope. An agent that needs
one has just caused it to appear and can snapshot it.
