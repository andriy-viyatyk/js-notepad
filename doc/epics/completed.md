# Completed Epics

Last 10 completed epics, newest first. Older epics are pruned.

---

## EPIC-030 — [Git Integration — Git Tree + File Diff editors](EPIC-030.md)

Read-first git tooling, v1. Git access via **simple-git** in the main process (`git-service.ts` + `git-ipc.ts`), exposed to the renderer through a settings-gated, directory-cached API (`api/git.ts`). A new **"Git integration" setting** (off by default) gates everything — when off, zero git activity. Git membership is detected **once on the shared `TextFileModel` host** (`gitRepo` via `rev-parse`), so every text editor inherits the **"Git Diff" switch** with no per-editor code. Two new registered editors: a **Git Tree** editor (opened from the `.git` node in Explorer — branch/commit history on `AVGrid` + an SVG `BranchTreeCell` painting a ported VS Code MIT swimlane layout, paginated via the editor-owned `GitTreeModel`), and a **File Diff** editor (host-adopting, Monaco side-by-side diff with `from`/`to` revision pickers that reuse the Git Tree component in a popover; the Unstaged side is editable and writes back). v1 is strictly read/inspect — no mutating git operations. Close-out: `/review`, `/document`, `/userdoc` run as a single deferred pass over US-610–US-613. **Review disposition:** the `styled.*` usage in `components/git-tree/` was flagged against `coding-style.md:109` but **accepted** as consistent with existing `components/` precedent (`tree-provider/`, `file-search/`, `icons/`); the rule was left unchanged.

- [x] US-610: Git service + IPC + "Git integration" setting + host detection
- [x] US-611: Git Tree component (AVGrid + SVG BranchTreeCell + swimlane layout)
- [x] US-612: Git Tree editor + Explorer `.git` entry point
- [x] US-613: File Diff editor

---

## EPIC-029 — [Standalone PageNavigator → `SecondaryViews`, a reusable panel host](EPIC-029.md)

Renamed `PageNavigator` → `SecondaryViews` family and turned the component controlled (`views` + `ISecondaryViewsState` + `setState` props — no longer bound to `PageModel`). Widened `editor.page` from the concrete `PageModel` to a new `IPageHost` interface; `BrowserPanelHost` is the second implementer, hosting the bookmarks sidebar inside the Browser empty page and drawer. The `secondaryEditor` field renamed `secondaryView` everywhere, including persisted state. Link Editor panels became always-open (no close affordance, no duplicate in-view panels). Notebook, Todo, and Rest Client moved their bespoke splitter side-panel layouts into `SecondaryViews`. The stale `editors/base/IPageHost.ts` stub (deleted in US-607) was removed; `IPageHost` now lives at `api/pages/IPageHost.ts`. Close-out: `/review` (US-607), `/document` (US-608), `/userdoc` (US-609).

- **Phase 1a — Foundation**
- [x] [US-595: Rename `secondaryEditor`→`secondaryView` + `PageNavigator`→`SecondaryViews` family](../tasks/US-595-rename-secondary-view/README.md)
- [x] [US-596: `ISecondaryViewsState` + controlled `SecondaryViews` component](../tasks/US-596-controlled-secondary-views/README.md)
- [x] [US-597: `IPageHost` typing for `editor.page` (+ derived `isMain`)](../tasks/US-597-ipagehost-typing/README.md)
- **Phase 1b — Per-editor adoption**
- [x] [US-598: Explorer — adopt + verify under new infra](../tasks/US-598-explorer-adopt/README.md)
- [x] [US-599: Archive — adopt + verify under new infra](../tasks/US-599-archive-adopt/README.md)
- [x] [US-600: Links — finalize `IPageHost` membership + `isMain`](../tasks/US-600-links-finalize-ipagehost/README.md)
- [x] [US-600-a: Links — always-on `SecondaryViews`, drop in-view panels, unify Category click](../tasks/US-600-a-links-secondaryviews-refactor/README.md)
- **Phase 2 — Browser**
- [x] [US-601: Browser adopts `SecondaryViews` in its empty page + bookmarks drawer](../tasks/US-601-browser-secondaryviews/README.md)
- **Phase 3 — Remaining editors**
- [x] [US-602: Notebook → `SecondaryViews`](../tasks/US-602-notebook-secondaryviews/README.md)
- [x] [US-603: Todo → `SecondaryViews`](../tasks/US-603-todo-secondaryviews/README.md)
- [x] [US-604: Rest Client → `SecondaryViews`](../tasks/US-604-rest-client-secondaryviews/README.md)
- **Phase 4 — Close-out**
- [x] US-607: Epic close-out — `/review` (code audit vs architecture docs)
- [x] US-608: Epic close-out — `/document` (dev docs in `/doc/`)
- [x] US-609: Epic close-out — `/userdoc` (user docs in `/docs/`)

---

## EPIC-028 — [Unified Editor Architecture — Editors as Standalone Models](EPIC-028.md)

Single-hierarchy editor rewrite via strangler-fig migration over 37 tasks. All 22 editors became top-level `EditorModel` subclasses; text-bearing editors share `IContentHost`; owner-orchestrated switching via `CONTENT_HOST_TRAIT`. The `ContentViewModel` subsystem and the `EditorView` type alias are gone. Major version bump 3.0.10 → 4.0.1. Task folders and the `EPIC-028-editor-architecture/` design folder (walkthroughs, mockups, concerns log) were deleted on close — the per-task READMEs and walkthroughs were in-flight implementation contracts, not enduring reference material. The architectural outcome is captured in `/doc/architecture/editors.md` and the EPIC-028.md doc above. `/review`, `/document`, `/userdoc` skipped per user direction (US-583 / US-584 / US-585 already refreshed the dev-doc and user-doc surfaces).

- **Phase A — Foundation**
- [x] US-547: Foundation primitives — `EditorModel`, `IContentHost`, `ComponentQueue`, `TOneState` selector subscribe, new `editorRegistry`, `PageDescriptor` v4 types, `CONTENT_HOST_TRAIT` (inert)
- [x] US-548: PageModel adapter layer — unified `editors[]` + `_mainEditorId`; `LegacyEditorAdapter`; persistence dual-reads (v3 or v4) writes v4; `compareGroups` to `PagesModel.state`
- [x] US-549: Shared chrome — `PageToolbar` + `TextChrome`; NavPanel button auto-renders for sidebar editors; portal refs retired
- **Phase B — Cross-cutting**
- [x] US-550: MCP + scripting facades partial — `mcp-handler.ts` MI1–MI5; `page.asX()` gains `force?: boolean`; `PageWrapper.type` retired
- **Phase C — Per-editor migrations**
- [x] US-551: Monaco / Text editor migration — `MonacoEditor` v4 class + `<MonacoBody>`; `CONTENT_HOST_TRAIT` + cross-camp switch
- [x] US-552: Grid editor migration — 3 registry ids collapsed into 1 class with `format`
- [x] US-552-B: Host-managed editor view state — generic `getEditorState`/`setEditorState` on `IContentHost`; HS1 pattern established
- [x] US-553: LogView editor migration — `LogViewEditor` over `TextFileModel` host; cleanup of `acquireViewModelSync` callsites
- [x] US-554: Markdown editor migration — search + compact-mode + scroll machinery
- [x] US-560: Svg editor migration — baseline Tier-5 template
- [x] US-561: Html editor migration — identity-only state slice
- [x] US-562: Mermaid editor migration — async render + lightMode HS1
- [x] US-564: Graph editor migration — six owned submodels relocated; canvas-ref bridge
- [x] US-565: Draw editor migration — bidirectional Excalidraw payload loop; HS1 darkMode
- [x] US-555: Link editor migration — first sidebar-owning Tier-5; `beforeNavigateAway` + `onMainEditorChanged` first exercises
- [x] US-556: Todo editor migration — first non-sidebar-owning Tier-5 since Draw
- [x] US-563: Rest Client editor migration — `RestClientShared` extraction; response-cache split-by-scale
- [x] US-557: Notebook editor migration — outer-only scope; inner per-note deferred to US-579
- [x] US-558: Browser editor migration — first no-host v4 editor; first to embed another v4 EditorModel (drawer LinkEditor)
- [x] US-566: Compare editor migration — verification pass (zero source changes; landed in US-548 + US-549)
- [x] US-567: Explorer editor migration — first secondary-only `EditorModel` v4 native
- [x] US-568: PDF editor migration — generic v4-native no-host restore branch (`V4_NO_HOST_EDITOR_IDS`) + `wrapLegacyForPage` early-return for v4 instances
- [x] US-569: Image editor migration — dual-resource lifecycle (blob URL + cache file)
- [x] US-570: Archive editor migration — first no-host sidebar-owning v4 editor; completes EX8 `instanceof` chain
- [x] US-571: Video editor migration — streaming-server session lifecycle + VLC integration; `PageToolbar.noSpacer` opt-in
- [x] US-572: Settings editor migration — simplest no-host (identity-only state)
- [x] US-573: About editor migration — near-clone of Settings
- [x] US-574: MCP Inspector editor migration — most stateful no-host; mechanically the Video pattern in place
- [x] US-575: Storybook editor migration — singleton with persisted UI state
- [x] US-576: Category editor migration — only tree-provider consumer; closes walkthrough-30
- **Phase D — Cleanup**
- [x] US-581: Native v4 editor registry — internalize matching + retire legacy-registry dependency
- [x] US-579: Notebook inner per-note migration — embedded v4 `EditorModel` instances per note via duck-typed `NoteItemEditModel` host
- [x] US-559: Strangler-fig retirement — delete `LegacyEditorAdapter` + content-view subsystem + dual-read persistence; fold legacy `EditorModel` base into `TextFileModel`; bump 3.0.10 → 4.0.1
- [x] US-582: Post-strangler cleanup — drop `V4` prefix, fold `editors/base/v4/*` up, strip EPIC-028 narrative across ~135 files
- [x] US-583: EPIC-028 documentation audit + punch list — 72 files audited, 20 changes identified, U1/U2/U3 user-locked
- [x] US-584: Dev-doc refresh for EPIC-028 close-out — 9 architecture files updated, `editor-guide.md` rewritten, `CLAUDE.md` Key Files refreshed, 5 diagrams rewritten + 2 retired
- [x] US-585: User-doc + QA sweep for EPIC-028 close-out — `page.md` + `editors.md` + `whats-new.md` v4.0.1 section; 37 spot-check files clean

---

## EPIC-025 — [Unified Component Library and Storybook Editor](EPIC-025.md)

- [x] US-437: Design system HTML — closed; exploration complete
- [x] [US-438: Pattern research — adopted patterns + component naming table](../tasks/US-438-pattern-research/README.md)
- [x] US-439: New components folder setup + CLAUDE.md
- [x] US-426: Design tokens — spacing, sizing, border-radius, font-size constants
- [x] [US-427: Layout primitives — Flex, HStack, VStack, Panel, Card, Spacer](../tasks/US-427-layout-primitives/README.md)
- [x] [US-440: Bootstrap component set — minimal components needed for Storybook](../tasks/US-440-bootstrap-components/README.md)
- [x] [US-434: Storybook editor — component browser, live preview, property editor](../tasks/US-434-storybook-editor/README.md)
- [x] [US-450: UIKit Toolbar — semantic landmark, roving tabindex, Storybook adoption](../tasks/US-450-uikit-toolbar/README.md)
- [x] [US-451: UIKit layout refactor — unified Panel + Storybook lighthouse](../tasks/US-451-uikit-panel-refactor/README.md)
- [x] [US-432: Dialog component — new implementation + migration](../tasks/US-432-dialog-component/README.md)
- [x] [US-466: UIKit Popover — overlay primitive](../tasks/US-466-uikit-popover/README.md)
- [x] [US-467: UIKit Tooltip — overlay primitive](../tasks/US-467-uikit-tooltip/README.md)
- [x] [US-468: UIKit ListBox — virtualized list primitive](../tasks/US-468-uikit-listbox/README.md)
- [x] [US-469: UIKit RadioGroup — selection primitive](../tasks/US-469-uikit-radiogroup/README.md)
- [x] [US-470: UIKit Textarea — multi-line text input primitive](../tasks/US-470-uikit-textarea/README.md)
- [x] [US-471: UIKit Input — start/end slots](../tasks/US-471-uikit-input-slots/README.md)
- [x] [US-472: UIKit Select — searchable single-value combobox](../tasks/US-472-uikit-select/README.md)
- [x] [US-473: UIKit Popover — resizable mode](../tasks/US-473-uikit-popover-resizable/README.md)
- [x] [US-474: UIKit PathInput — hierarchical-path autocomplete input](../tasks/US-474-uikit-pathinput/README.md)
- [x] [US-475: UIKit Tag and TagsInput — pill primitive + tag-row composite](../tasks/US-475-uikit-tag/README.md)
- [x] [US-452: About screen — UIKit migration](../tasks/US-452-about-screen-migration/README.md)
- [x] [US-455: MermaidView — UIKit migration](../tasks/US-455-mermaid-view-migration/README.md)
- [x] [US-456: SvgView — UIKit migration](../tasks/US-456-svg-view-migration/README.md)
- [x] [US-457: HtmlView — UIKit migration](../tasks/US-457-html-view-migration/README.md)
- [x] [US-458: ImageViewer — UIKit migration](../tasks/US-458-image-viewer-migration/README.md)
- [x] [US-459: BaseImageView — UIKit adoption](../tasks/US-459-base-image-view-adoption/README.md)
- [x] [US-460: MarkdownSearchBar — UIKit migration](../tasks/US-460-markdown-search-bar-migration/README.md)
- [x] [US-461: Shared FindBar — consolidate MarkdownSearchBar + BrowserFindBar](../tasks/US-461-shared-findbar-consolidation/README.md)
- [x] [US-462: TorStatusOverlay — UIKit migration](../tasks/US-462-tor-status-overlay-migration/README.md)
- [x] [US-463: BrowserDownloadsPopup + DownloadButton — UIKit migration](../tasks/US-463-browser-downloads-migration/README.md)
- [x] [US-464: UrlSuggestionsDropdown — UIKit migration](../tasks/US-464-url-suggestions-dropdown-migration/README.md)
- [x] [US-465: CompareEditor — UIKit migration](../tasks/US-465-compare-editor-migration/README.md)
- [x] [US-476: AlertsBar + AlertItem — UIKit migration](../tasks/US-476-alerts-bar-migration/README.md)
- [x] [US-477: Progress dialog — UIKit migration](../tasks/US-477-progress-dialog-migration/README.md)
- [x] [US-481: UIKit Menu + WithMenu](../tasks/US-481-uikit-menu-with-menu/README.md)
- [x] [US-484: UIKit ListBox extensions — row tooltip, context menu, predicate selection, section rows](../tasks/US-484-uikit-listbox-extensions/README.md)
- [x] [US-485: UIKit Tree — virtualized expand/collapse tree primitive](../tasks/US-485-uikit-tree/README.md)
- [x] [US-488: UIKit Tree extensions — drag-and-drop via traits](../tasks/US-488-uikit-tree-dnd/README.md)
- [x] [US-489: UIKit Tree extensions — lazy children loading](../tasks/US-489-uikit-tree-lazy-load/README.md)
- [x] [US-486: UIKit Splitter — resizable divider primitive](../tasks/US-486-uikit-splitter/README.md)
- [x] [US-487: UIKit model-view migrations — Select, Menu, Popover, PathInput](../tasks/US-487-uikit-model-view-migrations/README.md)
- [x] [US-478: PageTabs / PageTab — UIKit migration](../tasks/US-478-page-tabs-migration/README.md)
- [x] [US-479: FileList + RecentFileList — UIKit migration](../tasks/US-479-filelist-migration/README.md)
- [x] [US-490: OpenTabsList — UIKit migration](../tasks/US-490-opentabslist-migration/README.md)
- [x] [US-491: FolderItem + MenuBar left list — UIKit migration](../tasks/US-491-folderitem-migration/README.md)
- [x] [US-495: ScriptLibraryPanel — UIKit migration](../tasks/US-495-scriptlibrarypanel-migration/README.md)
- [x] [US-496: ToolsEditorsPanel — UIKit migration](../tasks/US-496-toolseditorspanel-migration/README.md)
- [x] [US-497: TreeProviderView — UIKit Tree migration](../tasks/US-497-treeproviderview-migration/README.md)
- [x] [US-492: Sidebar — final integration testing and cleanup](../tasks/US-492-sidebar-integration-testing/README.md)
- [x] [US-480: MarkdownView — UIKit migration](../tasks/US-480-markdown-view-migration/README.md)
- [x] [US-503: UIKit `Dot` primitive — colored circle for status / swatch / palette](../tasks/US-503-uikit-dot/README.md)
- [x] [US-498: Settings page — UIKit migration](../tasks/US-498-settings-page-migration/README.md)
- [x] [US-504: UIKit ghost variants + hover-reveal pattern](../tasks/US-504-uikit-ghost-and-hover-reveal/README.md)
- [x] [US-499: TodoEditor — UIKit migration](../tasks/US-499-todoeditor-migration/README.md)
- [x] [US-500: TextEditor chrome — UIKit migration](../tasks/US-500-text-editor-chrome-migration/README.md)
- [x] [US-533: UIKit `Autocomplete` primitive — free-text input with suggestions dropdown](../tasks/US-533-uikit-autocomplete/README.md)
- [x] [US-534: UIKit primitive extensions — `Text.color` free-form, `Textarea` width/flex, `Panel.dimmed`](../tasks/US-534-uikit-primitive-extensions/README.md)
- [x] [US-501: RestClient editor — UIKit migration](../tasks/US-501-rest-client-migration/README.md)
- [x] [US-502: MCP Inspector — UIKit migration](../tasks/US-502-mcp-inspector-migration/README.md)
- [x] [US-505: Archive editor — UIKit migration](../tasks/US-505-archive-editor-migration/README.md) — absorbed into other migrations
- [x] [US-506: Category editor — UIKit migration](../tasks/US-506-category-editor-migration/README.md) — absorbed into other migrations
- [x] [US-507: Explorer + Search secondary editors — UIKit migration](../tasks/US-507-explorer-secondary-editors-migration/README.md) — absorbed into other migrations
- [x] [US-508: Draw editor — UIKit migration](../tasks/US-508-draw-editor-migration/README.md)
- [x] [US-509: Grid editor chrome — UIKit migration](../tasks/US-509-grid-editor-chrome-migration/README.md)
- [x] [US-511: PDF Viewer — UIKit migration](../tasks/US-511-pdf-viewer-migration/README.md) — absorbed into other migrations
- [x] [US-516: UIKit Breadcrumb primitive](../tasks/US-516-uikit-breadcrumb/README.md)
- [x] [US-517: UIKit CollapsiblePanelStack primitive](../tasks/US-517-uikit-collapsible-panel-stack/README.md)
- [x] [US-512: Notebook editor — UIKit migration](../tasks/US-512-notebook-editor-migration/README.md)
- [x] [US-519: UIKit primitive additions for Graph editor migration](../tasks/US-519-uikit-graph-editor-precursors/README.md)
- [x] [US-513: Graph editor — UIKit migration](../tasks/US-513-graph-editor-migration/README.md)
- [x] [US-520: UIKit primitive additions for Video / Audio editor migration](../tasks/US-520-uikit-video-editor-precursors/README.md)
- [x] [US-514: Video / Audio Player editor — UIKit migration](../tasks/US-514-video-audio-player-migration/README.md)
- [x] [US-521: UIKit `name` debug attribute for all primitives](../tasks/US-521-uikit-name-debug-attribute/README.md)
- [x] [US-515: Browser editor chrome — UIKit migration](../tasks/US-515-browser-editor-chrome-migration/README.md)
- [x] [US-522: UIKit `name` debug-attribute rollout across migrated screens](../tasks/US-522-uikit-debug-naming-rollout/README.md)
- [x] [US-523: LinkEditor — UIKit migration](../tasks/US-523-link-editor-migration/README.md)
- [x] [US-529: UIKit ProgressBar primitive — inline linear progress](../tasks/US-529-uikit-progress-bar/README.md)
- [x] [US-524: LogView editor — UIKit migration](../tasks/US-524-log-view-editor-migration/README.md)
- [x] [US-525: App shell + PageNavigator — chrome migration](../tasks/US-525-app-shell-chrome-migration/README.md)
- [x] [US-530: Editor base shared chrome — UIKit migration](../tasks/US-530-editor-base-chrome-migration/README.md)
- [x] [US-531: `showPopupMenu` — UIKit Menu migration](../tasks/US-531-show-popup-menu-migration/README.md)
- [x] [US-535: `MenuItem` caller-import flips](../tasks/US-535-menuitem-import-flips/README.md)
- [x] [US-536: `components/data-grid/` → `uikit/AVGrid/` migration](../tasks/US-536-uikit-datagrid/README.md)
- [x] [US-538: UIKit `RenderGrid` — virtualization primitive promotion](../tasks/US-538-uikit-rendergrid/README.md)
- [x] [US-539: UIKit `MultiSelect` — multi-value selection primitive](../tasks/US-539-uikit-multiselect/README.md)
- [x] [US-537: RestClient `TreeView` → UIKit `Tree` flip](../tasks/US-537-treeview-flip-restclient/README.md)
- [x] [US-542: Grid options popovers — `Popper` → UIKit `Popover` flip](../tasks/US-542-grid-options-popover-flip/README.md)
- [x] [US-543: KEEP folders — UIKit migration of legacy primitive consumers](../tasks/US-543-keep-folders-uikit-migration/README.md)
- [x] [US-532: Final `components/` sweep — empty the legacy folder](../tasks/US-532-legacy-components-removal/README.md)
- [x] [US-545: EPIC-025 documentation audit + punch list](../tasks/US-545-doc-audit/README.md)
- [x] [US-546: Dev-doc refresh for EPIC-025 close-out](../tasks/US-546-dev-doc-refresh/README.md)
- [x] [US-547: User-doc + QA + asset-guide sweep for EPIC-025 close-out](../tasks/US-547-user-doc-sweep/README.md)
- [x] US-518: UIKit ListBox `selectionStyle="accent"` + Storybook left-panel migration

---

## EPIC-026 — [Trait System — Universal Data Adaptation Layer](EPIC-026.md)

- [x] [US-428: Trait system core — TraitKey, TraitSet, Traited, traited()](../tasks/US-428-trait-system-core/README.md)
- [x] [US-444: Trait-based drag-drop infrastructure + link pilot — TraitRegistry, serialization, native HTML5 DnD, convert link-drag](../tasks/US-444-trait-drag-drop-infrastructure/README.md)
- [x] [US-447: Convert remaining data drags to trait-based system](../tasks/US-447-convert-data-drags-to-traits/README.md)
- [x] [US-448: Cross-type drop targets — FILE_FOLDER→Links import, cross-editor category drops, LINK→RestClient](../tasks/US-448-cross-type-drop-targets/README.md)
- [x] [US-449: Remove React-DnD dependency — convert component-level drags to native HTML5](../tasks/US-449-remove-react-dnd/README.md)
- [x] US-446: Documentation — trait system guide in /doc/architecture/

---

## EPIC-024 — [Video Player Editor](EPIC-024.md)

- [x] US-412: Video player standalone editor — model, registration, UI shell
- [x] US-413: Video playback component (video.js + hls.js)
- [x] US-414: URL input with cURL parsing and format detection
- [x] US-415: IProvider streaming extension (readStream + range support)
- [x] US-416: Local video streaming server for VLC and proxied sources
- [x] US-417: VLC integration — settings and launch

---

## EPIC-023 — [Unified ILinkData Pipeline](EPIC-023.md)

- [x] US-404: Define `ILinkData` interface and helper functions
- [x] US-405: Loosen EventChannel constraint and consolidate link pipeline events
- [x] US-406: Refactor Layer 1 parsers to use ILinkData
- [x] US-407: Refactor Layer 2 resolvers to use ILinkData
- [x] US-408: Refactor Layer 3 open handler and replace ISourceLink
- [x] US-409: Update all pipeline callers to use createLinkData / linkToLinkData
- [x] US-410: Update script API types, IoNamespace, and editor-types
- [x] US-411: Update architecture documentation

---

## EPIC-021 — [Browser Automation API (Lightweight RPA)](EPIC-021.md)

- [x] US-365: CDP integration (Electron debugger API)
- [x] US-366: Browser query and interaction API
- [x] US-367: Browser wait methods (waitForSelector, waitForNavigation)
- [x] US-368: Tab management and background automation
- [x] US-371: Browser accessibility snapshot
- [x] US-369: MCP browser automation commands
- [x] US-375: Automation layer architecture (refactoring)
- [x] US-376: Input dispatch via CDP (Trusted Types fix)
- [x] US-377: Ref resolution improvements
- [x] US-374: Accessibility snapshot: include iframes, detect overlays/popups
- [x] US-372: Fix script implicit return with block-body callbacks
- [x] US-373: Missing Playwright MCP browser tools (browser_hover implemented)
- [x] US-379: Fix browser_evaluate — accept `function` param (Playwright compat)
- [x] US-380: Fix browser_select_option — accept `values` array (Playwright compat)
- [x] US-381: Fix browser_wait_for — add `time` and `textGone` params (Playwright compat)
- [x] US-382: Fix browser_tabs — action-based interface (Playwright compat)
- [x] US-378: Known issues & edge cases (review before epic completion)
- [x] US-383: Block browser automation on incognito/Tor pages
- [x] US-384: MCP browser tools toggle (optional Playwright tools)
- [ ] US-370: Data protection hooks (PHI sanitization layer) — moved to backlog

---

## EPIC-020 — [Browser Network Request Logging & Resource Discovery](EPIC-020.md)

- [x] US-362: Network request logging in main process
- [x] US-363: Merge network logs into Show Resources
- [x] US-364: Open non-GET network requests in RestClient

---

## EPIC-018 — [Secondary Editors — Content Applications](EPIC-018.md)

- [x] US-337: Add `imgSrc` to ITreeProviderItem
- [x] US-338: Move favicon-cache to shared location
- [x] US-339: ItemTile component
- [x] US-340: CategoryView tile modes
- [x] US-341: Rename CategoryEditor → ExplorerFolderEditor + view mode
- [x] US-342: Test in Explorer — fixes and adjustments
- [x] US-343: Make folder editor provider-agnostic
- [x] US-344: LinkTreeProvider
- [x] US-345: Shared panel components
- [x] US-346: Extract LinksList and LinksTiles
- [x] US-348: LinkEditor refactoring — browser removal, context menus
- [x] US-349: CategoryView uses LinksList/LinksTiles
- [x] US-350: ILink type consolidation
- [x] US-351: Secondary editor registration
- [x] US-352: Clean up and unify link actions
- [x] US-353: Replace CategoryTree with TreeProviderView in LinkCategoryPanel
- [x] US-354: Consolidate ILink drag-drop into LinkDragEvent
- [x] US-355: Standalone link collection page
- [x] US-356: Multi-file drop handler
- [x] US-357: Link secondary editor fixes
- [x] US-358: HTML resource extraction
- [x] US-359: Links panel improvements
- [x] US-361: Adopt libarchive-wasm for multi-format archive support

## EPIC-019 — [Explorer as Secondary Editor + Multi-Panel Support](EPIC-019.md)

- [x] US-327: Multi-panel secondaryEditor
- [x] US-328: Create ExplorerEditorModel
- [x] US-329: Wire PageModel to ExplorerEditorModel
- [x] US-330: Search as Explorer panel
- [x] US-331: Per-editor highlighting
- [x] US-332: Simplify pageNavigatorModel
- [x] US-333: Replace expandSecondaryPanel event with direct method
- [x] US-334: Explorer/Search state persistence
- [x] US-335: Update documentation for EPIC-019
- [x] US-336: Improve Explorer/Archive panel highlighting

## EPIC-017 — [Page/Editor Architecture Refactor](EPIC-017.md)

- [x] US-317: Rename core types
- [x] US-318: Rename PageModel → EditorModel
- [x] US-319: Rename editor subclasses + EditorModule interface
- [x] US-320: Rename remaining editor names for consistency
- [x] US-321: Create PageModel class
- [x] US-322: Wire PagesModel to PageModel
- [x] US-323: Simplify navigatePageTo
- [x] US-324: Clean up EditorModel
- [x] US-326: EPIC-017 post-refactor bug fixes

## EPIC-016 — [Secondary Editors — Sidebar Extension System](EPIC-016.md)

- [x] US-312: Source link persistence
- [x] US-313: Secondary editor lifecycle
- [x] US-314: Secondary editor registry
- [x] US-315: ZipPageModel + ZipSecondaryEditor
- [x] US-316: Refactor PageNavigator for secondary editor models

## EPIC-015 — [ITreeProvider — Browsable Source Abstraction](EPIC-015.md)

- [x] US-290: Tree provider types
- [x] US-291: FileTreeProvider
- [x] US-292: ZipTreeProvider
- [x] US-293: TreeProviderView
- [x] US-295: CategoryView
- [x] US-296: Nav panel tree provider
- [x] US-297: Folder editor
- [x] US-298: NavigationData
- [x] US-299: Navigator toggle
- [x] US-300: Sidebar tree provider
- [x] US-301: Page navigator panels
- [x] US-302: Secondary provider
- [x] US-303: Link pipe utils
- [x] US-304: Navigation data persistence
- [x] US-305: Collapsible panel history
- [x] US-306: File search component
- [x] US-307: Search panel integration
- [x] US-308: Decommission nav search
- [x] US-310: Remove file explorer
- [x] US-311: Explorer autorefresh

## EPIC-012 — [Unified Link & Provider Architecture](EPIC-012.md)

- [x] US-260: EventChannel LIFO
- [x] US-261: Interfaces/types
- [x] US-262: FileProvider/ContentPipe
- [x] US-263: Link event channels
- [x] US-264: Raw link parsers
- [x] US-265: Pipe resolvers
- [x] US-266: Open handler
- [x] US-267: Migrate entry points
- [x] US-268: Migrate TextFileIOModel
- [x] US-269: Zip transformer
- [x] US-270: HTTP provider
- [x] US-271: Script API docs
- [x] US-273: cURL parser
- [x] US-274: Migrate reference editors
- [x] US-275: Decrypt transformer
- [x] US-276: Pipe serialization
- [x] US-288: Review EPIC-012
- [x] US-289: Browser image cache

## EPIC-013 — [Rebrand to "Persephone"](EPIC-013.md)

## EPIC-010 — [Rest Client](EPIC-010.md)

