# US-1338 — `pages.openUrlInBrowserTab` as `open_url`'s replacement, and `pages.openUrl`

Status: Planned. Investigation complete; implementation has not started.

Epic: [EPIC-089](../../epics/EPIC-089.md)

No dashboard edit, implementation, test harness, QA-file change, guide change, or commit is part
of this task-document pass. The dashboard is maintained by the user.

## Goal

Make `pages.openUrlInBrowserTab(url, options)` the callable replacement for the browser-only
`open_url` tool, preserving its profile, incognito, agent-provenance, focus, and page-id behavior.
Add the separate `pages.openUrl(url, options)` member as a content-delivery-pipeline entry point
for file-like URLs; it replaces no tool and must not claim a page id that the pipeline cannot
reliably provide.

## Background

### Binding design

EPIC-089 decision 6 and the roadmap's [*The `open_url` correction*](../../agent-transparency-roadmap.md#the-open_url-correction)
settle the central naming question:

- A plain web page that must open in Persephone's browser belongs on
  `pages.openUrlInBrowserTab(url, options)`. This is the only member that retires `open_url`.
- A URL or path naming content belongs on `pages.openUrl(url, options)`, which delegates to
  `app.openRawLink(href, { editor })` and lets the content pipeline choose the editor. This is an
  addition, not a rename of the browser-tab member and not a replacement for any tool.

The two members must remain visibly cross-referenced in their $help/member summaries. An agent
should not have to infer whether `openUrl` means “browser” from the method name.

### (A) Existing `open_url` path and the exact member mapping

The main-process declaration is `src/main/mcp/tools/page-tools.ts:95-101`. It declares:

    open_url(url, profileName?, incognito?, windowIndex?)

`windowIndex` is a main-process routing argument. `src/main/mcp/register-tools.ts` strips it before
forwarding the remaining arguments to the renderer; through `call`, the equivalent is
`windows[i].<path>`. It is not a missing `pages` member argument.

The renderer handler is `handleOpenUrl` in
`src/renderer/api/mcp/page-commands.ts:192-202`:

    const url = asString(params?.url);
    if (!url) return { error: { code: -32602, message: "Missing or invalid 'url' parameter" } };
    const pageId = await pagesModel.openUrlInBrowserTab(url, {
        profileName: asString(params?.profileName),
        incognito: asBoolean(params?.incognito),
        openedByAgent: true,
    });
    const page = pageId ? pagesModel.findPage(pageId) : undefined;
    return { result: { opened: url, pageId, title: page?.title } };

The existing `PageCollectionWrapper.openUrlInBrowserTab` at
`src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:251-260` already delegates to the
same `PagesModel` method and forwards `openedByAgent` from the wrapper context:

    openUrlInBrowserTab(url, options): Promise<string | undefined> {
        return this.pages.openUrlInBrowserTab(url, {
            ...options,
            openedByAgent: this.openedByAgent,
        });
    }

The member-by-member parity is:

| `open_url` behavior | Verified source path | Member decision |
| --- | --- | --- |
| `url` | `handleOpenUrl` passes the string to `pagesModel.openUrlInBrowserTab`; `browser-pages.ts:107-199` sends it to `BrowserEditor.navigate` or `addTab` | Keep the same required `url` input, with runtime validation before opening |
| `profileName` | `browser-pages.ts:133-141,164-178` matches the requested normal browser profile and uses `browser-default-profile` when creating a new page | Keep `profileName`; omit it when absent |
| `incognito` | `browser-pages.ts:125-129,164-169` selects incognito pages and otherwise creates an incognito page | Keep `incognito`; omit it when absent |
| `openedByAgent: true` | `handleOpenUrl` sets it; `PageCollectionWrapper` receives `openedByAgent: true` in MCP `ScriptContext` (`ScriptContext.ts:71-76`); `browser-pages.ts:128` uses it for incognito reuse; `agent-access.ts:18-24` uses it for privacy | Preserve it as an internal provenance option. It is never an agent-supplied public option |
| Focus/reuse | `addTabToPage()` calls `model.navigation.showPage(page.id)`; a new page is appended by `addPage()` and becomes the ordered active page | Preserve the existing reuse/focus behavior |
| Returned page id | `browser-pages.ts:156` and `:199` return `page.id`; `PagesLifecycleModel` and `PagesModel` preserve `Promise<string | undefined>` | Preserve the scalar page-id return |
| `title` in the tool answer | The handler looks up `page.title` immediately after opening; `PageModel.title` delegates to the browser editor title, which starts as `Browser`/`Browser (agent)` and can update later from the loaded document | Do not add a misleading title field to the member return; the caller can read `pages[pageId].title` after the readiness wait |

The public member currently returns `Promise<string | undefined>`: the id of the Persephone page
containing the browser editor, or `undefined` if the underlying opener did not produce a page. It
does not currently return `{ opened, pageId, title }`. That scalar is sufficient for retirement:
`opened` merely echoes the caller's URL, while `pageId` is the non-derivable value needed to target
the browser page on the next call. `title` is not a stable equivalent at this point because the
browser navigation has not necessarily loaded and the immediate page title can still be the
generic browser title. After the required wait, `pages[pageId].title` is the live value. Widening
the existing public return from a string to an object would also break scripts that already store
the returned id and pass it to `pages[pageId]` or another page-targeting path.

This is therefore a capability-equivalent replacement, with the page id retained as the contract
that matters to an agent. The tool itself remains present and unchanged in this task; EPIC-089's
retirement marking remains an acceptance task after live `call` verification.

The existing member also exposes `external?: boolean`, which is not an `open_url` argument. It is
an older script-surface option for choosing the normal internal browser-page reuse policy; it is
not a missing counterpart, and it remains available for existing script callers. The tool's
caller-visible options are fully covered by `url`, `profileName`, and `incognito` once
`windowIndex` is handled by the main-process/window path.

### Recorded retirement-shape deviations

The replacement is capability-equivalent, but its return shape is intentionally not identical to
the tool's response. Record both deviations explicitly:

1. `open_url` includes `opened`; `pages.openUrlInBrowserTab` does not. The tool value merely echoes
   the caller's own `url`, so omitting it does not remove targeting information.
2. `open_url` includes `title`; `pages.openUrlInBrowserTab` does not. The title is unstable before
   navigation completes, as the verified load race demonstrates; after the readiness wait the
   caller can read `pages[pageId].title`.

The member therefore returns the existing scalar page id (or `undefined`), rather than the tool's
`{ opened, pageId, title }` envelope. US-1340 must carry these two deviations into the roadmap's
retirement marking and must not imply that the replacement has an identical return shape. No
`open_url` argument other than `windowIndex` lacks a counterpart: `url`, `profileName`, and
`incognito` are all covered; `windowIndex` is answered by the window-targeting path.

### The load race is part of the member contract

US-1335 verified live that `openUrlInBrowserTab` returns its page id before the browser document
has loaded. Typing immediately after the call reported success but left the field empty because
the action landed on a document that was then replaced. `type()` and `click()` do throw
`Element not found` for a genuinely missing element, so this is a navigation/load race rather than
a silent-accept defect; it is still a silent success from the agent's point of view.

The current `BrowserEditorFacade` in
`src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:57,382-400` exposes the exact readiness
members to name in help:

- `pages[pageId].editor.waitForNavigation()` waits for `document.readyState === "complete"`.
- `pages[pageId].editor.waitFor({ selector: "..." })` waits for a page element and is the better
  readiness check for SPA/content-specific navigation.

`waitForSelector` also exists, but the requested $help wording will use the verified composite
`waitFor({ selector })` form. The browser-tab member's summary/help must say that its returned page
is not necessarily loaded and that one of those waits comes before `type()`, `click()`, or any
other page-content action.

### (B) The pipeline-routed `pages.openUrl` addition

`src/renderer/api/app.ts:113-117` is the existing Layer-1 entry point:

    openRawLink = async (href: string, options?: { editor?: string }): Promise<void> => {
        await this._events.openRawLink.sendAsync(
            createLinkData(href, { sourceId: "app-api", target: options?.editor }),
        );
    };

The three layers were traced from the live source:

1. **Layer 1 — parsers (`src/renderer/content/parsers.ts`).** The raw href is recognized as an
   HTTP(S) URL, file path/file URL, archive path, `data:` URL, or one of the registered in-app
   schemes. The parser sets `data.url` and forwards the same mutable `ILinkData` to `openLink`.
2. **Layer 2 — resolvers (`src/renderer/content/resolvers.ts:75,79,84` and the HTTP/file
   resolvers).** Local files and archive entries receive a pipe and an editor target from the
   editor registry. HTTP URLs with recognized content extensions can become image, Markdown,
   text, media, or another registered editor. Unrecognized web content falls through to
   `openLinkInBrowser`, which calls `openUrlInBrowserTab`; explicit `target: "browser"`/browser
   modes do the same. An `editor` option becomes `data.target`, so an explicit editor forces the
   content path where that editor accepts the source.
3. **Layer 3 — open handler (`src/renderer/content/open-handler.ts:16-70`).** It reconstructs a
   file/archive path from `data.pipe`, calls `pagesModel.lifecycle.navigatePageTo(...)` when the
   input contains a target `data.pageId`, or calls `pagesModel.lifecycle.openFile(...)` for a new
   or deduplicated page.

`pages.openUrl(url, options)` must call `app.openRawLink(href, { editor: options?.editor })` and
must not call `openUrlInBrowserTab` directly. A URL naming an image, Markdown document, archive
entry, or other recognized file-like content therefore lands in the editor selected by the
pipeline. A plain web page should use `openUrlInBrowserTab`; `openUrl` may still reach a browser
fallback for a URL the pipeline does not classify as content, but it remains the pipeline-routed
choice rather than a promise of browser-tab behavior.

#### Returnability investigation and decision

The pipeline cannot currently report which page it opened:

- `app.openRawLink` is explicitly `Promise<void>`.
- `EventChannel.sendAsync()` returns only `Promise<boolean>` (`src/renderer/api/events/EventChannel.ts:67-74`),
  not a handler result.
- `ILinkData` has an input `pageId` field but no output/created-page-id field
  (`src/renderer/api/types/io.link-data.d.ts:52-88`).
- `open-handler.ts` stores `const pageId = data.pageId`, awaits the lifecycle operation, and
  discards the `PageModel` returned by `openFile`; it never writes a created or navigated id back
  to `data`.
- The browser resolver also awaits `openUrlInBrowserTab` but discards its returned id.
- The active page after `sendAsync` is not a guarantee: a new page is appended to `ordered`, an
  existing file may be deduplicated and focused, and another user/agent action can switch pages
  before the caller observes the result. Inferring “the active page” would be a race, not a
  return contract.

Decision: `pages.openUrl` returns `Promise<void>` and does not guess or synthesize a page id. Its
$help must say that it cannot name the page and instruct the agent to inspect `pages` afterward.
This satisfies EPIC-089 abort criterion 5 because the member does route through the pipeline. No
pipeline output field, event-channel return protocol, or active-page inference is added in this
task. `open_url` retirement rests entirely on (A), as the epic requires.

The optional `editor` is included. `app.openRawLink` already accepts `{ editor?: string }`, maps it
to `ILinkData.target`, and documents that the requested editor is used when it accepts the file,
with the normal editor fallback otherwise. Omitting this option would make the new pages-level
entry strictly less capable than the existing `app.openRawLink` API and would prevent a caller from
forcing, for example, `md-view` for a Markdown URL.

### Validation and absent-value rules

The two members have deliberately different input contracts. `handleOpenUrl` rejects a
missing/falsy value, while the browser opener itself forwards arbitrary strings to
`BrowserEditor.navigate`, whose descriptor summary says "Supports URLs and search queries".
`BrowserView` also exposes the URL-bar search-engine menu and uses an "Enter URL or search term..."
placeholder. `app.openRawLink` can resolve an unsupported raw href without creating a page, so the
pipeline member needs stricter validation before side effects:

- `pages.openUrlInBrowserTab` must reject only a non-string value or a string whose `trim()` is
  empty, with an actionable error naming the member. Every other string, including search text,
  bare domains, paths, and URL forms accepted by the built-in browser, must be forwarded unchanged
  to the browser opener. This permissiveness is deliberate: it matches `open_url`'s current
  `BrowserEditor.navigate` path and preserves "open a browser tab and search for X". Do not add
  URL-shape validation that would silently remove search support.
- `pages.openUrl` must reject a non-string value, empty/whitespace-only input, malformed URL-shaped
  input, and unsupported or unrecognized schemes before calling `app.openRawLink`. Preserve the
  existing valid Windows/UNC file-path forms and registered pipeline URL schemes. Its stricter
  rule is necessary because a pipeline parser miss has no content destination; it is not the
  browser member's contract.
- Each member's `$help` must state its own validation rule as well as the one-line choice between
  the members: `openUrlInBrowserTab` for a plain web page or search query, and `openUrl` for a URL
  naming a file/content source.
- Validate the optional `editor` when supplied as a string option; do not silently turn an invalid
  options object into a browser open. Existing editor-registry fallback behavior remains in force
  for a valid editor name that does not accept a particular source.
- Forward only present option keys. Absent values are omitted, never assigned `undefined` or
  `null`; `openedByAgent: true` is added only for an MCP-originated wrapper context.
- `openUrlInBrowserTab` has a scalar id/`undefined` result, not an object with absent keys.
  `pages.openUrl` has no result object. If a future result object is introduced, conditional
  properties must be used so an unavailable title/page id is omitted before the `$call` shaping
  boundary, in accordance with EPIC-089 decision 10.

## Implementation Plan

### 1. Extend the canonical pages API contract

Change `src/renderer/api/types/pages.d.ts`:

- Keep `openUrlInBrowserTab(url, options)` as `Promise<string | undefined>` and document that it
  returns the Persephone page id before the web document is necessarily loaded.
- Add `openUrl(url: string, options?: { editor?: string }): Promise<void>` with JSDoc explaining
  that it enters the content pipeline, may choose an editor or browser fallback, and cannot report
  the opened page id.
- State the selection rule directly in both method comments: use `openUrlInBrowserTab` for a plain
  web page; use `openUrl` when the URL names a file/content source.

Before:

    openUrlInBrowserTab(url: string, options?: {
        incognito?: boolean;
        profileName?: string;
        external?: boolean;
    }): Promise<string | undefined>;

After:

    openUrlInBrowserTab(url: string, options?: {
        incognito?: boolean;
        profileName?: string;
        external?: boolean;
    }): Promise<string | undefined>;

    openUrl(url: string, options?: { editor?: string }): Promise<void>;

The generated `assets/editor-types/pages.d.ts` is refreshed by `editorTypesPlugin()`; it is not
hand-edited.

### 2. Update the `pages` descriptor and wrapper

Change `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts`:

- Add `openUrl` to `PAGES_MEMBERS` with a `caution` because it writes by opening/reusing or
  navigating a page/editor. Its one-line summary must say: use it for a URL naming a file; use
  `pages.openUrlInBrowserTab(...)` for a plain web page or search query; only non-empty, supported
  pipeline hrefs are accepted; it cannot return a page id and the caller must inspect `pages`
  afterward.
- Update `openUrlInBrowserTab`'s member summary with a `caution`, the inverse cross-reference
  (`pages.openUrl` for file-like URLs), the scalar page-id return, the deliberate support for URLs
  and search queries with only empty/whitespace input rejected, and the required readiness sequence
  using exactly `pages[pageId].editor.waitForNavigation()` or
  `pages[pageId].editor.waitFor({ selector })`.
- Expand `PAGES_HELP` with the same two-choice rule and the warning that the browser page id is
  returned before the document necessarily loads. Keep the “plain strings/paths” page-object
  guidance separate from these two openers.
- Add the wrapper method that validates the href, then awaits `app.openRawLink(href, { editor })`.
  Use the existing `app.openRawLink` implementation and its `editor` option; do not send a direct
  `openContent` event or call the browser opener from this member.
- Keep `openUrlInBrowserTab` returning the existing id. Validate before calling the model and build
   its internal options with conditional properties, while preserving the wrapper's
   `openedByAgent` provenance for MCP contexts.
- Apply `validateBrowserOpenInput` before the existing browser wrapper delegates. It must preserve
  the input string, including search text, rather than normalizing it into a URL.

Before:

    { name: "openUrlInBrowserTab", kind: "method",
      signature: "openUrlInBrowserTab(url, options?: { incognito?, profileName?, external? })",
      summary: "... returns the tab id." }

    openUrlInBrowserTab(url, options): Promise<string | undefined> {
        return this.pages.openUrlInBrowserTab(url, {
            ...options,
            openedByAgent: this.openedByAgent,
        });
    }

After:

    { name: "openUrlInBrowserTab", kind: "method",
      signature: "openUrlInBrowserTab(url, options?: { incognito?, profileName?, external? })",
       summary: "Open a plain web page or search query in/reusing a browser tab; pages.openUrl(...) is for file-like URLs. Requires a non-empty string and does not reject search text. Returns the page id before loading finishes; await pages[pageId].editor.waitForNavigation() or waitFor({ selector }) before page actions.",
      caution: "opens or navigates a browser page" }
    { name: "openUrl", kind: "method",
      signature: "openUrl(url, options?: { editor? })",
       summary: "Route a supported URL naming a file through the content pipeline; pages.openUrlInBrowserTab(...) is for a plain web page or search query. Empty, malformed, and unsupported hrefs are rejected. Cannot name the opened page; inspect pages afterward.",
      caution: "opens or navigates a page using the content pipeline" }

    async openUrl(url: string, options?: { editor?: string }): Promise<void> {
        const href = validatePipelineOpenInput(url, "pages.openUrl");
        const { app } = await import("../../api/app");
        await app.openRawLink(href, options?.editor !== undefined
            ? { editor: options.editor }
            : undefined);
    }

Use the named `validateBrowserOpenInput` and `validatePipelineOpenInput` helpers from
`src/renderer/api/pages/open-url-validation.ts` for the two public members respectively. The
browser validator checks only the non-empty string rule and returns the original string; the
pipeline validator enforces the supported URL/path forms and returns the pipeline href. Their
accepted forms and actionable errors in the Validation section are binding. Do not use a guessed
active page as the return value.

### 3. Preserve the browser-tab provenance and page-id path

The implementation must retain the existing chain:

    MCP call / execute_script context
      → ScriptContext(consoleLogs) marks MCP provenance
      → AppWrapper(openedByAgent = true)
      → PageCollectionWrapper
      → PagesModel.openUrlInBrowserTab(..., openedByAgent: true)
      → browser-pages.ts
      → BrowserEditor state.openedByAgent = true for a new private page

Verify each option at implementation time against the source:

- A requested `profileName` is used for matching and for a newly created normal page; an absent
  value keeps the current default/reuse semantics.
- `incognito: true` never reuses a user-opened private page when the caller is agent-originated;
  `browser-pages.ts:128` permits reuse only when the page is also `openedByAgent`.
- `agent-access.ts:18-24` therefore permits the agent's own incognito/Tor page and refuses the
  user's private page. The new wrapper does not invent a second privacy rule.
- The returned id is the `PageModel.id` from the exact existing opener, whether it reused an
  existing browser page or created one. No title lookup is added to the member because it would
  reproduce the tool's immediate, load-racy generic title rather than improve the replacement.

Do not modify `src/main/mcp/tools/page-tools.ts` or delete `handleOpenUrl`. The tool continues to
call the shared model path until EPIC-089's acceptance task marks it retirable.

### 4. Add distinct validation without creating a blank tab

Add the pure validation utilities at
`src/renderer/api/pages/open-url-validation.ts`:

1. `validateBrowserOpenInput` must accept only a string at runtime, check
   `value.trim().length`, reject empty/whitespace-only input with an actionable error naming
   `pages.openUrlInBrowserTab`, and return the original string unchanged. It must not apply URL
   parsing or reject search text.
2. `validatePipelineOpenInput` must accept only a string at runtime, trim it, reject
   empty/whitespace-only input, validate URL-shaped values, reject malformed values and unsupported
   schemes with an error naming the accepted URL/path forms, and preserve valid HTTP(S),
   `file:`/Windows/UNC paths, and the registered pipeline schemes needed by the existing parser
   set. A bare search phrase is intentionally not a valid pipeline argument.
3. `pages.openUrlInBrowserTab` must use the browser validator before
   `pagesModel.openUrlInBrowserTab`; `pages.openUrl` must use the pipeline validator before
   `app.openRawLink`. The distinct validators and the distinct `$help` rules must remain visible
   so a later hardening pass does not remove browser search support.

Neither validator may turn malformed input into `about:blank`, and each error must be observable
through `call`/script rejection. Do not broaden this task into a change to the `open_url` schema or
its tool registration.

### 5. Keep the pipeline addition honest about returnability

Implement `pages.openUrl` as the thin `app.openRawLink` wrapper only. Do not change:

- `src/renderer/api/app.ts`'s `Promise<void>` signature;
- `src/renderer/api/events/EventChannel.ts`'s `Promise<boolean>` pipeline result;
- `src/shared/link-data.ts` or `src/renderer/api/types/io.link-data.d.ts` to invent an output id;
- `src/renderer/content/parsers.ts`, `src/renderer/content/resolvers.ts`, or
  `src/renderer/content/open-handler.ts` to infer the active page.

The `editor` option is forwarded as the existing `target` metadata. It must be omitted when not
provided, never passed as `undefined` in an object. A valid URL with no recognized content extension
may still be routed to a browser by Layer 2; that is pipeline behavior and does not turn
`pages.openUrl` into the `open_url` replacement.

### 6. Regenerate and manually verify the callable surface

After implementation, regenerate the canonical `assets/editor-types/pages.d.ts` copy through the
normal renderer build process; never hand-edit generated declarations. No unit tests or test
harnesses are to be added.

Use existing `call`/script surfaces for focused verification:

- Open a normal web page through `pages.openUrlInBrowserTab`, confirm the return is a page id, and
  immediately call `pages[pageId].editor.waitForNavigation()` or
  `pages[pageId].editor.waitFor({ selector })` before typing/clicking. Confirm the pre-wait race is
  explained by help and the post-wait action reaches the loaded document.
- Open/reuse profile-matched and agent-owned incognito pages. Confirm a user-opened private page is
  not reused and that the agent-owned private page remains readable through the existing privacy
  guard.
- Pass an empty, whitespace-only, malformed, and unsupported URL to each new member; each must
  reject with an actionable message and must not add a blank browser page.
- Open an image URL, Markdown URL, and archive/file path through `pages.openUrl`; verify the
  pipeline-selected editor, then repeat one with `{ editor: "md-view" }` or another valid explicit
  editor. Record that the resolved call has no page-id result and that the caller must inspect
  `pages` afterward.
- Verify $help for both members names the other in the one-line choice rule and includes the
  write `caution`.

US-1340 owns the broader live acceptance and retirement marking. This task does not add its QA
scenario, delete `open_url`, or touch any browser/board/window automation surface.

## Concerns / Open questions

All design questions are resolved; none are left as TBD.

1. **Return shape compatibility.** Keep `openUrlInBrowserTab`'s `string | undefined` return. The
   page id is the essential replacement output, and widening an existing script API to the tool's
   `{ opened, pageId, title }` object would break current id consumers. The tool's echoed URL and
   immediate title do not add reliable targeting information.
2. **Readiness after opening.** The returned page identity and document readiness are separate. The
   member help must make `waitForNavigation()`/`waitFor({ selector })` a first-class next step.
3. **Pipeline identity.** No page id is returned by `pages.openUrl`; `openRawLink`/`sendAsync` and
   Layer 3 currently discard lifecycle return values, and active-page inference is a race. The
   member still ships because routing through the pipeline is independently valuable; only (A)
   retires `open_url`.
4. **Editor selection.** Include `editor?: string` because it is already the supported
   `app.openRawLink` override and is the mechanism for forcing a specific editor. It does not make
   the pipeline opener browser-only.
5. **Privacy.** The browser-tab path preserves `openedByAgent`; the pipeline wrapper exposes no
   incognito/private option and does not bypass `agent-access.ts`. No new page-level privacy gate
   is needed for the pages collection member.
6. **Absent values.** Neither selected member returns an object with optional fields. The id member
   returns an id or `undefined`; the pipeline member returns `void`. Any future object mapping must
   omit unavailable keys rather than assigning `undefined`/`null`.
7. **Scope.** The setting, guides, QA files, browser/board/window automation surfaces, and tool
   implementations remain outside this task. The existing tool is answered, not deleted.

## Acceptance Criteria

- [ ] `pages.openUrlInBrowserTab(url, options)` is documented and exposed as the sole capability
      replacement for `open_url`; `pages.openUrl(url, options)` is explicitly documented as an
      addition that replaces no tool.
- [ ] `url`, `profileName`, and `incognito` have verified counterparts. `windowIndex` is documented
      as main-process routing / `windows[i].<path>`, not a missing member option. `openedByAgent` is
      preserved internally and cannot be supplied as a public agent option.
- [ ] The browser-tab member continues to return the `PageModel.id` scalar (or `undefined`) and
      does not widen the existing script return shape. The document/help explains why this is
      sufficient for retirement and how to read the live title afterward.
- [ ] The two deliberate return-shape deviations are recorded: the member omits the tool's
      `opened` echo and unstable immediate `title`, returns the scalar page id instead of the
      `{ opened, pageId, title }` envelope, and US-1340 carries that fact into retirement marking.
- [ ] No `open_url` argument other than `windowIndex` lacks a member counterpart; `url`,
      `profileName`, and `incognito` are all covered.
- [ ] Browser-tab $help says the returned page may not be loaded and names exactly
      `pages[pageId].editor.waitForNavigation()` and `pages[pageId].editor.waitFor({ selector })`
      before page-content actions.
- [ ] Both member descriptors carry a write `caution`, and each member's one-line help names the
      other: `openUrlInBrowserTab` for a plain web page, `openUrl` for a URL naming a file/content
      source.
- [ ] `pages.openUrl` delegates to `app.openRawLink(href, { editor })`, includes the optional
      `editor` override, and preserves the three-layer parser/resolver/open-handler routing for
      image, Markdown, archive, and other file-like sources.
- [ ] The returnability investigation is reflected in code/help: `pages.openUrl` cannot name the
      opened page, does not infer the active page, and tells the caller to inspect `pages` after
      the await. No guessed page id is shipped.
- [ ] `pages.openUrlInBrowserTab` rejects only empty/whitespace-only or non-string input, forwards
      every other string unchanged (including search text), and preserves the browser behavior of
      `open_url`; no empty input silently creates `about:blank`.
- [ ] `pages.openUrl` separately rejects empty/whitespace-only, malformed, unsupported, or
      non-string pipeline hrefs with actionable messages before opening; no invalid input silently
      becomes a blank/no-op pipeline request.
- [ ] Forwarded options and all result objects obey the absent-value audit: absent keys are omitted,
      never assigned `undefined` or `null`. The selected scalar/void return contracts contain no
      optional object fields.
- [ ] The `openUrlInBrowserTab` path continues to set the agent provenance flag in MCP-originated
      contexts, preserving `agent-access.ts` privacy behavior and incognito reuse semantics.
- [ ] Canonical declarations are changed only under `src/renderer/api/types/`; generated
      `assets/editor-types/pages.d.ts` is regenerated, not hand-edited.
- [ ] No unit tests or harnesses, tool deletion/change, `mcp.browser-tools.enabled` change, guide
      or `qa/` change, browser/board/window automation change, dashboard edit, or commit is included
      in this task.

## Files Changed Summary

| File | Planned action | Reason |
| --- | --- | --- |
| `doc/tasks/US-1338-page-open-url/README.md` | **Add** | This investigated task document and implementation contract |
| `src/renderer/api/types/pages.d.ts` | **Change** | Document the two distinct methods and add the `pages.openUrl` public type |
| `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` | **Change** | Add the pipeline wrapper; update descriptors, cross-references, cautions, validation, and load-race help |
| `src/renderer/api/pages/open-url-validation.ts` | **Add** | Pure runtime validators with deliberately distinct browser and pipeline input contracts |
| `assets/editor-types/pages.d.ts` | **Regenerate** | Build-generated copy of the canonical pages declaration; never hand-edit |

## Files that need NO changes

| File or area | Verified reason |
| --- | --- |
| `src/main/mcp/tools/page-tools.ts` | The `open_url` declaration remains until EPIC-089 acceptance; its arguments were audited, not changed here |
| `src/renderer/api/mcp/page-commands.ts` | `handleOpenUrl` already calls the shared browser opener with `profileName`, `incognito`, and `openedByAgent: true`; the task does not delete or rewrite the tool |
| `src/renderer/api/app.ts` | `app.openRawLink(href, { editor })` already has the exact pipeline entry point and `Promise<void>` contract required by the addition |
| `src/renderer/api/events/EventChannel.ts` | `sendAsync()` already provides the verified pipeline completion semantics; its boolean result is not a page id |
| `src/shared/link-data.ts` | `createLinkData` and `cleanForStorage` already support the existing event flow; no output-id field is justified |
| `src/renderer/api/types/io.link-data.d.ts` | `pageId` is an input target only; adding a guessed output field would misrepresent the pipeline |
| `src/renderer/content/parsers.ts` | Layer 1 already recognizes and forwards the supported raw link forms |
| `src/renderer/content/resolvers.ts` | Layer 2 already routes recognized content to editors and web fallbacks to `openUrlInBrowserTab`; it discards the browser id by current design |
| `src/renderer/content/open-handler.ts` | Layer 3 already creates/navigates pages correctly but discards lifecycle return values; no reliable result channel exists to expose here |
| `src/renderer/api/pages/PagesModel.ts` | The existing browser opener delegate and page-id return are already sufficient; `pages.openUrl` is a scripting wrapper over `app.openRawLink`, not a new model lifecycle |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | It already lazily delegates `openUrlInBrowserTab` and returns the browser page id; no pipeline-id inference is added |
| `src/renderer/editors/browser/browser-pages.ts` | Its profile matching, incognito reuse, agent provenance, focus, and id returns are the behavior being preserved |
| `src/renderer/editors/browser/agent-access.ts` | Existing privacy predicate and refusal text are the authority for private browser pages |
| `src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts` | Existing `waitForNavigation()` and `waitFor({ selector })` names are verified and only need to be referenced by pages help |
| `src/renderer/scripting/ScriptContext.ts` and `src/renderer/scripting/api-wrapper/AppWrapper.ts` | Existing MCP provenance construction already supplies `openedByAgent` to `PageCollectionWrapper` |
| `src/main/mcp/register-tools.ts` and `src/main/mcp/tools/call-tools.ts` | Existing `windowIndex` stripping and `windows[i].` forwarding already answer multi-window targeting |
| `assets/editor-types/*.d.ts` other than generated `pages.d.ts` | No other public declaration changes are required; generated files are never hand-edited |
| `src/main/mcp/tools/*` | Tool implementations are explicitly out of scope; `open_url` is answered, not deleted |
| `mcp.browser-tools.enabled`, guides, `qa/`, browser/board/window automation surfaces | Explicitly out of scope for US-1338 and owned by US-1339, US-1340, or already-landed epic tasks |
| `doc/active-work.md` and `doc/epics/EPIC-089.md` | The user owns the dashboard and the epic already links US-1338 as Planned |


## Live verification (2026-09-06)

| Check | Result |
|---|---|
| `pages.openUrlInBrowserTab("   ")` | throws *"pages.openUrlInBrowserTab requires a non-empty string URL or search query."* — and nothing else is rejected, so search text still reaches the browser as it does through `open_url` |
| `pages.openUrl("")` | throws, naming the accepted forms: HTTP(S) URL, `file://` URL, Windows/UNC path, or a registered Persephone link scheme |
| `pages.openUrl("not a url at all !!")` | throws the malformed/unsupported message rather than opening a blank page |
| `pages.openUrl("file:///C:/projects/persephone/README.md")` | opened a new page titled `README.md` with editor **`md-view`** |

The last row is the whole point of deliverable (B): the same URL through `open_url` — or through
`openUrlInBrowserTab` — lands in a browser tab, because that handler has no content branch at all.
Routing it through `app.openRawLink` lets the content pipeline choose the editor, which is the
capability the roadmap wanted under this name and which did not exist before.

No page id is returned, as decided: the check above discovered the opened page by diffing `pages`
before and after, which is exactly what the member's `$help` tells an agent to do.
