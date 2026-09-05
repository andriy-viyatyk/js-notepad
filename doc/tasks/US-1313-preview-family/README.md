# US-1313: The preview family - markdown, HTML, SVG and mermaid

Epic: [EPIC-086](../../epics/EPIC-086.md) - Task 4 of 8 in the page node redesign and the
text-and-preview editor family.

Status: Implemented

## Goal

Complete the `MarkdownEditorFacade`, `HtmlEditorFacade`, `SvgEditorFacade`, and
`MermaidEditorFacade` so `pages[i].editor` answers both "what can I do on this preview page?" and
"where is that control?". Each facade will expose a complete curated, page-scoped `elements`
inventory, the safe state and actions already represented by its editor view, and `$help` that names
the menus and dialogs the surface can raise.

This document is an investigation and implementation plan only. No source implementation, tests, or
test harnesses are part of this task.

## Background

### Contract inherited from EPIC-086 and US-1311

EPIC-086 decision 8 assigns editor-contributed toolbar controls to the editor facade; the page
editor switch belongs to `editorSwitches`, the navigation toggle belongs to `panels`, and the tab
belongs to `tab` ([EPIC-086.md:148-150](../../epics/EPIC-086.md:148)). US-1311 already makes
page-owned selectors use `[data-page-id="<id>"]`, keeps `elements.visible` as a literal current
layout observation, and activates the page before a slot-hosted highlight
([US-1311 README](../US-1311-page-scoped-elements/README.md:212-234,265-287)).

The implementation consumes that existing infrastructure in each facade. In
`src/renderer/scripting/ai-vision/elements.ts`, `resolvedSelector()` applies the optional scope to
each selector branch (`:36-61`), `isVisible()` queries the scoped renderer document and checks
`offsetParent` (`:86-95`), and `highlight` passes the same resolved selector through the activation
hook and highlighter (`:118-143`). `activatePageAndWaitForLayout()` calls `pagesModel.showPage()`
and waits for the requested page slot to have a non-zero rectangle
(`src/renderer/scripting/ai-vision/page-elements.ts:5-40`). No change to these files is planned.

The four current facades have no `elements` member or provider. Their current member arrays are
small:

| Facade | Current members | Evidence |
|---|---|---|
| Markdown | `id`, `name`, `viewMounted`, `html` | `src/renderer/scripting/api-wrapper/MarkdownEditorFacade.ts:4-11` |
| HTML | `id`, `name`, `html` | `src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts:4-8` |
| SVG | `id`, `name`, `svg`, `savePngToFile` | `src/renderer/scripting/api-wrapper/SvgEditorFacade.ts:5-10` |
| Mermaid | `id`, `name`, `svgUrl`, `loading`, `error`, `savePngToFile` | `src/renderer/scripting/api-wrapper/MermaidEditorFacade.ts:5-12` |

US-1310 already added `id` and `name` to every one of their `summarize()` results: Markdown
(`MarkdownEditorFacade.ts:30`), HTML (`HtmlEditorFacade.ts:29`), SVG
(`SvgEditorFacade.ts:31`), and Mermaid (`MermaidEditorFacade.ts:35-41`). The implementation must
retain both fields while adding only safe, non-secret state to summaries.

### Corrected control counts

The epic table's `6 / 3 / 4 / 6` values are not a consistent count of curated actionable controls.
The source emits structural roots and a transient menu root alongside buttons and inputs. This plan
uses the same rule as the completed Monaco plan: an element is curated when it is an actionable,
user-visible app-owned control; structural roots, counters, viewport containers, minimaps, and
transient menu roots are named in the evidence but are not `elements` declarations.

The corrected `elements` counts are **Markdown 7, HTML 4, SVG 4, Mermaid 6**. They include the
shared `TextChromeView` controls that can actually render for that preview, because those controls
are in the current preview's toolbar and otherwise would be undiscoverable through its facade:

| Surface | Preview-owned actionable controls | Shared controls that can render on this surface | Corrected curated count |
|---|---:|---:|---:|
| Markdown | 6 | `text-compare-left` | **7** |
| HTML | 2 | `text-compare-left`, `text-show-resources` | **4** |
| SVG | 3 | `text-compare-left` | **4** |
| Mermaid | 5 | `text-compare-left` | **6** |

The preview-owned source counts are independently visible in the views: Markdown has two toolbar
buttons and four find controls (`markdown/index.ts:67-70,133-136`; `FindBarView.ts:53-68,129`),
HTML has two toolbar buttons (`html/index.ts:90-107`), SVG has three (`svg/index.ts:82-108`),
and Mermaid has five (`mermaid/index.ts:129-180`). `TextChromeView` renders the compare control
when a left grouped page is comparable (`TextChromeView.ts:73-110`) and renders HTML resources
when the host language is `html` (`TextChromeView.ts:224-243`). Its script buttons are not included:
the view requires a `runScript` method (`TextChromeView.ts:35-38,144-181`), which none of these four
preview editor models supplies (`MarkdownEditor.ts:48-54`, `HtmlEditor.ts:30-33`,
`SvgEditor.ts:21-24`, `MermaidEditor.ts:46-50`).

For auditability, the raw named values in the preview source also explain the old table: Markdown
adds structural names `markdown-view-root`, `markdown-find-column`, `markdown-scroll`, and
`markdown-minimap` (`MarkdownBodyView.ts:54-84,449-460`), plus `find-bar` and
`find-match-counter` (`FindBarView.ts:34-35,77-80`); HTML adds transient
`html-image-menu` (`html/index.ts:136-143`); SVG adds structural `svg-root`
(`SvgBodyView.ts:20-24`); and Mermaid adds structural `mermaid-root`
(`MermaidBodyView.ts:35-42`). None of those is an actionable page control to expose through
`elements`.

### Complete curated `elements` inventory

All entries below already have a stable `data-name`; **no `data-name` attribute needs to be added**.
The implementation should declare them in the corresponding facade, scope with the owning editor's
`page.id`, and use `activatePageAndWaitForLayout(pageId)` as `beforeHighlight`. The selector returned
in every element must be the selector passed to the overlay.

#### Markdown (`md-view`) - 7 controls

| `data-name` | One-line purpose | Existing evidence | Condition and `visible` behavior |
|---|---|---|---|
| `text-compare-left` | Compare this page with the left grouped page. | `src/renderer/editors/base/TextChromeView.ts:92-102` | The button is removed unless there is a left grouped page and `pagesModel.canCompare()` is true (`TextChromeView.ts:73-90`); absent means `visible: false` and normal `found: false`. |
| `markdown-compact-toggle` | Toggle compact spacing and typography in the rendered Markdown. | `src/renderer/editors/markdown/index.ts:67-76` | Mounted with the Markdown toolbar; it remains present while the preview is mounted. Its active state is not represented by `visible`. |
| `markdown-back` | Return to the previous Markdown document in the page's navigation history. | `src/renderer/editors/markdown/index.ts:124-145` | Created only when `page.state.navBackCount > 0`; the view releases it at zero (`index.ts:106-121`). Absent means `visible: false`. |
| `find-input` | Enter the text to find in the rendered Markdown. | `src/renderer/editors/shared/FindBarView.ts:129-136` | The find bar exists only while `searchVisible` is true and no external `highlightText` is active (`MarkdownBodyView.ts:407-425`). Absent means `visible: false`. |
| `find-prev` | Move to the previous Markdown match. | `src/renderer/editors/shared/FindBarView.ts:53-59,104-109` | Same conditional find-bar lifetime as `find-input`; absent means `visible: false`. |
| `find-next` | Move to the next Markdown match. | `src/renderer/editors/shared/FindBarView.ts:60-66,111-116` | Same conditional find-bar lifetime as `find-input`; absent means `visible: false`. |
| `find-close` | Close the Markdown find bar. | `src/renderer/editors/shared/FindBarView.ts:67-73,118-123` | Same conditional find-bar lifetime as `find-input`; absent means `visible: false`. |

`markdown-view-root`, `markdown-find-column`, `markdown-scroll`, `markdown-minimap`, `find-bar`, and
`find-match-counter` are structural/layout or status elements, not extra curated controls. The
Markdown body is native renderer DOM: `MarkdownBodyView` creates its panel and appends the scroll
panel and `MarkdownBlockView` directly (`MarkdownBodyView.ts:223-255`), so no iframe, webview, or
shadow-root boundary limits these selectors.

The repeated `find-prev`, `find-next`, and `find-close` literals in `FindBarView` do not create
duplicate controls. The constructor creates one `previousButton`, `nextButton`, and `closeButton`
(`src/renderer/editors/shared/FindBarView.ts:26-87`), `onMount()` mounts those same fields once
(`FindBarView.ts:89-97`), and `onUpdate()` only updates their props and names
(`FindBarView.ts:99-123`). `MarkdownBodyView` creates or removes one `FindBarView` instance with
the search-bar lifetime (`MarkdownBodyView.ts:407-425`). Both paths therefore cannot coexist in the
DOM for one Markdown page; the page-scoped `find-*` selector is unambiguous and needs no extra
selector disambiguator.

#### HTML (`html-view`) - 4 controls

| `data-name` | One-line purpose | Existing evidence | Condition and `visible` behavior |
|---|---|---|---|
| `text-compare-left` | Compare this page with the left grouped page. | `src/renderer/editors/base/TextChromeView.ts:92-102` | Removed unless the grouped-page comparison predicate succeeds (`TextChromeView.ts:73-90`); absent means `visible: false`. |
| `text-show-resources` | Show extracted HTML resources associated with the text host. | `src/renderer/editors/base/TextChromeView.ts:233-243` | Present when the host language is `html`; the view removes it for other languages (`TextChromeView.ts:224-231`). Absent means `visible: false`. |
| `html-copy` | Copy the captured HTML preview image to the clipboard. | `src/renderer/editors/html/index.ts:90-98` | Always mounted with the HTML toolbar; it is disabled while `capturing` is true, which does not change `visible` (`index.ts:60-64,75-87`). |
| `html-more` | Open the HTML preview's additional image actions. | `src/renderer/editors/html/index.ts:101-108` | Always mounted with the HTML toolbar; disabled while `capturing` is true, but still visible. |

`html-image-menu` is a transient menu root, not a page-scoped element declaration. Its items are
named in `$help` below. The HTML body itself is deliberately not declared: it is the iframe host
boundary described in the next section.

#### SVG (`svg-view`) - 4 controls

| `data-name` | One-line purpose | Existing evidence | Condition and `visible` behavior |
|---|---|---|---|
| `text-compare-left` | Compare this page with the left grouped page. | `src/renderer/editors/base/TextChromeView.ts:92-102` | Removed unless the grouped-page comparison predicate succeeds (`TextChromeView.ts:73-90`); absent means `visible: false`. |
| `svg-open-draw` | Open the SVG as an image in the Drawing Editor. | `src/renderer/editors/svg/index.ts:82-90` | Always mounted; the click handler no-ops for no host or empty content (`index.ts:67-75`). `visible` describes DOM presence, not whether the action has input. |
| `svg-save` | Save a rasterised PNG of the SVG. | `src/renderer/editors/svg/index.ts:92-100` | Always mounted; the action may fail for invalid/empty source and reports that result, but the button remains visible. |
| `svg-copy` | Copy a rasterised PNG of the SVG to the clipboard. | `src/renderer/editors/svg/index.ts:102-110` | Always mounted; the current body delegates to `ImageViewportView.copyToClipboard()` (`SvgBodyView.ts:101-103`). `visible` is not an enabled-state report. |

`svg-root` is the structural body root (`src/renderer/editors/svg/SvgBodyView.ts:20-24`), not an
additional control. The SVG body uses an ordinary `ImageViewportView` child in the same renderer
document (`SvgBodyView.ts:45-60`); it does not use an iframe, webview, or shadow root.

#### Mermaid (`mermaid-view`) - 6 controls

| `data-name` | One-line purpose | Existing evidence | Condition and `visible` behavior |
|---|---|---|---|
| `text-compare-left` | Compare this page with the left grouped page. | `src/renderer/editors/base/TextChromeView.ts:92-102` | Removed unless the grouped-page comparison predicate succeeds (`TextChromeView.ts:73-90`); absent means `visible: false`. |
| `mermaid-theme` | Toggle the Mermaid preview's light/dark rendering mode. | `src/renderer/editors/mermaid/index.ts:129-137` | Always mounted; changing it starts the debounced re-render through `MermaidEditor.toggleLightMode()` (`MermaidEditor.ts:166-173`). |
| `mermaid-open-draw` | Open the rendered diagram in the Drawing Editor. | `src/renderer/editors/mermaid/index.ts:139-148` | Always mounted but disabled while `svgUrl` is empty (`index.ts:139-145`); disabled does not mean invisible. |
| `mermaid-convert-excalidraw` | Convert the Mermaid source to editable Excalidraw shapes. | `src/renderer/editors/mermaid/index.ts:150-159` | Always mounted but disabled while `svgUrl` is empty (`index.ts:150-156`); disabled does not mean invisible. |
| `mermaid-save` | Save the rendered diagram as a PNG. | `src/renderer/editors/mermaid/index.ts:161-170` | Always mounted but disabled while `svgUrl` is empty (`index.ts:161-168`); disabled does not mean invisible. |
| `mermaid-copy` | Copy the rendered diagram as a PNG to the clipboard. | `src/renderer/editors/mermaid/index.ts:172-180` | Always mounted but disabled while `svgUrl` is empty (`index.ts:172-178`); disabled does not mean invisible. |

`mermaid-root` is a structural body root (`src/renderer/editors/mermaid/MermaidBodyView.ts:35-42`),
not a seventh control. The body swaps an ordinary `ImageViewportView` into that root
(`MermaidBodyView.ts:164-188`); it does not use an iframe, webview, or shadow root.

### HTML's foreign-document boundary

`HtmlBodyView` constructs an actual `HTMLIFrameElement`, sets `sandbox="allow-scripts"`, and mounts
it as the body root (`src/renderer/editors/html/HtmlBodyView.ts:45-60`). It writes the preview source
to `iframe.srcdoc` (`HtmlBodyView.ts:97-106`), and the source comments explicitly state that the
nested document owns its listeners and that iframe clicks do not bubble to the host document
(`HtmlBodyView.ts:6-18`). The frame has an opaque origin because `allow-same-origin` is absent
(`HtmlBodyView.ts:17-21`). Therefore the renderer's `document.querySelectorAll` cannot cross into
the preview document; even same-origin assumptions would be wrong here because this frame is
sandboxed.

The exact proposed HTML facade help wording is:

> `HTML preview content is rendered in a sandboxed srcdoc iframe. page.editor.elements reports host-chrome controls only; its selectors stop at the renderer document and do not cross into the iframe. Use the browser automation surface that EPIC-089 will attach to this same page node for DOM inside the preview document. The html property is the source content, not the iframe DOM.`

Do not add a selector for the iframe's internal `html`, `body`, or user-authored controls. The
`html-copy` and `html-more` declarations above address the host toolbar, and their capture path is
also host-aware: `HtmlEditor` registers the iframe as a transient capture element and captures its
composited pixels through main-process `capturePageRegion()` (`src/renderer/editors/html/HtmlEditor.ts:35-38,59-89`).

The other three previews remain in the renderer document. Markdown appends its rendered block to a
native panel (`MarkdownBodyView.ts:238-255`); SVG appends an `ImageViewportView`
(`SvgBodyView.ts:45-60`); and Mermaid creates an `ImageViewportView` for the rendered data URL
(`MermaidBodyView.ts:172-188`). A repository search of these four editor trees finds no
`attachShadow`, `shadowRoot`, `webview`, or second iframe mount. Their page-scoped selectors can
therefore address the host controls and same-document preview chrome, subject to normal conditional
presence.

### Facade members to add

The current facades expose only a subset of the operations already implemented by their models and
views. Add the following public members and mirror them in the canonical declarations under
`src/renderer/api/types/`. `id` and `name` remain read-only. Every state/UI/file/clipboard/page
mutation below carries a descriptor `caution`; read-only state does not.

| Facade | Read-only members to retain/add | Caution-bearing members to add | Source evidence |
|---|---|---|---|
| Markdown | Retain `viewMounted`, `html`; add `compactMode: boolean`, `searchVisible: boolean`, `searchText: string`, `currentMatchIndex: number`, `totalMatches: number`. | `revealFragment(fragment: string): void`, `navigateBack(): Promise<void>`, `toggleCompact(): void`, `openSearch(): void`, `closeSearch(): void`, `setSearchText(text: string): void`, `nextMatch(): void`, `prevMatch(): void`. | State fields: `MarkdownEditor.ts:24-46`; navigation/queue: `:77-104`; mutators: `:124-181`; DOM getters: `:185-192`. |
| HTML | Retain `html`; add `capturing: boolean`. | `savePngToFile(filePath: string): Promise<string>`, `copyImageToClipboard(): Promise<void>`, `openInImageView(): Promise<void>`, `editImage(): Promise<void>`. | Capture and actions: `HtmlEditor.ts:35-38,64-89,102-135`; native save dialog helper: `src/renderer/editors/shared/image-export.ts:66-87`. |
| SVG | Retain `svg`, `savePngToFile`; add no new read-only state. | `openInDrawingEditor(): Promise<void>`, `copyImageToClipboard(): Promise<void>`. | Existing raster export: `SvgEditor.ts:44-54`; Drawing action: `src/renderer/editors/svg/index.ts:67-79`; view clipboard action: `SvgBodyView.ts:101-103`, backed by `ImageViewportView.copyToClipboard()` (`src/renderer/uikit/ImageViewport/ImageViewportView.ts:190-197`). |
| Mermaid | Retain `svgUrl`, `loading`, `error`, `savePngToFile`; add `lightMode: boolean`. | `toggleLightMode(): void`, `openInDrawingEditor(): Promise<void>`, `convertToExcalidraw(): Promise<void>`, `copyImageToClipboard(): Promise<void>`. | State/render pipeline: `MermaidEditor.ts:24-44,114-164`; theme mutator/export: `:166-190`; Drawing and conversion implementations currently live in view callbacks (`src/renderer/editors/mermaid/index.ts:183-216`); view clipboard delegate: `MermaidBodyView.ts:192-194`, backed by `ImageViewportView.ts:190-197`. |

For SVG and Mermaid, move or share the existing view-only Drawing/copy behavior so the toolbar and
facade call one implementation; do not duplicate divergent conversions in the facade. The
implementation may put the shared operation on the editor model and retain a small view delegate.
The public method names above should be the correctly spelled facade names, not private callback
names. PNG file methods use the existing `writePngToFile()` path (`image-export.ts:57-63`) and
must retain the overwrite caution.

The action-routing decision is explicit: `SvgEditor.exportPng()` is a source/state operation
(`src/renderer/editors/svg/SvgEditor.ts:44-54`), so SVG `openInDrawingEditor()`,
`savePngToFile(filePath: string): Promise<string>`, and `copyImageToClipboard(): Promise<void>`
must be model/helper operations. Mermaid `toggleLightMode()` and `exportPng()` are likewise model
state/render operations (`src/renderer/editors/mermaid/MermaidEditor.ts:166-190`); Mermaid
`openInDrawingEditor()`, `convertToExcalidraw()`, `savePngToFile(filePath: string): Promise<string>`,
and `copyImageToClipboard(): Promise<void>` must use that shared model/helper boundary. None of
these SVG/Mermaid facade actions may call the live `ImageViewportView`: the current body delegates
at `SvgBodyView.ts:101-103` and `MermaidBodyView.ts:192-194`, while Mermaid creates that viewport
only during render at `MermaidBodyView.ts:164-188`. The toolbar/body callbacks will delegate to
the same model/helper methods instead.

Before body mount, a valid source is therefore sufficient: model-level SVG actions and Mermaid
actions either complete or reject based on source/render/IO availability, not on body mounting.
Empty SVG source, missing Mermaid source, failed Mermaid render, and clipboard/file failures must
throw or reject an `Error` whose diagnostic names the reason (for example, “Mermaid preview cannot
copy an image because rendering failed”); they must never resolve as a fabricated success or silently
no-op. Any newly caught value is rendered with `errMessage`. This follows the diagnostic failure
contract used by US-1312 (`doc/tasks/US-1312-monaco-text-surface/README.md:367-378`).

HTML is the separate mount-dependent case: its capture actions require the registered iframe and
capture path (`HtmlEditor.ts:35-38,59-89`). `HtmlEditorFacade` must check `capturing` before
`savePngToFile`, `copyImageToClipboard`, `openInImageView`, and `editImage`; when busy it throws a
diagnostic such as “HTML preview image action is already in progress; wait for capturing to finish.”
The existing `withCapture()` guard at `HtmlEditor.ts:100` remains a toolbar/re-entrancy safety net,
but facade calls must not expose its silent early return.

The canonical type signatures should be settled as follows (the implementation must keep the
runtime descriptor and `.d.ts` in lockstep):

| Facade | Exact additions |
|---|---|
| Markdown | `compactMode: boolean`, `searchVisible: boolean`, `searchText: string`, `currentMatchIndex: number`, `totalMatches: number`; `revealFragment(fragment: string): void`, `navigateBack(): Promise<void>`, `toggleCompact(): void`, `openSearch(): void`, `closeSearch(): void`, `setSearchText(text: string): void`, `nextMatch(): void`, `prevMatch(): void`. |
| HTML | `capturing: boolean`; `savePngToFile(filePath: string): Promise<string>`, `copyImageToClipboard(): Promise<void>`, `openInImageView(): Promise<void>`, `editImage(): Promise<void>`. |
| SVG | `openInDrawingEditor(): Promise<void>`, `copyImageToClipboard(): Promise<void>`. |
| Mermaid | `lightMode: boolean`; `toggleLightMode(): void`, `openInDrawingEditor(): Promise<void>`, `convertToExcalidraw(): Promise<void>`, `copyImageToClipboard(): Promise<void>`. |

For Markdown, `setMatchCount()` is a view-to-model bridge (`MarkdownEditor.ts:158-165`), not an
agent capability, so it must not be exposed. For all four facades, keep internal lifecycle hooks,
DOM refs, queue fields, and private rendering callbacks out of the public surface.

### Menus and dialogs named in `$help`

The implementation must add the following wording to each relevant facade help block. Transient
menus and dialogs are not page-scoped `elements`; use the existing `menus` and `dialogs` nodes after
the action opens them. The dialog node contract is indexed live display order
(`src/renderer/scripting/ai-vision/dialogs/index.ts:69-95`).

| Surface | Menu/dialog | Evidence and required help description |
|---|---|---|
| All four text-host previews | Page-tab text-file menu: `Save`, `Save As...`, `Rename`, `Show in File Explorer`, `Copy File Path`, `Decrypt`, `Encrypt`/`Change Password`, `Make Unencrypted`; HTML file paths also add `Open in Browser`. | The common menu is contributed by every `TextFileModel` host (`src/renderer/editors/shared/editor-menu-items.ts:60-107`; `src/renderer/editors/text/TextEditorModel.ts:442-445`). Name it as the page-tab popup menu and direct agents to its live menu items, not to fake page elements. |
| All four text-host previews | `Rename File` input dialog; `Unsaved Changes` confirmation with `Save`, `Don't Save`, `Cancel`; password dialog for encryption/decryption. | Rename: `TextEditorModel.ts:428-440`; unsaved release: `src/renderer/editors/text/TextFileActionsModel.ts:83-96`; password menu and adapter: `editor-menu-items.ts:89-105`, `src/renderer/scripting/ai-vision/dialogs/password.ts:1-33`. Never expose password or confirmation secrets. |
| Markdown | `markdown-link` context menu: `Open in New Tab`, `Copy Link`, and for external links `Open in Default Browser`, `Open in Internal Browser`, configured browser profiles, and `Open in Incognito`. | The context event and item labels are built at `src/renderer/editors/markdown/MarkdownBlockView.ts:260-276`; browser variants are appended by `src/renderer/editors/shared/link-open-menu.ts:22-65`. `$help` must say this menu appears only after a rendered link is right-clicked. |
| HTML | `html-image-menu` opened by `html-more`, with `Save as PNG`, `Open in Image View`, and `Edit Image`. The Save item opens the native `Save Image` file dialog. | Menu construction and labels: `src/renderer/editors/html/index.ts:136-163`; dialog title: `src/renderer/editors/shared/image-export.ts:69-76`. The iframe content itself has no host-document menu contract. |
| SVG and Mermaid | `Save Image` native file dialog from `svg-save` / `mermaid-save`; Drawing Editor page from the open-draw action; Mermaid conversion can open a new Excalidraw page and emit an informational notification on image-only/fallback conversion. | Shared dialog: `src/renderer/editors/shared/image-export.ts:66-87`; SVG page creation: `src/renderer/editors/svg/index.ts:67-79`; Mermaid page creation, fallback, and notifications: `src/renderer/editors/mermaid/index.ts:183-216`. |

The help text must also say that `elements.visible` reports DOM presence and layout, not whether a
button is enabled: HTML capture buttons and Mermaid export buttons remain visible while disabled.
The HTML help must include the exact foreign-document paragraph above.

### QA file choice

Add one family file, `qa/surfaces/editors/preview.md`, rather than four nearly identical files.
The shared risk is page scoping and the shared `TextChrome` ownership; one file can exercise all four
editor ids, compare visibility, conditional controls, transient menu/dialog discovery, and the
HTML iframe boundary in one call-only matrix. Splitting by editor would repeat the same inactive-page
and generated-selector checks and make the corrected count table harder to keep synchronized.
The file must follow `qa/surfaces/page.md`: each scenario has `Test`, `Preparation`, `Call`, and
`Verify` sections; it must say not to add or run automated tests or a harness.

Proposed scenarios for that file:

1. **Test V.1: Four preview inventories.** Open Markdown, HTML, SVG, and Mermaid pages and read each
   `pages[i].editor.elements`. Verify the lists contain exactly 7, 4, 4, and 6 declarations,
   respectively; every selector contains that page's `[data-page-id="<id>"]`; every purpose is
   non-empty; and structural roots (`markdown-view-root`, `svg-root`, `mermaid-root`) and
   `html-image-menu` are not falsely advertised as persistent controls.
2. **Test V.2: Same-editor page scope and inactive highlight.** Open two pages of each preview type,
   leave the second inactive, and read both inventories. Verify the active page's present controls
   are visible while the retained inactive slot's controls are not. Highlight a present control on
   the inactive page and verify it activates that exact id, waits for layout, and rings only the
   requested page. Repeat with `text-compare-left` when a comparable grouped pair exists.
3. **Test V.3: Conditional and disabled states.** For Markdown verify `markdown-back` disappears
   with no back history. With `searchVisible` true, verify the four find controls appear only when
   the Markdown host has no external `editorConfig.highlightText` (`MarkdownBodyView.ts:407-425`):
   mount/use a preview fixture with non-empty `highlightText`, call `openSearch()`, and verify all
   four `find-*` controls remain absent; clear that external highlight and verify they appear, then
   close search and verify they disappear. For HTML verify the capture buttons remain visible while
   `capturing` disables them and that facade actions reject with the busy diagnostic. For Mermaid
   verify all five toolbar controls remain in the list while export controls are disabled during
   loading/no SVG; no disabled control is reported absent.
4. **Test V.4: HTML foreign-document boundary.** Put a user-authored named button inside the HTML
   source and verify `html-view.elements` contains host controls only, never a selector for that
   iframe button or its internal document. Verify `$help` points to the future EPIC-089 browser
   automation surface. Do not use `document.querySelectorAll` as evidence that the iframe content
   is in the host document.
5. **Test V.5: Menus, dialogs, and actions.** Open HTML's `html-more` and inspect the transient
   `html-image-menu` items; exercise the Markdown link context menu; invoke the PNG save actions and
   verify the `Save Image` native picker path; verify the common page-tab menu and the named rename,
   unsaved-change, and password dialog paths. Confirm no password value enters a summary.
6. **Test V.6: Same-document previews and identity.** Verify Markdown, SVG, and Mermaid previews
   remain highlightable through their page-scoped host controls. Repeat with a grouped pair and
   confirm each wrapper, slot, and tab retains its own page id; grouping does not merge selectors.

## Implementation Plan

1. **Extend each preview facade descriptor.** In
   `src/renderer/scripting/api-wrapper/MarkdownEditorFacade.ts`, `HtmlEditorFacade.ts`,
   `SvgEditorFacade.ts`, and `MermaidEditorFacade.ts`, add the declarations listed above, import
   `ui`, `createElements`, `pageScopeSelector`, and `activatePageAndWaitForLayout`, and build the
   element helper inside `aiVision` from `this.editor.page?.id`. Merge `elements.members` into each
   member list and return `elements.provide` plus the static declaration list. Keep the default
   unscoped behavior only for a genuinely page-less editor instance; normal page access must always
   use `[data-page-id="<id>"]`.
2. **Keep ownership and selector semantics exact.** Do not add `page-editor-switch`,
   `page-nav-panel`, tab controls, structural preview roots, iframe-internal selectors, or transient
   menu roots to these lists. `highlight` must activate the page through the existing frame/layout
   helper; reading `elements` must never activate it. An absent conditional control must return
   `visible: false` and the normal `found: false` highlight result.
3. **Complete the Markdown facade and type.** Add the five state getters and eight actions in the
   member table to `MarkdownEditorFacade.ts`, with caution on every state/UI/navigation mutation.
   Keep `html` as same-document rendered HTML and `viewMounted` as the DOM-ref status. Update
   `src/renderer/api/types/markdown-editor.d.ts` to exactly match the runtime facade, without
   exposing `setMatchCount` or internal queue/lifecycle members.
4. **Complete the HTML facade and type.** Add `capturing` and the PNG/file/image actions. Use the
   existing `HtmlEditor` capture methods and `writePngToFile()`; retain the distinction that direct
   PNG capture requires a mounted visible iframe while `html` reads source content. Add the exact
   iframe help paragraph and common/menu/dialog cross-references. Update
   `src/renderer/api/types/html-editor.d.ts`; do not expose iframe DOM or a fake `html-preview`
   selector.
5. **Share SVG actions between view and facade.** Move the current SVG Drawing Editor conversion
   into a model-level/public operation callable by both `SvgToolbarBitsView` and the facade, and
   add a model/facade clipboard operation backed by the existing image raster helper. Empty source
   must become a diagnostic rejection for facade/model calls, not the current silent no-op. Update
   `SvgEditorFacade.ts` and `src/renderer/api/types/svg-editor.d.ts` with the two actions and
   explicit write/clipboard cautions.
6. **Share Mermaid actions between view and facade.** Expose `lightMode` and its existing toggle;
   move/share the open-drawing, conversion, and clipboard operations currently held by
   `MermaidToolbarBitsView`/`MermaidBodyView`. Preserve the debounced render pipeline, disabled
   state while `svgUrl` is empty, and notification fallback, while making direct facade/model calls
   render or reject diagnostically rather than silently no-op. Any newly caught value must use
   `errMessage`; do not retain `e.message` hand-stringification. Update `MermaidEditorFacade.ts`
   and `src/renderer/api/types/mermaid-editor.d.ts`.
7. **Settle mounted-body routing and failure behavior.** Keep all proposed SVG/Mermaid actions at
   the editor model/shared-helper boundary; body and toolbar views delegate to it, and no facade
   action calls `ImageViewportView` or depends on a mounted body. A valid source permits the action
   before body mount; absent/empty source, render failure, and clipboard/file failure throw or reject
   a reason-naming diagnostic and never resolve silently. Separately, HTML facade image actions
   check `capturing` and reject with the busy diagnostic before entering the existing
   `withCapture()` guard (`HtmlEditor.ts:100`).
8. **Write the help text.** Name each surface's exact persistent controls, the common page-tab text
   menu, the Markdown `markdown-link` menu, HTML's `html-image-menu`, the `Save Image` picker,
   Drawing/Excalidraw page actions, `Rename File`, `Unsaved Changes`, and password dialog. Explain
   that transient menus/dialogs are reached through `menus`/`dialogs`, that disabled controls are
   still visible, and that HTML `elements` stop at the iframe boundary.
9. **Add family QA.** Create `qa/surfaces/editors/preview.md` with V.1-V.6 in the format above.
    This is manual `call`-only QA: no unit tests, test harnesses, or automated test files.
10. **Regenerate declarations and verify.** Edit only canonical declarations in
   `src/renderer/api/types/`. The `editorTypesPlugin` in `vite.renderer.config.ts:8-47` copies all
   canonical `.d.ts` files to `assets/editor-types/` during Vite `buildStart`. Run `npm run build-prod`
   (or start Vite with `npm start`) after changing typings; never hand-edit generated output.
   Verify typecheck, lint, production build, the preview QA file, selector scoping, and `id`/`name`
   in all four summaries. Do not update the epic or dashboard in this task.

### Before -> after snippets

```ts
// src/renderer/scripting/api-wrapper/MarkdownEditorFacade.ts (current)
const MARKDOWN_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "viewMounted", kind: "property", summary: "..." },
    { name: "html", kind: "property", summary: "..." },
];

// planned shape
const elements = createElements(MARKDOWN_ELEMENTS, ui.highlightElement.bind(ui), {
    scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
    beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
});
// descriptor members: [...MARKDOWN_EDITOR_MEMBERS, ...elements.members]
```

```ts
// src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts (current)
get aiVision(): IAiVisionDescriptor {
    return {
        members: HTML_EDITOR_MEMBERS,
        help: HTML_EDITOR_HELP,
        summarize: () => ({ kind: "HtmlEditor", id: this.id, name: this.name, htmlLength: this.html.length }),
    };
}

// planned shape
get aiVision(): IAiVisionDescriptor {
    const pageId = this.editor.page?.id;
    const elements = createElements(HTML_ELEMENTS, ui.highlightElement.bind(ui), {
        scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
        beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
    });
    return {
        members: [...HTML_EDITOR_MEMBERS, ...elements.members],
        provide: elements.provide,
        elements: HTML_ELEMENTS,
        // help includes the exact iframe boundary wording above
    };
}
```

```ts
// SVG/Mermaid planned public action shape; existing view callbacks delegate to these too.
{ name: "openInDrawingEditor", kind: "method", signature: "openInDrawingEditor(): Promise<void>", caution: "opens a new Drawing Editor page" },
{ name: "copyImageToClipboard", kind: "method", signature: "copyImageToClipboard(): Promise<void>", caution: "writes rendered image data to the clipboard" },
```

## Concerns

- **Count definition:** The epic's values count a mixture of actionable controls, structural roots,
  and a transient menu root. The corrected implementation count is 7/4/4/6 under the explicit
  actionable-control rule above. Raw source names are recorded so a future inventory review can
  distinguish a new control from a layout label.
- **Shared toolbar ownership:** The preview facades include only shared controls that can render for
  that concrete preview (`text-compare-left` on all four and `text-show-resources` on HTML). The
  script buttons require a `runScript` model method and never render on these four models; they stay
  in the Monaco/text task's inventory.
- **Foreign document:** HTML is an `iframe[srcdoc]` with an opaque sandbox origin. Host selectors
  must stop at the iframe. EPIC-089 owns future automation inside that document; this task must not
  invent a cross-document selector or rename the HTML node into a browser editor.
- **Conditional versus disabled:** Find/back/compare controls can be absent and must report
  `visible: false`; Markdown's find bar additionally disappears whenever external
  `editorConfig.highlightText` is active, even when `searchVisible` is true
  (`MarkdownBodyView.ts:407-425`). Capture/export controls can be disabled while remaining in the
  DOM; `visible` must remain true when laid out. `createElements` does not expose enabled state, so
  help and facade state must explain that distinction.
- **Action sharing and mount timing:** SVG's Drawing/copy callbacks and Mermaid's copy callback
  currently depend on view-side code (`SvgBodyView.ts:101-103`, `MermaidBodyView.ts:192-194`), and
  Mermaid's viewport is created only during render (`MermaidBodyView.ts:164-188`). Put every
  proposed SVG/Mermaid action at the model/helper boundary, with body/toolbar delegation only;
  do not call a live child view from a facade. Valid source must work before body mount, while
  absent source, render failure, and clipboard/file failure must throw/reject a reason-naming
  diagnostic. The existing empty-source no-op is not an acceptable facade result.
- **HTML capture re-entrancy:** `HtmlEditor.withCapture()` returns early when `capturing` is true
  (`HtmlEditor.ts:100`), which would otherwise look like a successful facade action. The facade must
  reject all four HTML image actions, including PNG save, with a diagnostic naming the busy reason
  before entering that guard; retaining the guard is still useful for toolbar re-entrancy.
- **No data-name additions:** Every actionable control in the corrected inventory already has a
  `data-name`. Do not add names to structural roots merely to match an old count, and never rename
  an existing `data-type`.
- **Epic count correction:** The EPIC-086 family table is stale for Markdown `6` and HTML `3`;
  source verification in this plan yields `7` and `4` (SVG `4`, Mermaid `6`). The orchestrator must
  correct `doc/epics/EPIC-086.md`; this task must not edit that orchestrator-owned file.
- **Mandatory coding constraints:** Add no unit tests or test harnesses. Do not hardcode colours;
  use theme tokens if any styling change unexpectedly becomes necessary. For caught `unknown` values,
  use `errMessage(e, fallback?)` from `src/shared/utils.ts`. Use `file-path` utilities for path
  operations; never add `require("path")`. `assets/editor-types/*.d.ts` is GENERATED from
  `src/renderer/api/types/` and must never be hand-edited; regenerate it with `npm run build-prod`
  (or `npm start`/Vite build start) if typings change.
- **Scope protection:** Do not edit `doc/active-work.md` or `doc/epics/EPIC-086.md`; the orchestrator
  owns both files.

## Acceptance Criteria

- `MarkdownEditorFacade.elements`, `HtmlEditorFacade.elements`, `SvgEditorFacade.elements`, and
  `MermaidEditorFacade.elements` return exactly 7, 4, 4, and 6 curated actionable declarations,
  each with a one-line purpose and a selector scoped to the owning `[data-page-id]`.
- Every inventory item is backed by an existing `data-name`; no new `data-name` or `data-type`
  change is required. Structural roots and transient menus are excluded from `elements` but named
  in help where relevant.
- Conditional controls (`text-compare-left`, `markdown-back`, Markdown find controls, and HTML
  resources) are statically declared but report `visible: false` and normal not-found results when
  absent. Markdown find controls are also absent when external `editorConfig.highlightText` is
  active, even with `searchVisible: true`. Disabled HTML/Mermaid controls remain visible when
  present.
- Highlighting an inactive preview control activates exactly its page and waits for the retained slot
  layout; reading `elements` does not activate a page. Same-editor, grouped, and compare identities
  remain distinct.
- HTML help states the exact iframe boundary and points to the EPIC-089 browser automation surface
  for DOM inside the preview. No iframe-internal selector is declared.
- All four facades expose the missing state/actions in the member table, with `caution` on every
  page/UI/file/clipboard mutation. Every `summarize()` retains both `id` and `name` and excludes
  secrets and internal lifecycle state.
- SVG and Mermaid toolbar/body delegates share model/helper actions; no proposed facade action calls
  a mounted `ImageViewportView`. Valid source works before body mount, while absent source, render,
  clipboard, and file failures reject with reason-naming diagnostics and never fabricated success.
  HTML image actions reject with a reason-naming busy diagnostic when `capturing` is true.
- `$help` names the common page-tab menu and its actions, Markdown's link menu, HTML's image menu,
  the Save Image picker, Drawing/Excalidraw actions, Rename File, Unsaved Changes, and password
  dialog, with transient UI directed through `menus`/`dialogs`.
- `qa/surfaces/editors/preview.md` exists with call-only V.1-V.6 scenarios in the format of
  `qa/surfaces/page.md`, including foreign-document, conditional, disabled, scoping, identity,
  menu, and dialog coverage. No unit tests or test harnesses are added.
- Canonical typings are edited only under `src/renderer/api/types/`; generated editor typings are
  regenerated by Vite and never hand-edited. Typecheck, lint, production build, and manual QA pass.

## Files that need NO changes

- `src/renderer/scripting/ai-vision/elements.ts` - US-1311 already provides page selector scoping,
  literal visibility, selector reuse, and pre-highlight hooks.
- `src/renderer/scripting/ai-vision/page-elements.ts` - its bounded page activation and layout wait
  already satisfy the slot-hosted highlight contract.
- `src/renderer/components/page-manager/PageSlot.ts` and `src/renderer/ui/tabs/PageTabView.ts` -
  US-1311 already emits `data-page-id`; no identity wiring change is needed for previews.
- `src/renderer/editors/base/TextChromeView.ts` - shared controls and their conditional render
  branches are already correct; preview facades only consume them.
- `src/renderer/editors/shared/FindBarView.ts` - Markdown's four actionable find names already
  exist; no `data-name` addition is required.
- `src/renderer/uikit/ImageViewport/ImageViewportView.ts` - same-document image mounting and
  clipboard rasterisation already exist; preview facades/model actions can reuse them.
- `src/renderer/editors/html/HtmlBodyView.ts` - the iframe boundary is already explicit and correct;
  this task must respect it rather than modify the preview document.
- `src/renderer/editors/markdown/MarkdownBodyView.ts` and `src/renderer/editors/svg/SvgBodyView.ts` -
  their native same-document mount paths need no structural change.
- `src/renderer/editors/mermaid/MermaidBodyView.ts` - its same-document image viewport and loading
  branches are already correct; only action sharing may touch the Mermaid view callback.
- `src/renderer/scripting/ai-vision/dialogs/index.ts` and
  `src/renderer/scripting/ai-vision/menus/index.ts` - existing live transient UI adapters are
  sufficient; facade help only needs to cross-reference them.
- `src/renderer/editors/shared/image-export.ts` - the native `Save Image` dialog and file-writing
  helpers already exist and should be reused.
- `doc/architecture/ui-element-contract.md` - `data-name`, `data-type`, `data-page-id`, and the
  page-scoped selector rules are already documented by US-1311.
- `qa/surfaces/page.md` - it is the page-scoping precedent; this task adds the separate family file
  rather than changing the generic scenarios.
- `assets/editor-types/` - generated output only; regenerate from canonical declarations and never
  hand-edit it.
- `doc/active-work.md` and `doc/epics/EPIC-086.md` - explicitly orchestrator-owned.

## Files Changed Summary

| Path | Current status | Planned change |
|---|---|---|
| `doc/tasks/US-1313-preview-family/README.md` | New task document | Record verified preview inventory, counts, foreign-document boundary, facade gaps, plan, constraints, and acceptance criteria. |
| `src/renderer/scripting/api-wrapper/MarkdownEditorFacade.ts` | Read-only facade; no elements | Add seven scoped declarations, Markdown state/actions, help, and provider wiring. |
| `src/renderer/scripting/api-wrapper/HtmlEditorFacade.ts` | Source-only facade; no elements | Add four scoped host-chrome declarations, capture/image actions, iframe-boundary help, and provider wiring. |
| `src/renderer/scripting/api-wrapper/SvgEditorFacade.ts` | Source plus PNG-file export; no elements | Add four scoped declarations, Drawing/clipboard actions, help, and provider wiring. |
| `src/renderer/scripting/api-wrapper/MermaidEditorFacade.ts` | State plus PNG-file export; no elements | Add six scoped declarations, theme/Drawing/conversion/clipboard actions, help, and provider wiring. |
| `src/renderer/api/types/markdown-editor.d.ts` | Minimal generated API contract | Match the completed Markdown facade members and elements/highlight contract. |
| `src/renderer/api/types/html-editor.d.ts` | Minimal generated API contract | Match the completed HTML facade members and host-only elements contract. |
| `src/renderer/api/types/svg-editor.d.ts` | Minimal generated API contract | Match the completed SVG facade members and elements contract. |
| `src/renderer/api/types/mermaid-editor.d.ts` | Minimal generated API contract | Match the completed Mermaid facade members and elements contract. |
| `src/renderer/editors/svg/SvgEditor.ts` / `src/renderer/editors/svg/index.ts` | Drawing action is view-local | Share Drawing and clipboard operations with the facade while preserving current toolbar behavior. |
| `src/renderer/editors/mermaid/MermaidEditor.ts` / `src/renderer/editors/mermaid/index.ts` / `src/renderer/editors/mermaid/MermaidBodyView.ts` | Theme/render actions span model and private view callbacks | Share public Drawing, conversion, and clipboard actions with the facade; preserve render and notification behavior. |
| `qa/surfaces/editors/preview.md` | Not yet present | Add one call-only QA file for all four preview surfaces, scoping, conditions, menus/dialogs, and iframe boundary. |
| `assets/editor-types/*.d.ts` | Generated | Regenerated by Vite `editorTypesPlugin`; never hand-edited. |
