# US-558: Browser editor migration (EPIC-028 Phase C)

> **Status:** Investigation complete 2026-05-25, **ready for implementation**.
> **Walkthrough:** [`doc/epics/EPIC-028-editor-architecture/walkthroughs/30-no-host-group.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/30-no-host-group.md) §Section 1 — Browser (NH1–NH10 RESOLVED in design 2026-05-20).
> **Risk profile:** Distinct from all prior Tier-5 migrations — **first NO-HOST editor** (no `CONTENT_HOST_TRAIT`, no `TextFileModel` host adoption) AND **first editor that embeds another v4 EditorModel** (the bookmarks-drawer LinkEditor). Two architecturally novel pieces in one task. The bookmarks embedding is what the walkthrough called "the second consumer of `EditorConstructorArgs.initialHost` after NB7" — but NB7 was DEFERRED to US-579 under outer-only scope, so US-558 is actually the **first** embedded-editor consumer.

---

## Goal

Migrate `BrowserEditorModel` from the legacy `EditorModel<S, R>` two-generic shape to the v4 `EditorModel<S, R, E>` three-generic shape as a NO-HOST editor (no `CONTENT_HOST_TRAIT`). Retire `BrowserBookmarks`'s use of `TextFileModel.acquireViewModel("link-view")` — the **final external consumer** of the legacy ref-counted view-model machinery — by replacing it with a directly-embedded v4 `LinkEditor` instance. Retire today's portal-ref props (`toolbarRefFirst/Last`, `footerRefLast`, `swapLayout`) on the embedded `<LinkEditor>` invocations in `BookmarksDrawer.tsx` and `BlankPageLinks` (inside `BrowserEditorView.tsx`) by rendering `<LinkBody>` directly. Promote `bookmarksWidth` to persisted state (incidental fix — **sixth instance** of the `leftPanelWidth`-equivalent pattern after LK2 / TD2 / RC2 / NB2 / MK).

**Outer-only scope.** The inner per-note Notebook dispatch deferred to US-579 is unrelated; US-558 is structurally self-contained.

---

## Background

### Today's surface — `src/renderer/editors/browser/` (15 files)

| Group | Files | LOC |
|-------|-------|-----|
| Core model | `BrowserEditorModel.ts` (1090) |
| Sub-models | `BrowserWebviewModel.ts` (617), `BrowserUrlBarModel.ts` (262), `BrowserBookmarksUIModel.ts` (370), `BrowserTargetModel.ts` (92) |
| Bookmarks | `BrowserBookmarks.ts` (82), `BookmarksDrawer.tsx` (155) |
| Aux state | `browser-search-history.ts`, `network-log-links.ts` |
| View | `BrowserEditorView.tsx` (750), `BrowserTabsPanel.tsx` (477), `BrowserDownloadsPopup.tsx`, `DownloadButton.tsx`, `TorStatusOverlay.tsx`, `UrlSuggestionsDropdown.tsx` |

### Today's class shape

```typescript
class BrowserEditorModel extends EditorModel<BrowserEditorState, void> {  // two generics (legacy)
    noLanguage = true;
    skipSave = true;
    readonly webview: BrowserWebviewModel;
    readonly urlBar: BrowserUrlBarModel;
    readonly bookmarksUI: BrowserBookmarksUIModel;
    readonly target: BrowserTargetModel;
    bookmarks: BrowserBookmarks | null = null;
    // ~30 navigation / tab / Tor / mute / find-bar methods
}
```

### Today's state shape (32 fields)

10 persisted (return from `getRestoreData()`): `url`, `pageTitle`, `tabs`, `activeTabId`, `tabsPanelWidth`, `profileName`, `isIncognito`, `isTor`, `searchEngineId`, `lastSearchQuery`.

4 derived-from-active-tab: `loading`, `canGoBack`, `canGoForward`, `favicon`.

3 Tor runtime (reset on restore): `torStatus`, `torLog`, `torOverlayVisible`.

15 transient (sub-model managed): `urlInput`, `suggestionsOpen`, `userHasTyped`, `hoveredIndex`, `searchEntries`, `popupOpen`, `blockedPopupCount`, `bookmarksOpen`, `bookmarksWidth`, `isBookmarked`, `bookmarksReady`, `pageMuted`, `_anyTabAudible`, `findBarVisible`, `findText`, `findActiveMatch`, `findTotalMatches`.

### Today's bookmarks embedding — `BrowserBookmarks.ts`

```typescript
class BrowserBookmarks {
    textModel: TextFileModel;
    linkModel!: LinkViewModel;  // acquired via ref-counting

    async init(options?: { silent?: boolean }): Promise<boolean> {
        await this.textModel.restore();
        if (shell.encryption.isEncrypted(this.textModel.state.get().content)) {
            if (options?.silent) return false;
            const password = await ui.password({ mode: "decrypt" });
            if (!password) return false;
            if (!await this.textModel.decrypt(password)) return false;
        }
        this.linkModel = await this.textModel.acquireViewModel("link-view") as LinkViewModel;
        this.textModel.state.subscribe(() => { if (modified) this.saveDebounced(); });
        return true;
    }

    async dispose(): Promise<void> {
        this.textModel.releaseViewModel("link-view");
        await this.textModel.dispose();
    }
}
```

### Today's drawer + blank-page embeddings

Both embed `<LinkEditor model={bookmarks.textModel} swapLayout? toolbarRefFirst toolbarRefLast footerRefLast />` (the legacy LinkEditor view in `LinkView.tsx`) which internally calls `useContentViewModel<LinkViewModel>(model, "link-view")` to retrieve the same shared `LinkViewModel`. The portal refs hide a layout coupling: LinkEditor renders its breadcrumb / add-button / search into the parent's toolbar slots.

### Today's registration (`register-editors.ts:681`)

```typescript
editorRegistry.register({
    id: "browser-view",
    name: "Browser",
    editorType: "browserPage",     // S10 retires this field
    category: "standalone",          // MI3 collapses this into !hasContentHost
    loadModule: async () => (await import("./browser/BrowserEditorView")).default,
});
```

No v4 mirror entry exists today — Browser is one of the standalone editors the bridge loop treats as "throwing stub" (register-editors.ts:772–774).

### Today's entry point — `PagesLifecycleModel.ts:1036`

```typescript
showBrowserPage = async (options?: {...}) => {
    const browserModule = await import("../../editors/browser/BrowserEditorView");
    const model = await browserModule.default.newEmptyEditorModel("browserPage");
    if (model) {
        if (options?.profileName || incognito || tor) { /* mutate state */ }
        if (options?.url) { /* mutate tab[0] */ }
        await model.restore();
        this.addPage(wrap(model));   // wraps in LegacyEditorAdapter
        if (options?.tor) (model as ...).initTorProxy();
    }
};
```

Plus consumers of `editor.type === "browserPage"` in `automation/commands.ts` (auto-find browser page for MCP) and `openUrlInBrowserTab` (PagesLifecycleModel.ts:1146 — cast through `LegacyEditorAdapter.legacy`).

### v4 patterns to mirror

- **Todo / Rest Client / Notebook** — non-sidebar-owning Tier-5 editors with `wrapLegacyForPage` branches. Not directly applicable (those are content-host editors); the construct-then-adoptHost pattern is reusable for the embedded LinkEditor.
- **LinkEditor v4** — already exists; standard pattern `new LinkEditor(state)` → `linkEditor.adoptHost(textFileHost)` → `linkEditor.loadData(content)`. We embed an instance directly.
- **Notebook NB7** — DEFERRED to US-579 — so the `EditorConstructorArgs.initialHost` primitive does NOT exist. US-558 uses construct-then-adoptHost (no new primitive).

---

## Concerns

### Concerns inherited from walkthrough (NH1–NH10 RESOLVED 2026-05-20)

| # | Topic | Resolution |
|---|-------|-----------|
| NH1 | Class topology | `BrowserEditorModel extends EditorModel<S, void, BrowserQueueEvent>`. Third generic adopted. Queue event: `{ type: "focus" }` only — matches Grid/Todo/RC/NB minimal-queue calibration. Keyboard shortcuts continue to route via `globalKeyDown` subscription (today's pattern). |
| NH2 | No CONTENT_HOST_TRAIT | Confirmed. Base class `contentHost` returns `null`; `findCompatibleEditors()` returns `[]`; switch widget hides per PT10. No marker needed. **First walked editor explicitly NOT a content-host owner.** |
| NH3 | State slice partitioning | Keep today's 10-persisted boundary. **AND** promote `bookmarksWidth` to persisted (silent today-bug — sixth instance of `leftPanelWidth`-equivalent incidental fix after LK2 / TD2 / RC2 / NB2 / MK). `pageMuted` stays transient (mute is a single-session gesture). |
| NH4 | `acquireViewModel("link-view")` retirement | Embedded LinkEditor via construct-then-adoptHost. The legacy `acquireViewModel` quartet retires from external consumers (NoteItemEditModel's separate copy stays per US-579 outer-only scope). |
| NH5 | Drawer + blank-page LinkEditor invocation | Render `<LinkBody model={bookmarks.linkEditor} />` directly. Drawer + BlankPageLinks own their own slim toolbars; reuse LinkEditor's toolbar bits (breadcrumb / add / view-mode / search) by exporting them from `link-editor/index.tsx` and composing inline. Portal-ref props + `swapLayout` flag retire. |
| NH6 | Sub-model preservation | All four (webview / urlBar / bookmarksUI / target) preserved verbatim. Sub-model boundary is orthogonal to EditorModel boundary. |
| NH7 | Bookmarks lazy + opt-in lifecycle | Preserved verbatim. Only the **interior** of `BrowserBookmarks.init()` (NH4) and the **interior** of the embedded view (NH5) change. Timer-based silent preload + on-demand re-init via `ensureBookmarks` stays. |
| NH8 | `restore` / `getRestoreData` / `applyRestoreData` shape | `getRestoreData()` wraps the 10-field partial state into a v4 `EditorDescriptor` `{ editorId, id, state, host: undefined }`. Internal field logic carries verbatim. The `currentUrls` merge stays. |
| NH9 | Tor reconnect + window-close cleanup | No EPIC-028 changes. The manual-reconnect overlay (`applyRestoreData → show-reconnect-overlay`) stays; `dispose → stop Tor` stays; `windowClosing → stop Tor` stays. |
| NH10 | Registry `accepts()` + standalone retirement | `accepts({ mode }) => -1`. Drops `editorType: "browserPage"` (S10). Drops `category: "standalone"` (MI3). Browser opens only via explicit user gesture (`showBrowserPage`). |

---

### BR-IMPL1 — File naming under preserved-legacy-view contract

**Resolution:** Rename `BrowserEditorView.tsx` → `BrowserView.tsx` via `git mv` (preserves history). Exported function name `BrowserEditorView` UNCHANGED. Frees the `BrowserEditor` name for the new v4 class file `BrowserEditor.ts`.

**Rationale:**

- Aligns with the preserved-sibling pattern (`LinkView.tsx`, `TodoView.tsx`, `RestClientView.tsx`, `NotebookView.tsx`, ...).
- The legacy `editorRegistry.register({ id:"browser-view", loadModule:… })` block keeps returning a legacy `EditorModule` (Editor + newEditorModel + newEmptyEditorModel + newEditorModelFromState) so the LegacyEditorAdapter safety-net path can still construct a Browser model from raw IEditorState (during the EPIC-028 strangler-fig window).
- Safer rollback if the v4 path needs a quick revert.
- Consistent code organization with the prior nine Tier-5 editors.

**Unlike** the other preserved-VM editors, Browser isn't embeddable inside a notebook. Preservation rationale is: rollback safety + pattern consistency + retirement-with-LegacyEditorAdapter in US-559.

**New files:**
- `BrowserEditor.ts` — v4 class (mostly relocates today's `BrowserEditorModel` body with the two→three generic widening + bookmark-handle refactor).
- `index.tsx` — v4 module wrapper exporting `browserModule: EditorModule`.

**Preserved files (byte-for-byte):**
- `BrowserView.tsx` — was BrowserEditorView.tsx; legacy module entry.
- `BrowserWebviewModel.ts`, `BrowserUrlBarModel.ts`, `BrowserBookmarksUIModel.ts`, `BrowserTargetModel.ts`, `BrowserTabsPanel.tsx`, `BrowserDownloadsPopup.tsx`, `DownloadButton.tsx`, `TorStatusOverlay.tsx`, `UrlSuggestionsDropdown.tsx`, `browser-search-history.ts`, `network-log-links.ts`.

### BR-IMPL2 — Embedded LinkEditor construction (replaces walkthrough §NH4's `EditorConstructorArgs.initialHost`)

**Walkthrough §NH4** said: `new LinkEditor({ initialHost: this.textFileHost })`. But the v4 `EditorModel` constructor signature is `constructor(modelState, defaultState?)` — there is no `initialHost` argument. The walkthrough referenced this as "the second consumer after NB7", but **NB7 was deferred to US-579**, so the primitive doesn't exist yet, and US-558 is the **first** would-be consumer.

**Resolution:** Use **construct-then-adoptHost** (matches the existing Tier-5 `wrapLegacyForPage` pattern from Todo / Rest Client / Notebook):

```typescript
// New BrowserBookmarks shape (replaces today's BrowserBookmarks class):
import { TComponentState } from "../../core/state/state";
import { LinkEditor, defaultLinkEditorState } from "../link-editor";
import { TextFileModel, getDefaultTextFileEditorModelState } from "../text/TextEditorModel";

export class BrowserBookmarks {
    readonly textFileHost: TextFileModel;
    readonly linkEditor: LinkEditor;
    private saveDebounced = debounce(() => this.textFileHost.saveFile(), 300);

    constructor(filePath: string) {
        const state = {
            ...getDefaultTextFileEditorModelState(),
            filePath,
            language: "json",
            editor: "link-view" as EditorView,
        };
        this.textFileHost = new TextFileModel(new TComponentState(state));
        this.textFileHost.skipSave = true;
        this.linkEditor = new LinkEditor(
            new TComponentState({ ...defaultLinkEditorState, id: crypto.randomUUID() }),
        );
    }

    async init(options?: { silent?: boolean }): Promise<boolean> {
        await this.textFileHost.restore();
        if (shell.encryption.isEncrypted(this.textFileHost.state.get().content || "")) {
            if (options?.silent) return false;
            const password = await ui.password({ mode: "decrypt" });
            if (!password) return false;
            if (!(await this.textFileHost.decrypt(password))) return false;
        }
        // Adopt the already-restored host; loadData parses the JSON inline.
        this.linkEditor.adoptHost(this.textFileHost);
        this.linkEditor.loadData(this.textFileHost.state.get().content ?? "");

        this.textFileHost.state.subscribe(() => {
            if (this.textFileHost.state.get().modified) this.saveDebounced();
        });
        return true;
    }

    async dispose(): Promise<void> {
        await this.linkEditor.dispose();
        // linkEditor.dispose() also disposes the host (LinkEditor owns it
        // after adoptHost). Avoid double-dispose.
    }

    findByUrl(url: string): LinkItem | undefined {
        return this.linkEditor.state.get().data.links.find((l) => l.href === url);
    }
}
```

Five reuses of EPIC-028 patterns: (a) Tier-5 `wrapLegacyForPage` construct-then-adoptHost; (b) LinkEditor's three-phase lifecycle (we skip `restore()` because the host is already restored — `adoptHost` does the host subscriptions + HS1 seed + initial title); (c) the embedded editor is a fully-formed `LinkEditor` (drag traits, methods like `selectByHref`, callbacks like `onLinkOpen` — all reused); (d) JSON self-write loop (`LinkEditor.onDataChangedDebounced` handles serialize-back); (e) HS1 host slot (`<host.id>:link-view` settings persisted automatically by LinkEditor's `adoptHost`).

### BR-IMPL3 — Walkthrough §NH5 amendment: `<bookmarks.linkEditor.View />` → `<LinkBody>`

**Walkthrough §NH5 stated:** "Render the embedded LinkEditor through its View component — `<bookmarks.linkEditor.View />` per the walkthrough 22 / 29 NoteItemView pattern."

**Reality:** `LinkEditor` (v4 class) does NOT have a `View` member. The actual API is `linkModule.Component` (from `link-editor/index.tsx`), which wraps `<LinkBody>` in `<TextChrome>`. Browser's drawer + BlankPageLinks do NOT want TextChrome (TextChrome would add an EditorToolbar with NavPanel button, script panel, encoding label — none of which belong in an embedded LinkEditor inside Browser).

**Resolution:** Render `<LinkBody model={bookmarks.linkEditor} />` directly inside the drawer + BlankPageLinks. The drawer + BlankPageLinks own their own slim toolbars. The LinkEditor's toolbar contributions (Breadcrumb + Add Link button + view-mode menu + search input) get composed inline using reusable bits exported from `link-editor/index.tsx` (BR-IMPL4).

**Walkthrough amendment (this pass):** Update `30-no-host-group.md` §NH5 RESOLUTION text + §"Embedded view (replacing portal refs)" code block. Replace `<bookmarks.linkEditor.View />` with `<LinkBody model={bookmarks.linkEditor} />` plus a brief explanation of why the chrome-less embed is needed.

### BR-IMPL4 — Expose LinkEditor toolbar/footer bits from `link-editor/index.tsx`

`link-editor/index.tsx` currently has three internal functions: `LinkBreadcrumbBits`, `LinkActionBits`, `LinkFooterBits`. They're consumed only by the module's own `LinkEditorView` wrapper. Under US-558, Browser's drawer + BlankPageLinks need to render them inside Browser's own toolbar layout.

**Resolution:** Export the three components. No prop changes — they all already accept `{ model: LinkEditor }`. Browser's BookmarksDrawer + BlankPageLinks import and place them inside their own toolbar `<Panel>` instead of using the portal-ref mechanism.

**Drawer-specific simplifications:** Drawer doesn't need view-mode menu hidden (today's behavior renders all bits identically inside the drawer toolbar). Keep the full `LinkActionBits` block.

**BlankPageLinks-specific simplifications:** Today hides `.link-btn-add` and `.link-btn-browser-selector` via CSS (data-blank-toolbar selectors on `BrowserEditorView.tsx`). Under v4, since we compose inline, we can simply omit the Add Link button + view-mode menu from BlankPageLinks's toolbar — render only the Breadcrumb + Search input. **OR** keep parity with today (render full bits, CSS-hide the unwanted ones). Recommendation: render only what's wanted. Drop the CSS hiding rules from `BrowserRoot` (lines 107-108).

### BR-IMPL5 — Dual embedding consistency (drawer + blank-page share the SAME LinkEditor instance)

Today's pattern: both consumers call `useContentViewModel<LinkViewModel>(model, "link-view")` on the same `bookmarks.textModel`, getting the SAME shared LinkViewModel via ref-counting.

Under US-558: there is exactly ONE `LinkEditor` instance held by `BrowserBookmarks.linkEditor`. Both `BookmarksDrawer` and `BlankPageLinks` receive `bookmarks` as a prop and render `<LinkBody model={bookmarks.linkEditor} />`. They share state automatically because they reference the same instance.

**Lifecycle:** Browser's `dispose()` calls `await this.bookmarks?.dispose()` which disposes the shared LinkEditor + its TextFileModel host. No ref-counting needed (single owner).

**Concurrent mount:** When a blank tab is active AND the drawer is open, both BlankPageLinks and BookmarksDrawer are mounted simultaneously, each rendering its own `<LinkBody>` against the SAME editor. React doesn't allow rendering the same React node twice but `<LinkBody>` is a function component — two function-component invocations against the same model is fine. Verify during implementation: no internal `useRef` collisions in LinkBody (`gridModel: RenderGridModel | null` is on the editor itself, not in a React ref — should be safe; LinkBody's `containerElement` ref is per-instance so it gets two refs, one per mount — also fine, but only one will "win" for focus purposes; today's behavior has the same property so this is no regression).

### BR-IMPL6 — Entry point: `showBrowserPage` → v4 BrowserEditor construction

Today's `PagesLifecycleModel.ts:1036–1067`:

```typescript
const browserModule = await import("../../editors/browser/BrowserEditorView");
const model = await browserModule.default.newEmptyEditorModel("browserPage");
// mutate state
await model.restore();
this.addPage(wrap(model));        // wraps in LegacyEditorAdapter
```

`wrap(model)` (= `wrapLegacy(model)`) wraps the legacy `EditorModel` in `LegacyEditorAdapter`. Under v4, BrowserEditor is **already** a v4 `EditorModel` (post-migration), so it should NOT be wrapped.

**Resolution:** Replace the import and constructor with the v4 module:

```typescript
const browserModule = (await import("../../editors/browser")).browserModule;
const model = browserModule.createEditor() as BrowserEditor;
// mutate state
await model.restore();
this.addPage(model);    // v4 — no wrap
```

`PagesModel.addPage` already handles both v3 (legacy + adapter) and v4 (native) paths. Verify: when a v4 EditorModel is passed without wrap, does `addPage` build the `PageDescriptor.editors[]` correctly? Mirror against Todo / RC / Notebook's `wrapLegacyForPage` path which also returns a v4 model directly. (Browser doesn't go through `wrapLegacyForPage` because it isn't a file-open path.)

### BR-IMPL7 — `acquireViewModel` final-retirement audit

**Pre-US-558 callsites** (grep `acquireViewModel\(`):

| File | Line | Status |
|------|------|--------|
| `BrowserBookmarks.ts:54` | `textModel.acquireViewModel("link-view")` | **RETIRES under US-558** (BR-IMPL2) |
| `useContentViewModel.ts:30` | Generic hook calls `host.acquireViewModel(editorId)` | Still alive — used by legacy LinkView.tsx + NotebookView.tsx + NoteItemActiveEditor's `XxxView` dispatch (US-579 territory) |
| `note-editor/NoteItemEditModel.ts:322` | `NoteItemEditModel.acquireViewModel` (separate LEGACY IContentHost impl) | Stays alive — retires under US-579 |
| `PageWrapper.ts:205` | `model.acquireViewModel("notebook-view")` (scripting facade) | Stays alive while legacy NotebookView is preserved |

After US-558:
- `TextFileModel.acquireViewModel` (lines 61–80) — still has internal users via `useContentViewModel` (the indirect path for any preserved legacy view that uses `useContentViewModel`).
- The `acquireViewModel` quartet on `TextFileModel` DOES NOT delete under US-558 (it would break the preserved legacy LinkView, NotebookView, etc.). It retires alongside `LegacyEditorAdapter` in US-559.

**Net impact of US-558 on the quartet:** retires **the last EXTERNAL/direct consumer** (`BrowserBookmarks.init`). The hook + the preserved legacy views still use it indirectly until US-559.

### BR-IMPL8 — Default-export shape: `browserEditorModule` legacy vs `browserModule` v4

Today's `BrowserEditorView.tsx:723–748` exports `default browserEditorModule: EditorModule` (legacy) with `Editor`, `newEditorModel`, `newEmptyEditorModel`, `newEditorModelFromState`. Under US-558:

- `BrowserView.tsx` (renamed) keeps the legacy default export. The legacy `editorRegistry.register({id:"browser-view",…})` keeps returning this for the LegacyEditorAdapter safety net (matches LK15 / TD15 / RC15 / NB-IMPL7 patterns).
- New `browser/index.tsx` exports `browserModule: EditorModule` (v4 shape — `createEditor` + `Component`).
- Legacy register block's `loadModule` updates: `import("./browser/BrowserView")` (was `./browser/BrowserEditorView`).
- New v4 register block: `import("./browser")` → `browserModule`.

### BR-IMPL9 — `BrowserEditorState` shape under refactor

State stays largely intact:
- Drop `type: "browserPage"` field (S10). All consumers grep'd (BR-IMPL11) need to switch from `mainEditor.type === "browserPage"` to `mainEditor instanceof BrowserEditor`.
- Drop `editor: "browser-view"` field (handled by EditorDescriptor.editorId per P1).
- KEEP all 32 fields otherwise; promote `bookmarksWidth` to persisted (NH3).
- Initial `title: "Browser"` default stays (overridden by `pageTitle || "Browser"` in `restore`).

### BR-IMPL10 — `EditorModule.Component` signature

`browserModule.Component` is the full Browser view (URL bar + tabs panel + webview area). It does NOT wrap in `<TextChrome>` (Browser is no-host; TextChrome is for text-bearing editors). Signature: `Component: ({ model }: { model: V4EditorModel }) => ReactElement`. Internal cast: `const browser = model as BrowserEditor;`. Mirrors today's `BrowserEditorView({ model }: { model: BrowserEditorModel })`.

### BR-IMPL11 — Cross-cutting `editor.type === "browserPage"` consumers

Grep `"browserPage"`:

| File | Lines | Action |
|------|-------|--------|
| `automation/commands.ts:35, 39` | `activePage?.mainEditor?.type === "browserPage"` | Replace with `mainEditor instanceof BrowserEditor`. Import BrowserEditor. |
| `PagesLifecycleModel.ts:1040` | `newEmptyEditorModel("browserPage")` | Replaced by v4 path (BR-IMPL6). |
| `PagesLifecycleModel.ts:1146` | `pageState.type !== "browserPage"` | Replace with `editor instanceof BrowserEditor`. |
| `register-editors.ts:684` | `editorType: "browserPage"` registry field | Stays alive on the LEGACY register block (BR-IMPL8) but is no longer load-bearing. v4 register block omits it (S10). |
| `BrowserEditorModel.ts:270` | `type: "browserPage"` in default state | Drops under US-558. |
| `BrowserEditorView.tsx:733` | `if (editorType !== "browserPage") return null;` | Preserved in `BrowserView.tsx` (legacy module entry stays). |

The `LegacyEditorAdapter.legacy` cast in `PagesLifecycleModel.ts:1165–1170` (`openUrlInBrowserTab`'s `addTabToPage`) also needs updating: under v4, `page.mainEditor` is `BrowserEditor` directly (no adapter). Replace the cast chain with `const editor = page.mainEditorV4 as BrowserEditor;` and call `editor.navigate(url)` / `editor.addTab(url)` directly.

### BR-IMPL12 — v4 register block format

Mirror of Todo / RC / Notebook native v4 register at the bottom of `register-editors.ts`. Browser is no-host, so the v4 `accepts()` returns `-1` (NH10):

```typescript
// US-558 — replace the legacy bare-adapter mirror for browser-view with a
// native v4 module. Browser is NO-HOST (no CONTENT_HOST_TRAIT); the
// `accepts` predicate returns -1 (never matches files — opens via explicit
// user gesture only).
v4EditorRegistry.register({
    id: "browser-view",
    name: "Browser",
    hasContentHost: false,
    accepts: () => -1,
    loadModule: async () => {
        const { browserModule } = await import("./browser");
        return browserModule;
    },
});
```

The mirror loop's bare-adapter stub already excludes `browser-view` (TEXT_CONTENT_VIEW_BRIDGE_IDS doesn't include it) and the "throwing stub" fall-through (register-editors.ts:772–774) is what gets superseded by this register call.

### BR-IMPL13 — `EditorModule.createEditor` factory signature

`createEditor()` returns `new BrowserEditor(new TComponentState(getDefaultBrowserPageState()))`. PagesLifecycleModel's `showBrowserPage` calls this directly (BR-IMPL6). Other entry points (e.g. tray menu, hotkey) go through `showBrowserPage` so no per-entry changes.

### BR-IMPL14 — Removed legacy-shape methods on BrowserEditor

`newEmptyEditorModel`, `newEditorModelFromState`, and `Editor` (component) — these are LEGACY `EditorModule` shape members. They live ONLY on the legacy `BrowserView.tsx`'s default export. The v4 `BrowserEditor` class doesn't have these — `browserModule` provides `createEditor` + `Component` instead.

### BR-IMPL15 — Scripting facade

Today's `BrowserEditorFacade.ts` exists (walkthrough states this — verify path). `page.asBrowser()` stays throw-only (Browser is not a switch target; `force?: boolean` is no-op). Migration: facade flips from VM-wrap to v4-model-wrap (today's facade already wraps `BrowserEditorModel`; minimal change). Verify file path during implementation.

### BR-IMPL16 — `BrowserTargetModel` constructor signature

`BrowserTargetModel` (automation adapter) constructor: `constructor(model: BrowserEditorModel)`. Under US-558 the class rename is `BrowserEditor` → keep `model: BrowserEditor` typing. Sub-models internally type against the parent class (one-line tweak per sub-model file IF the parent class is renamed; ZERO tweaks if we keep the class name `BrowserEditorModel`).

**Decision:** **Keep the class name `BrowserEditorModel`** — minimal diff across the 4 sub-model files. The "renamed" file is the .tsx view, not the .ts class. The new v4 file is `browser/BrowserEditor.ts` exporting the class — but exported under the SAME name `BrowserEditorModel`. Sub-models import from the same path; zero changes.

Wait — that creates a class-name collision (BrowserEditor.ts exports BrowserEditorModel, NotebookEditor.ts exports NotebookEditor). Let me reconsider:

- The Tier-5 pattern (Link / Todo / RC / Notebook) uses the SHORT name (`LinkEditor`, `TodoEditor`, `RestClientEditor`, `NotebookEditor`) for the v4 class.
- Browser today is `BrowserEditorModel` (longer, with the "Model" suffix). Sub-models reference this name.

**Final decision:** Rename the class `BrowserEditorModel` → `BrowserEditor` (matching Tier-5 pattern). Update the 4 sub-model files that import + type against this name (`BrowserWebviewModel`, `BrowserUrlBarModel`, `BrowserBookmarksUIModel`, `BrowserTargetModel` — each has `readonly model: BrowserEditorModel` and `constructor(model: BrowserEditorModel)`). Each file gets a 1–2 line rename via TS rename refactor. Total: ~10 LOC across 4 files.

Trade-off: more diff than keeping the name, but matches pattern consistency + frees the legacy name for the preserved `BrowserEditorModel` symbol in `BrowserView.tsx` (which keeps the legacy class for the safety-net path). Actually — wait — there's only ONE class total. The legacy register's `loadModule` returns the SAME class via `BrowserView.tsx`. So we DO need to disambiguate.

**Simplification:** Move the class definition from `BrowserEditorModel.ts` (legacy file) to `BrowserEditor.ts` (new file). Rename the class to `BrowserEditor`. `BrowserView.tsx` (formerly BrowserEditorView.tsx) re-exports it (`export { BrowserEditor as BrowserEditorModel }`) for backwards-compat with sub-models. Or — cleaner — update sub-models to import `BrowserEditor` from the new location. Total diff: rename in 4 sub-model files + 1 class file move + 1 legacy view import update.

### BR-IMPL17 — `BrowserEditorModel.ts` file disposition

Today: 1090 LOC. Under US-558:
- Class definition moves to `browser/BrowserEditor.ts` (new file).
- Helper functions (`getDefaultBrowserPageState`, `getPartitionString`, `createInternalTabId`, `createTabGroupId`, `detectSearchEngine`, `SEARCH_ENGINES`) — these are CONSUMED by both the v4 class AND sub-models. **Decision:** keep helpers in `BrowserEditorModel.ts` (becomes a "browser-utils" file) OR move them to a new `browser-utils.ts`. Recommendation: rename `BrowserEditorModel.ts` → `browser-utils.ts` and have it export only the helpers + state defaults. `BrowserEditor.ts` imports from `./browser-utils`. Cleaner separation.

Alternative (smaller diff): leave `BrowserEditorModel.ts` as-is and stop exporting `BrowserEditorModel` from it (re-export from BrowserEditor.ts instead). Helpers and state defaults stay where they are. The class definition moves OUT. The file becomes ~750 LOC of helpers + types.

**Recommendation:** Smaller diff — leave the file with helpers + state. Move class to `BrowserEditor.ts`. Update file-level comment to reflect.

### BR-IMPL18 — Backwards-compatibility import strategy for sub-models

Sub-models reference `import type { BrowserEditorModel } from "./BrowserEditorModel"`. Under US-558:

Strategy A: Update all 4 sub-models to import `BrowserEditor` from `./BrowserEditor`. Clean. 4-file diff.

Strategy B: Keep the import name and re-export from `BrowserEditorModel.ts`: `export type { BrowserEditor as BrowserEditorModel } from "./BrowserEditor";`. Zero changes in sub-model files.

**Recommendation:** Strategy A. Pattern consistency with Link / Todo / RC / Notebook (where sub-helpers reference the new class name directly).

### BR-IMPL19 — `mainEditorV4` access vs LegacyEditorAdapter cast

Today's `openUrlInBrowserTab` (PagesLifecycleModel.ts:1165):

```typescript
const adapter = page.mainEditor as LegacyEditorAdapter | null;
const editor = adapter?.legacy as unknown as { state, navigate, addTab };
```

Under v4 Browser native:

```typescript
const editor = page.mainEditorV4 as BrowserEditor;
```

`PageModel.mainEditorV4` is the v4-native accessor (introduced in US-548 / CK10). Verify it exists and returns the v4 model for v4-native pages. Mirror the pattern used in `compareGroups` handling.

### BR-IMPL20 — Tor restore-then-show-overlay path

`applyRestoreData(data)` with `data.isTor === true` sets `torStatus: "disconnected"` + `torOverlayVisible: true` + clears tabs. Under v4 with `RestoreData<S>` typing, the cast becomes natural — no shape change. Verify the v4 `applyRestoreData` signature matches the legacy one (it does — base class signature is the same).

### BR-IMPL21 — `EditorDescriptor` returned from `getRestoreData`

```typescript
getRestoreData(): EditorDescriptor {
    const s = this.state.get();
    return {
        editorId: this.editorId,
        id: s.id,
        state: {
            url: /* active tab's currentUrl */,
            pageTitle: s.pageTitle,
            tabs: s.tabs.map(t => ({ ...t, url: this.currentUrls.get(t.id) || t.url })),
            activeTabId: s.activeTabId,
            tabsPanelWidth: s.tabsPanelWidth,
            bookmarksWidth: s.bookmarksWidth,   // NH3 added
            profileName: s.profileName,
            isIncognito: s.isIncognito,
            isTor: s.isTor,
            searchEngineId: s.searchEngineId,
            lastSearchQuery: s.lastSearchQuery,
            title: s.title,
        } as Record<string, unknown>,
        host: undefined,    // no host — Browser is no-host
    };
}
```

### BR-IMPL22 — Verify base class `descriptorChanged` reactivity

v4 EditorModel auto-subscribes to `state.subscribe(() => descriptorChanged.send(undefined))` in constructor. Browser's state mutations are frequent (tab navigation events, URL updates, audible flag changes, mute toggles). The 300ms debounce on `PagesModel.saveStateDebounced` handles the write-storm — verify it's wired for Browser (it is — same path as Todo / RC / Notebook).

### BR-IMPL23 — `BrowserChannel.clearCache` on dispose

Today's `dispose()` line 547: `if (!s.isIncognito && !s.isTor) ipcRenderer.invoke(BrowserChannel.clearCache, this.partition);`. Stays verbatim. v4 `dispose()` calls `super.dispose()` before this — base `dispose()` only disposes the queue. Verify order: subscribe-cleanup → bookmarks.dispose → Tor cleanup → super.dispose (queue) → cache cleanup. Mirror today's order.

### BR-IMPL24 — Sub-model `dispose()` ordering

`BrowserBookmarksUIModel.dispose()` unsubscribes its 2 subscriptions. Today's `BrowserEditorModel.dispose()` calls `this.bookmarksUI.dispose()` at line 528. Under v4: same call, same position.

Other sub-models (`webview`, `urlBar`, `target`) don't currently have explicit `dispose()` methods — they're GC'd with the parent. Verify during implementation if any should grow disposal (subscriptions, timers).

### BR-IMPL25 — `BlankPageLinks` reuses bookmarks LinkEditor (not a separate one)

Confirmed today (BrowserEditorView.tsx:660): `<BlankPageLinks bookmarks={model.bookmarks} />`. The same instance flows into the drawer too. After US-558, `model.bookmarks.linkEditor` is the single shared editor. ZERO data-state divergence between blank page and drawer renderings.

### BR-IMPL26 — Walkthrough §"State after refactor" `BrowserBookmarksHandle` type rename

The walkthrough proposed renaming `BrowserBookmarks` → `BrowserBookmarksHandle`. Under US-558 we keep the name `BrowserBookmarks` (one less rename — sub-model + UI model both reference this name) but the class body changes per BR-IMPL2. The "Handle" descriptor in the walkthrough was suggestive, not load-bearing.

---

## Implementation plan

### Phase 1 — Rename today's view file (BR-IMPL1)

1. `git mv src/renderer/editors/browser/BrowserEditorView.tsx src/renderer/editors/browser/BrowserView.tsx`. Exported function name `BrowserEditorView` UNCHANGED.
2. Update legacy registry `loadModule` in `register-editors.ts:686`:
   ```typescript
   loadModule: async () => {
       // EPIC-028 / US-558 — Browser migrated to native v4 module
       // (`browserModule` in `./browser/index.tsx`). Legacy BrowserView is
       // PRESERVED here for the LegacyEditorAdapter safety-net path; the
       // showBrowserPage entry point takes the v4 path directly.
       const module = await import("./browser/BrowserView");
       return module.default;
   },
   ```
3. Verify: grep `from "./browser/BrowserEditorView"` returns ONLY the register-editors.ts entry (now updated).

### Phase 2 — Extract `BrowserEditor` class to new file (BR-IMPL16 / BR-IMPL17 / BR-IMPL18)

1. Create `src/renderer/editors/browser/BrowserEditor.ts`. Move the class body from `BrowserEditorModel.ts` lines 328–1083. Rename `BrowserEditorModel` → `BrowserEditor` everywhere in the class file. Update the `EditorModel` base import + signature:

   ```typescript
   import { TComponentState } from "../../core/state/state";
   import {
       EditorModel as V4EditorModel,
       type EditorStateBase,
       type RestoreData,
   } from "../base/v4/EditorModel";
   import { ComponentQueue } from "../../core/state/ComponentQueue";
   import type { EditorDescriptor } from "../../../shared/persistence-v4";
   import type { PageModel } from "../../api/pages/PageModel";
   import { /* state helpers */ } from "./BrowserEditorModel";

   export type BrowserQueueEvent = { type: "focus" };
   export type BrowserQueueRequest = never;

   export class BrowserEditor
       extends V4EditorModel<BrowserEditorState, void, BrowserQueueEvent>
   {
       readonly editorId = "browser-view";
       noLanguage = true;
       skipSave = true;
       // ... preserved field declarations ...
       readonly typedQueue: ComponentQueue<BrowserQueueEvent, BrowserQueueRequest>;
       constructor(state: TComponentState<BrowserEditorState>) {
           super(state);
           this.typedQueue = this.queue as unknown as ComponentQueue<BrowserQueueEvent, BrowserQueueRequest>;
           this.webview = new BrowserWebviewModel(this);
           this.urlBar = new BrowserUrlBarModel(this);
           this.bookmarksUI = new BrowserBookmarksUIModel(this);
           this.target = new BrowserTargetModel(this);
           this.keyDownSub = globalKeyDown.subscribe((e) => this.handleGlobalKeyDown(e!));
           this.windowClosingSub = windowClosing.subscribe(() => this.handleWindowClosing());
           setTimeout(() => this.preloadBookmarks(), 300);
       }
       // ... rest of methods relocated verbatim ...
   }
   ```
2. `BrowserEditorModel.ts` keeps the helper exports (`SEARCH_ENGINES`, `detectSearchEngine`, `BrowserTabData`, `BrowserEditorState`, `DEFAULT_URL`, `createInternalTabId`, `createTabGroupId`, `getDefaultBrowserPageState`, `getPartitionString`). Drop the class export. File shrinks from 1090 to ~330 LOC.
3. Drop the `newBrowserEditorModel()` factory function (now unused — v4 path uses `browserModule.createEditor()`).
4. Update the 4 sub-model files (`BrowserWebviewModel.ts`, `BrowserUrlBarModel.ts`, `BrowserBookmarksUIModel.ts`, `BrowserTargetModel.ts`):
   - `import type { BrowserEditorModel } from "./BrowserEditorModel"` → `import type { BrowserEditor } from "./BrowserEditor"`.
   - `readonly model: BrowserEditorModel` → `readonly model: BrowserEditor`.
   - `constructor(model: BrowserEditorModel)` → `constructor(model: BrowserEditor)`.
5. Update `BrowserView.tsx` (formerly BrowserEditorView.tsx):
   - Replace `import { BrowserEditorModel, BrowserEditorState, BrowserTabData, getDefaultBrowserPageState } from "./BrowserEditorModel";` with `import { BrowserEditor } from "./BrowserEditor";` + helpers from `./BrowserEditorModel`.
   - Update view's `model: BrowserEditorModel` typing → `model: BrowserEditor`.
   - Update default-export factory's `new BrowserEditorModel(...)` → `new BrowserEditor(...)` (keeps the legacy EditorModule shape for the safety-net path).

### Phase 3 — Update `BrowserEditor` class for v4 shape (NH1 / NH8 / BR-IMPL21 / BR-IMPL22 / BR-IMPL23)

1. `getRestoreData()` returns v4 `EditorDescriptor` (BR-IMPL21):
   ```typescript
   getRestoreData(): EditorDescriptor {
       const s = this.state.get();
       const tabs = s.tabs.map((t) => ({ ...t, url: this.currentUrls.get(t.id) || t.url }));
       const activeTab = tabs.find((t) => t.id === s.activeTabId);
       const url = activeTab ? activeTab.url : s.url;
       return {
           editorId: this.editorId,
           id: s.id,
           state: {
               url,
               pageTitle: s.pageTitle,
               tabs,
               activeTabId: s.activeTabId,
               tabsPanelWidth: s.tabsPanelWidth,
               bookmarksWidth: s.bookmarksWidth,   // NH3
               profileName: s.profileName,
               isIncognito: s.isIncognito,
               isTor: s.isTor,
               searchEngineId: s.searchEngineId,
               lastSearchQuery: s.lastSearchQuery,
               title: s.title,
           } as Record<string, unknown>,
       };
   }
   ```
2. `applyRestoreData(data: RestoreData<BrowserEditorState>)` body stays verbatim (today's logic is already shape-compatible). Add `if (data.bookmarksWidth !== undefined) s.bookmarksWidth = data.bookmarksWidth;` for NH3.
3. Drop `editor: "browser-view"` from `getDefaultBrowserPageState` (handled by descriptor.editorId per P1). Verify no consumer reads `state.editor`.
4. Drop `type: "browserPage"` from `getDefaultBrowserPageState`. Update cross-cutting consumers per BR-IMPL11.
5. Add `focus()` override:
   ```typescript
   focus(): void {
       this.typedQueue.send({ type: "focus" });
   }
   ```
6. Verify base class's `descriptorChanged` auto-subscribe handles all Browser state mutations. (It does — single subscription drives all state changes through descriptorChanged.)

### Phase 4 — Refactor `BrowserBookmarks` to embed v4 LinkEditor (NH4 / BR-IMPL2 / BR-IMPL5)

1. Replace the class body of `src/renderer/editors/browser/BrowserBookmarks.ts` per BR-IMPL2 code block above. The class:
   - Holds `readonly textFileHost: TextFileModel` (renamed from `textModel` — clarifies role as host vs. wrapping VM).
   - Holds `readonly linkEditor: LinkEditor` (replaces today's `linkModel: LinkViewModel`).
   - `init()` constructs the LinkEditor at construction-time, calls `restore()` on the host, handles encryption, calls `linkEditor.adoptHost(textFileHost)` + `linkEditor.loadData(content)`.
   - `dispose()` calls `await this.linkEditor.dispose()` (which disposes the host internally).
   - `findByUrl(url)` reads from `this.linkEditor.state.get().data.links`.
2. Drop the field name `linkModel` — all consumers update to `linkEditor`. Grep `bookmarks.linkModel` returns hits in:
   - `BrowserBookmarksUIModel.ts:130, 264` — change to `bookmarks.linkEditor`.
   - `BrowserEditorModel.ts:207, 415, 426, 446, 457` — change to `bookmarks.linkEditor` (note: BrowserEditorModel.ts file persists for helpers — these hits move into `BrowserEditor.ts` per Phase 2).
   - `BrowserEditorView.tsx:208` → `BrowserView.tsx`: `model.bookmarks!.linkModel.state.get().data.links` → `model.bookmarks!.linkEditor.state.get().data.links`.
3. Drop the field name `textModel` — all consumers update to `textFileHost`. Grep `bookmarks.textModel` returns hits in:
   - `BookmarksDrawer.tsx:131` — see Phase 5.
   - `BrowserEditorView.tsx:309` → `BlankPageLinks` — see Phase 6.
4. The `onLinkOpen` + `onGetLinkMenuItems` callback assignments in `BrowserEditorModel.preloadBookmarks` + `initBookmarks` (lines 415–430, 446–461) now go onto `bookmarks.linkEditor.onLinkOpen` / `bookmarks.linkEditor.onGetLinkMenuItems` (the v4 LinkEditor exposes these as optional callback fields — see LinkEditor.ts:152–153).

### Phase 5 — Rewrite `BookmarksDrawer.tsx` (NH5 / BR-IMPL3 / BR-IMPL4)

1. Replace the `<LinkEditor model={bookmarks.textModel} swapLayout toolbarRefFirst/Last footerRefLast />` invocation with a direct embed:
   ```tsx
   import { LinkBody } from "../link-editor/LinkBody";
   import {
       LinkBreadcrumbBits,
       LinkActionBits,
       LinkFooterBits,
   } from "../link-editor";

   <Panel name="bookmarks-toolbar" ...>
       <LinkBreadcrumbBits model={bookmarks.linkEditor} />
       <Panel flex={1} />
       <LinkActionBits model={bookmarks.linkEditor} />
   </Panel>
   <Panel name="bookmarks-editor-host" flex={1} overflow="hidden">
       <LinkBody model={bookmarks.linkEditor} />
   </Panel>
   <Panel name="bookmarks-footer" ...>
       <LinkFooterBits model={bookmarks.linkEditor} />
   </Panel>
   ```
2. Remove `toolbarFirstRef`, `toolbarLastRef`, `footerLastRef` state + their `setX` callbacks.
3. Remove the `setToolbarFirstRef` / `setToolbarLastRef` / `setFooterLastRef` Panel `ref`s.
4. Keep the drawer-specific UI: backdrop, splitter, slide-in animation, escape-to-close, focus-on-open.

### Phase 6 — Rewrite `BlankPageLinks` (NH5 / BR-IMPL4)

1. Inside `BrowserView.tsx` (renamed file), replace the `BlankPageLinks` component's `<LinkEditor model={bookmarks.textModel} toolbarRefFirst toolbarRefLast />` invocation with the same `<LinkBody model={bookmarks.linkEditor}>` + composed toolbar bits.
2. Drop the CSS-hide rules `[data-blank-toolbar] .link-btn-add { display: none }` + `[data-blank-toolbar] .link-btn-browser-selector { display: none }` (BrowserRoot styled lines 107-108). Toolbar composition omits these instead.
3. BlankPageLinks's toolbar shows: `<LinkBreadcrumbBits model={bookmarks.linkEditor} />` + flex spacer + `<LinkFooterBits />` or nothing (skip footer — keep it like today). No Add Link button, no view-mode menu, no search input (matches today's CSS-hidden behavior).

### Phase 7 — Export toolbar bits from `link-editor/index.tsx` (BR-IMPL4)

1. Open `src/renderer/editors/link-editor/index.tsx`. Lines 71, 116, 183 declare `LinkBreadcrumbBits`, `LinkActionBits`, `LinkFooterBits` as private `function` declarations.
2. Add `export` keyword to each. Existing `LinkEditorView` continues to use them inline; new external consumers (BookmarksDrawer + BlankPageLinks) import them.
3. No prop signature changes — all three already accept `{ model: LinkEditor }`.

### Phase 8 — Create v4 module `browser/index.tsx` (BR-IMPL8 / BR-IMPL10 / BR-IMPL13)

Create `src/renderer/editors/browser/index.tsx` (~50 LOC):

```tsx
import { TComponentState } from "../../core/state/state";
import { BrowserEditor } from "./BrowserEditor";
import { getDefaultBrowserPageState } from "./BrowserEditorModel";
import { BrowserView } from "./BrowserView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-558 — native Browser editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native BrowserEditor instance.
 *
 * Browser is NO-HOST (no `CONTENT_HOST_TRAIT`) — `Component` is the full
 * browser view (URL bar + tabs panel + webview area + bookmarks drawer +
 * find bar). No `<TextChrome>` wrap (text-bearing chrome is irrelevant).
 */

function BrowserEditorComponent({ model }: { model: V4EditorModel }) {
    return <BrowserView model={model as BrowserEditor} />;
}

export const browserModule: EditorModule = {
    createEditor: () =>
        new BrowserEditor(new TComponentState(getDefaultBrowserPageState())),
    Component: BrowserEditorComponent,
};

export { BrowserEditor };
export type { BrowserEditorState, BrowserTabData, BrowserQueueEvent } from "./BrowserEditor";
```

Note: `BrowserView` (renamed file) needs to export the view as a named export. Today's `BrowserEditorView` is exported as a named export at the bottom of the file (line 751: `export { BrowserEditorView, BrowserEditorModel };`). Either rename to `BrowserView` or keep `BrowserEditorView`. **Decision:** keep `BrowserEditorView` name — the FILE renames but the exported component keeps its name (matches LV-renamed pattern). Update index.tsx accordingly:

```tsx
import { BrowserEditorView } from "./BrowserView";
function BrowserEditorComponent({ model }) {
    return <BrowserEditorView model={model as BrowserEditor} />;
}
```

### Phase 9 — Wire v4 register block + update legacy `loadModule` (NH10 / BR-IMPL12)

1. In `register-editors.ts`:
   - Update legacy `editorRegistry.register({id:"browser-view",...})` `loadModule` to `import("./browser/BrowserView")` (was `./browser/BrowserEditorView`).
   - Add new v4 register block at the bottom (after RC / NB native v4 registers):
     ```typescript
     v4EditorRegistry.register({
         id: "browser-view",
         name: "Browser",
         hasContentHost: false,
         accepts: () => -1,
         loadModule: async () => {
             const { browserModule } = await import("./browser");
             return browserModule;
         },
     });
     ```

### Phase 10 — Switch `showBrowserPage` to v4 path (BR-IMPL6)

In `PagesLifecycleModel.ts:1036–1067`:

```typescript
// Before:
const browserModule = await import("../../editors/browser/BrowserEditorView");
const model = await browserModule.default.newEmptyEditorModel("browserPage");

// After:
const { browserModule } = await import("../../editors/browser");
const model = browserModule.createEditor() as BrowserEditor;
```

The rest of `showBrowserPage` stays (state mutation via `model.state.update`, `await model.restore()`, `this.addPage(model)`).

**Critical:** `this.addPage(wrap(model))` → `this.addPage(model)` — drop the `wrap()` call (Browser is now a v4 EditorModel; not legacy).

### Phase 11 — Replace `editor.type === "browserPage"` callsites (BR-IMPL11 / BR-IMPL19)

1. `automation/commands.ts:35, 39`:
   ```typescript
   import { BrowserEditor } from "../editors/browser";
   // before: activePage?.mainEditor?.type === "browserPage"
   // after:  activePage?.mainEditor instanceof BrowserEditor
   ```
2. `PagesLifecycleModel.ts:1146` — same pattern.
3. `PagesLifecycleModel.ts:1165` (`openUrlInBrowserTab → addTabToPage`):
   ```typescript
   // before:
   const adapter = page.mainEditor as LegacyEditorAdapter | null;
   const editor = adapter?.legacy as unknown as {...};

   // after:
   const editor = page.mainEditorV4 as BrowserEditor;
   if (!editor) return;
   const tabs = editor.state.get().tabs;
   // ... rest of logic unchanged ...
   ```
   Verify `mainEditorV4` is the right accessor (introduced in US-548 / US-549). If not, use `(page.mainEditor instanceof BrowserEditor) ? page.mainEditor : null`.

### Phase 12 — Final cleanup + safety verifications

1. Drop unused legacy methods from `BrowserView.tsx` default export — KEEP for now (LegacyEditorAdapter safety net per BR-IMPL8). Final retirement is US-559.
2. Grep `acquireViewModel("link-view")` — should return ZERO hits across the codebase (legacy `useContentViewModel` indirection in preserved `LinkView.tsx` doesn't count — that's compile-time legacy code that wakes only if a legacy LinkEditor page is opened, which under US-558 is never the v4 path).
3. Grep `releaseViewModel("link-view")` — same, ZERO hits.
4. Grep `type === "browserPage"` — should return ZERO hits in the active runtime path (only the legacy `BrowserView.tsx:733` check stays, in the preserved legacy module's `newEmptyEditorModel`).
5. Verify the standalone-throwing-stub fall-through in `register-editors.ts:772–774` no longer matches `browser-view` (v4 register block at the bottom supersedes by id).
6. Manual QA: open a fresh Browser page (Ctrl+Shift+B or the menu), open bookmarks drawer, add a bookmark, edit a bookmark, close drawer, navigate to about:blank to see the blank-page links, click a bookmark from the blank-page links, close the page → reopen Persephone → verify Browser page restores with last URL + bookmarks accessible + Tor reconnect button visible if isTor was set + `bookmarksWidth` survives the restart (today regression-tests the silent fix).

### Phase 13 — Walkthrough amendments (cross-cutting per `feedback_cross_cutting_design_amendments`)

In `doc/epics/EPIC-028-editor-architecture/walkthroughs/30-no-host-group.md`:

1. **§NH4 RESOLUTION** — append amendment: "**Amended 2026-05-25 (US-558 investigation):** NH4's mention of NB7 as the 'first instance' of `EditorConstructorArgs.initialHost` is superseded — NB7 was deferred to US-579, so US-558 is the first would-be consumer. **No new primitive lands under US-558**; the embedded LinkEditor uses construct-then-adoptHost (matches Tier-5 `wrapLegacyForPage` precedent)."
2. **§NH5 RESOLUTION + §"Embedded view (replacing portal refs)"** — replace `<bookmarks.linkEditor.View />` with `<LinkBody model={bookmarks.linkEditor} />` and explain the chrome-less embedding rationale (the drawer + BlankPageLinks own their own toolbars; TextChrome would add NavPanel button / script panel / encoding label which are irrelevant to Browser).
3. **§NH3 RESOLUTION** — add cross-reference to the LK2 / TD2 / RC2 / NB2 / MK silent-fix series (now sixth instance).
4. **§Section 1 header** — note that walkthroughs §NH4 + §NH5 land under construct-then-adoptHost not initialHost.

---

## Acceptance criteria

1. `BrowserEditor.ts` exists; `class BrowserEditor extends EditorModel<BrowserEditorState, void, BrowserQueueEvent>`; `readonly editorId = "browser-view"`; no `CONTENT_HOST_TRAIT` closure.
2. `BrowserEditor` does NOT extend or implement `IContentHost`; `contentHost` getter returns `null` (inherited default).
3. `browser/index.tsx` exports `browserModule: EditorModule` with `createEditor` + `Component`.
4. `v4EditorRegistry.register({id:"browser-view", hasContentHost: false, accepts:()=>-1, loadModule: ()=>browserModule, ...})` lands in `register-editors.ts`.
5. Legacy `editorRegistry.register({id:"browser-view",...})` survives (LegacyEditorAdapter safety net) with `loadModule` updated to `import("./browser/BrowserView")`.
6. `BookmarksDrawer.tsx` renders `<LinkBody model={bookmarks.linkEditor} />` + composed toolbar bits — no portal refs, no `swapLayout`, no `<LinkEditor>` from `link-editor/LinkView.tsx`.
7. `BlankPageLinks` (inside `BrowserView.tsx`) renders `<LinkBody>` similarly.
8. `BrowserBookmarks.init()` does NOT call `textFileHost.acquireViewModel(...)`. It calls `linkEditor.adoptHost(textFileHost) + linkEditor.loadData(content)`.
9. `linkModule`'s `LinkBreadcrumbBits`, `LinkActionBits`, `LinkFooterBits` are exported from `link-editor/index.tsx`.
10. `showBrowserPage` in PagesLifecycleModel.ts uses `browserModule.createEditor()` + `this.addPage(model)` (no `wrap()`).
11. All `mainEditor.type === "browserPage"` callsites replaced with `mainEditor instanceof BrowserEditor` (3 callsites: `automation/commands.ts:35,39`, `PagesLifecycleModel.ts:1146`).
12. `openUrlInBrowserTab → addTabToPage` casts `page.mainEditorV4 as BrowserEditor` (not the LegacyEditorAdapter cast chain).
13. `bookmarksWidth` survives app restart (NH3 silent-fix).
14. `BrowserChannel.clearCache` still fires on dispose for non-incognito/non-tor partitions.
15. Tor restore-and-reconnect flow preserved: restart Persephone with a Tor browser page open → re-open Persephone → see the disconnected-overlay with reconnect button (verifies `applyRestoreData` Tor branch survives).
16. `acquireViewModel("link-view")` grep returns ZERO hits in renderer code (post-implementation).
17. Sub-models (`BrowserWebviewModel`, `BrowserUrlBarModel`, `BrowserBookmarksUIModel`, `BrowserTargetModel`) type against `BrowserEditor` (not `BrowserEditorModel`) and continue to function without behavioral change.
18. Walkthrough 30 §NH4 + §NH5 amendments landed within this PR.

---

## Files changed

### Created (3 files)

| File | LOC est. | Purpose |
|------|----------|---------|
| `src/renderer/editors/browser/BrowserEditor.ts` | ~750 | v4 native `BrowserEditor` class (relocates today's `BrowserEditorModel` body) |
| `src/renderer/editors/browser/index.tsx` | ~50 | v4 module export (`browserModule`) |
| `doc/tasks/US-558-browser-editor-migration/README.md` | this | task doc |

### Renamed (1 file)

| Before | After | Notes |
|--------|-------|-------|
| `src/renderer/editors/browser/BrowserEditorView.tsx` | `src/renderer/editors/browser/BrowserView.tsx` | preserved-sibling pattern; legacy `EditorModule` default export kept for safety-net path; internal updates per Phase 2 + Phase 6 |

### Modified

| File | Changes |
|------|---------|
| `src/renderer/editors/browser/BrowserEditorModel.ts` | Drop class definition (moved to `BrowserEditor.ts`); keep helpers + state defaults; drop `newBrowserEditorModel()` factory; drop `type: "browserPage"` + `editor: "browser-view"` from default state; file shrinks ~1090 → ~330 LOC |
| `src/renderer/editors/browser/BrowserBookmarks.ts` | Class body replaced (BR-IMPL2): `textFileHost` + `linkEditor` instead of `textModel` + `linkModel`; `init()` uses construct-then-adoptHost; `dispose()` simplified |
| `src/renderer/editors/browser/BrowserBookmarksUIModel.ts` | Type: `model: BrowserEditorModel` → `model: BrowserEditor`; field accesses `bookmarks.linkModel` → `bookmarks.linkEditor` (2 sites) |
| `src/renderer/editors/browser/BrowserWebviewModel.ts` | Type: `model: BrowserEditorModel` → `model: BrowserEditor` |
| `src/renderer/editors/browser/BrowserUrlBarModel.ts` | Type: `model: BrowserEditorModel` → `model: BrowserEditor` |
| `src/renderer/editors/browser/BrowserTargetModel.ts` | Type: `model: BrowserEditorModel` → `model: BrowserEditor` |
| `src/renderer/editors/browser/BookmarksDrawer.tsx` | Replace `<LinkEditor model={bookmarks.textModel} swapLayout toolbarRef* footerRef* />` with `<LinkBody model={bookmarks.linkEditor} />` + composed toolbar bits; drop portal-ref state + handlers |
| `src/renderer/editors/browser/BrowserView.tsx` | Renamed (Phase 1); `BlankPageLinks` rewrites for direct LinkBody embed (Phase 6); class type updates; default-export factory uses `BrowserEditor` |
| `src/renderer/editors/link-editor/index.tsx` | Add `export` to `LinkBreadcrumbBits`, `LinkActionBits`, `LinkFooterBits` |
| `src/renderer/editors/register-editors.ts` | Update legacy `browser-view` `loadModule` to import `./browser/BrowserView`; drop `editorType: "browserPage"` (NH10 — verify it doesn't break the legacy register block — if it does, keep on the legacy block); add v4 native `browser-view` register block at the bottom (Phase 9) |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | `showBrowserPage` switches to v4 path (Phase 10); `openUrlInBrowserTab → addTabToPage` switches to `mainEditorV4 as BrowserEditor` cast (Phase 11); line 1146 `type !== "browserPage"` → `instanceof BrowserEditor` |
| `src/renderer/automation/commands.ts` | Lines 35, 39 — `type === "browserPage"` → `instanceof BrowserEditor`; add import |
| `doc/epics/EPIC-028-editor-architecture/walkthroughs/30-no-host-group.md` | §NH3 / §NH4 / §NH5 amendments (Phase 13) |
| `doc/active-work.md` | Update US-558 entry status to "investigation complete" with link to this doc |

### Files that need NO changes (verified during investigation)

- `BrowserDownloadsPopup.tsx`, `DownloadButton.tsx`, `TorStatusOverlay.tsx`, `UrlSuggestionsDropdown.tsx`, `BrowserTabsPanel.tsx` — no class references; only consume sub-models or generic state.
- `browser-search-history.ts`, `network-log-links.ts` — no class references.
- `LinkEditor.ts` (v4) — already has the embedded-shape callbacks (`onLinkOpen`, `onGetLinkMenuItems`) and the standard `adoptHost` / `loadData` / `dispose` lifecycle.
- `LinkBody.tsx` — no changes; renders against the v4 LinkEditor model. Verify no `useContentViewModel` indirection.
- `register-editors.ts` standalone-stub fall-through (lines 772–774) — passes through because v4 register supersedes by id.

### Files for follow-up tasks

- `ContentViewModelHost.ts` — stays alive per US-579 (NoteItemEditModel still imports).
- `TextFileModel.acquireViewModel/releaseViewModel/prepareViewModel/loadViewModelFactory` (lines 61–80 + 197 — verify exact line numbers during impl) — stays alive while preserved legacy views consume via `useContentViewModel`. Final retirement under US-559.
- `useContentViewModel.ts` — stays alive (consumed by preserved `LinkView.tsx`, `NotebookView.tsx`, etc.). Final retirement under US-559.
- Scripting facade (`BrowserEditorFacade.ts`) — verify file exists during implementation. Flip VM-wrap to v4-model-wrap if needed. Keep `page.asBrowser` throw-only.
