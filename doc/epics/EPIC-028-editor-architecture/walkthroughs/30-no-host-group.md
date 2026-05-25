# No-host editors walkthrough

> **Status:** Done 2026-05-20. Tier 5 per-editor walkthrough — the **no-host group**. Editors without `CONTENT_HOST_TRAIT` — they own their state directly rather than wrapping a `TextFileModel`. Per user direction this walkthrough covers only three of the twelve no-host editors in depth: **Browser** (the embedded-LinkEditor case), **Compare** (the not-an-EditorModel case), and **Explorer** (the secondary-only-EditorModel case). The other nine (PDF / image / archive / video / settings / about / mcp-inspector / storybook / category) are structurally similar to one of the three covered here (or to the no-host shape Walkthroughs 27 / 28 already deferred), and will be investigated first-principles during implementation. Three concern blocks: **NH1–NH10** for Browser, **CP1–CP5** for Compare, **EX1–EX10** for Explorer. All 25 concerns **RESOLVED**. **Zero mockup changes** — eighth template-confirmation walkthrough in a row (Grid + Preview group + Log View + Link + Todo + Rest Client + Notebook + No-host group). **First walkthrough covering three architecturally distinct shapes in a single doc.**

Walkthrough 30 covers three architecturally distinct shapes:

1. **Browser** — page mainEditor with NO `IContentHost`, but embeds a full `LinkEditor` (bookmarks drawer) that DOES have a content host. **Second instance of an editor embedding another EditorModel** (after Notebook NB7). Different from Notebook in three ways: (a) the embedded editor is always `LinkEditor` (Notebook embeds variable per-note editor), (b) the embedding is optional + lazy (drawer is opt-in by user gesture, panel collapses when closed) rather than always-on per-row, (c) the bookmarks file is a **separate file** from anything the Browser persists.
2. **Compare** — not an `EditorModel` at all; a plain React component composed over two grouped pages' `TextFileModel` hosts. Walkthrough 06 already resolved the placement (CK1–CK10); this walkthrough verifies + confirms.
3. **Explorer** — `EditorModel` that lives **only** in `secondaryEditors[]`, never as mainEditor. Not in the `editorRegistry` (no `accepts()` predicate, no switch-widget visibility). Constructed directly. Already has Link's LK8/LK9 hook shape (`onMainEditorChanged` + tree-provider field) — the **second consumer of those hooks** after Link, but in a different membership pattern (sidebar-only-EditorModel rather than sidebar-owning-mainEditor).

The umbrella note for the other nine editors lives in the closure section.

---

# Section 1 — Browser

## State today

`src/renderer/editors/browser/` is a 15-file folder:

| File group | Contents |
|------------|----------|
| Core model | `BrowserEditorModel.ts` (1075 LOC), `BrowserWebviewModel.ts` (617 LOC), `BrowserUrlBarModel.ts` (262 LOC), `BrowserBookmarksUIModel.ts` (370 LOC), `BrowserTargetModel.ts` (92 LOC) |
| Bookmarks | `BrowserBookmarks.ts` (82 LOC), `BookmarksDrawer.tsx` (155 LOC) |
| Aux state | `browser-search-history.ts`, `network-log-links.ts` |
| View | `BrowserEditorView.tsx` (750 LOC), `BrowserTabsPanel.tsx` (477 LOC), `BrowserDownloadsPopup.tsx`, `DownloadButton.tsx`, `TorStatusOverlay.tsx`, `UrlSuggestionsDropdown.tsx` |

### Today's class shape

```typescript
class BrowserEditorModel extends EditorModel<BrowserEditorState, void> {
    noLanguage = true;
    skipSave = true;

    readonly webview: BrowserWebviewModel;
    readonly urlBar: BrowserUrlBarModel;
    readonly bookmarksUI: BrowserBookmarksUIModel;
    readonly target: BrowserTargetModel;

    private keyDownSub: SubscriptionObject;
    private windowClosingSub: SubscriptionObject;

    bookmarks: BrowserBookmarks | null = null;   // lazily initialized

    // ~30 methods for tab management, navigation, bookmarks, Tor, mute, find-bar, ...
}
```

**Two generics, not three** — Browser is pre-S4 / B1 from walkthrough 02 in that it does NOT carry a ComponentQueue generic today. The third generic gets added by base-class mockup `EditorModel<S, R, E>` from walkthrough 02 / S4; Browser would land with `E = BrowserQueueEvent` (likely `{ focus } | { reload } | { goHome }` or similar) by following the Tier-5 template.

### Today's state shape (32 fields)

```typescript
interface BrowserEditorState extends IEditorState {
    // Persisted (saved across restart):
    url: string;
    pageTitle: string;
    tabs: BrowserTabData[];           // 13-field per-tab sub-shape
    activeTabId: string;
    tabsPanelWidth: number;
    profileName: string;
    isIncognito: boolean;
    isTor: boolean;
    searchEngineId: string;
    lastSearchQuery: string;

    // Runtime — synced from active tab (NOT persisted because per-tab values are):
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    favicon: string;

    // Tor runtime — reconnects on restore:
    torStatus: "disconnected" | "connecting" | "connected" | "error";
    torLog: string;
    torOverlayVisible: boolean;

    // Audio:
    pageMuted: boolean;
    _anyTabAudible: boolean;          // derived from tabs[].audible

    // URL-bar runtime (managed by BrowserUrlBarModel):
    urlInput: string;
    suggestionsOpen: boolean;
    userHasTyped: boolean;
    hoveredIndex: number;
    searchEntries: string[];

    // Other runtime:
    popupOpen: boolean;
    blockedPopupCount: number;

    // Bookmarks UI (managed by BrowserBookmarksUIModel):
    bookmarksOpen: boolean;
    bookmarksWidth: number;
    isBookmarked: boolean;
    bookmarksReady: boolean;

    // Find-in-page runtime:
    findBarVisible: boolean;
    findText: string;
    findActiveMatch: number;
    findTotalMatches: number;
}
```

Total: 32 fields across 4 categories — 10 persisted, 4 derived-from-tabs, 3 Tor-runtime, 15 transient.

### Today's bookmarks embedding (the LinkEditor case)

`BrowserBookmarks` constructs a TextFileModel for the `.link.json` bookmarks file, then **acquires a LinkViewModel via the host's ContentViewModelHost ref-counting machinery**:

```typescript
// BrowserBookmarks.ts (today)
class BrowserBookmarks {
    textModel: TextFileModel;
    linkModel!: LinkViewModel;

    constructor(filePath: string) {
        const state = { ...getDefaultTextFileEditorModelState(), filePath, language: "json", editor: "link-view" };
        this.textModel = new TextFileModel(new TComponentState(state));
        this.textModel.skipSave = true;
    }

    async init(...): Promise<boolean> {
        await this.textModel.restore();
        // ... encryption handling ...
        this.linkModel = await this.textModel.acquireViewModel("link-view") as LinkViewModel;  // ← ref-counted acquire
        return true;
    }

    async dispose(): Promise<void> {
        this.textModel.releaseViewModel("link-view");                                            // ← ref-counted release
        await this.textModel.dispose();
    }
}
```

And `BookmarksDrawer.tsx` renders the LinkEditor with the legacy portal-ref props (`toolbarRefFirst`, `toolbarRefLast`, `footerRefLast`):

```tsx
<LinkEditor
    model={bookmarks.textModel}
    swapLayout
    toolbarRefFirst={toolbarFirstRef}
    toolbarRefLast={toolbarLastRef}
    footerRefLast={footerLastRef}
/>
```

**Both pieces break under EPIC-028.** `acquireViewModel` retires per SF2 + LV9 + NB6. The portal-ref props retire per walkthrough 09 / 10.

### Today's lifecycle pieces

| Method | Behavior |
|--------|----------|
| Constructor | Creates four sub-models; subscribes `globalKeyDown` + `windowClosing`; calls `preloadBookmarks()` after 300ms timeout |
| `restore()` | Calls `super.restore()`; sets title from `pageTitle \|\| "Browser"` |
| `getRestoreData()` | Returns 10-field snapshot — `tabs` (with `currentUrls` map merged in), `activeTabId`, `tabsPanelWidth`, `pageTitle`, `profileName`, `isIncognito`, `isTor`, `searchEngineId`, `lastSearchQuery`, `url` |
| `applyRestoreData(data)` | Re-assigns fresh tab IDs, syncs top-level state from active tab; if `isTor`, resets to disconnected + overlay-visible + fresh blank tab |
| `dispose()` | Unsubscribes; disposes `bookmarksUI` + `bookmarks`; stops Tor if started; clears HTTP cache for non-incognito/non-tor partitions |
| `handleGlobalKeyDown` | F5 / Ctrl+R reload, F12 devtools, Ctrl+F find, Esc close-find-or-stop, Alt+arrow back/forward, Alt+Home home |
| `handleWindowClosing` | Stops Tor partition |

### Today's registration

```typescript
editorRegistry.register({
    id: "browser-view",
    name: "Browser",
    editorType: "browserPage",
    category: "standalone",
    loadModule: async () => (await import("./browser/BrowserEditorView")).default,
});
```

`category: "standalone"` is what walkthrough 13 / MI3 collapses into the `!hasContentHost` flag.

---

## State after refactor

`BrowserEditorModel` becomes a no-host EditorModel — same shape it already has, with these targeted edits:

```typescript
class BrowserEditorModel extends EditorModel<BrowserEditorState, void, BrowserQueueEvent> {
    readonly editorId = "browser-view";
    noLanguage = true;

    readonly webview: BrowserWebviewModel;
    readonly urlBar: BrowserUrlBarModel;
    readonly bookmarksUI: BrowserBookmarksUIModel;
    readonly target: BrowserTargetModel;

    /** Embedded LinkEditor for the bookmarks drawer. Lazily constructed when user opens drawer. */
    bookmarks: BrowserBookmarksHandle | null = null;

    // ... rest unchanged structurally
}
```

**No `traits.set(CONTENT_HOST_TRAIT, ...)` closure** — Browser is no-host. The base class `contentHost` getter returns `null` (B2 default from walkthrough 08 / 09). The `findCompatibleEditors()` registry probe returns `[]` (no host to peek at) — switch widget is hidden per PT10. Browser is end-of-the-line for the switch protocol.

### Embedded-LinkEditor lifecycle (construct-then-adoptHost — US-558 amendment)

Today's `BrowserBookmarks` keeps its name (the proposed `BrowserBookmarksHandle` rename retired during implementation — see BR-IMPL26). The class body changes to embed a v4 LinkEditor via construct-then-adoptHost:

```typescript
class BrowserBookmarks {
    readonly textFileHost: TextFileModel;
    readonly linkEditor: LinkEditor;

    constructor(filePath: string) {
        const state = { ...getDefaultTextFileEditorModelState(), filePath, language: "json", editor: "link-view" };
        this.textFileHost = new TextFileModel(new TComponentState(state));
        this.textFileHost.skipSave = true;
        // LinkEditor is constructed empty; the host adoption (in init) wires
        // up subscriptions and seeds HS1 settings.
        this.linkEditor = new LinkEditor(
            new TComponentState({ ...defaultLinkEditorState, id: crypto.randomUUID() }),
        );
    }

    async init(options?: { silent?: boolean }): Promise<boolean> {
        await this.textFileHost.restore();
        if (shell.encryption.isEncrypted(this.textFileHost.state.get().content)) {
            if (options?.silent) return false;
            const password = await ui.password({ mode: "decrypt" });
            if (!password) return false;
            if (!(await this.textFileHost.decrypt(password))) return false;
        }
        // Construct-then-adoptHost (BR-IMPL2) — matches the existing Tier-5
        // wrapLegacyForPage pattern (Todo / RestClient / Notebook). LinkEditor
        // adopts the already-restored host (no re-read) and parses content
        // inline via loadData.
        this.linkEditor.adoptHost(this.textFileHost);
        this.linkEditor.loadData(this.textFileHost.state.get().content ?? "");
        return true;
    }

    async dispose(): Promise<void> {
        // LinkEditor.dispose disposes its host internally — no double-dispose.
        await this.linkEditor.dispose();
    }

    findByUrl(url: string): LinkItem | undefined {
        return this.linkEditor.state.get().data.links.find((l) => l.href === url);
    }
}
```

Three reuses of EPIC-028 patterns: (a) **construct-then-adoptHost** matches the Tier-5 `wrapLegacyForPage` pattern (Todo / RestClient / Notebook); the proposed `EditorConstructorArgs.initialHost` primitive does NOT land under US-558 — it was deferred along with NB7 into US-579 (see NH4 amendment); (b) LinkEditor's `adoptHost` + `loadData` parallel its `restore()` chain — just bypassing the host-construction-from-pendingHost branch since we own the already-restored host; (c) the **embedded editor is a fully-formed `LinkEditor`**, not a separate copy of LinkEditor's internals — Browser inherits LinkEditor's traits (drag accept, etc.), methods (`selectByHref`, etc.), and callback fields (`onLinkOpen`, `onGetLinkMenuItems`) without re-implementation.

### Embedded view (replacing portal refs)

`BookmarksDrawer.tsx` simplifies to (per US-558 amendment — chrome-less `<LinkBody>` + reused toolbar bits):

```tsx
import { LinkBody } from "../link-editor/LinkBody";
import { LinkActionBits, LinkBreadcrumbBits, LinkFooterBits } from "../link-editor";

function BookmarksDrawer({ open, bookmarks, width, onChangeWidth, onClose }: BookmarksDrawerProps) {
    if (!open) return null;
    return (
        <BookmarksDrawerRoot ...>
            <div data-bookmarks-backdrop onClick={onClose} />
            <Splitter ... />
            <div data-bookmarks-panel-wrap style={{ width }}>
                <Panel name="bookmarks-panel" direction="column" height="100%">
                    <Panel name="bookmarks-toolbar" direction="row" align="center" gap="xs">
                        <LinkBreadcrumbBits model={bookmarks.linkEditor} />
                        <Panel flex={1} />
                        <LinkActionBits model={bookmarks.linkEditor} />
                    </Panel>
                    <Panel name="bookmarks-editor-host" flex={1} overflow="hidden">
                        <LinkBody model={bookmarks.linkEditor} />
                    </Panel>
                    <Panel name="bookmarks-footer" direction="row" align="center">
                        <LinkFooterBits model={bookmarks.linkEditor} />
                    </Panel>
                </Panel>
            </div>
        </BookmarksDrawerRoot>
    );
}
```

**No more portal-ref props.** The `swapLayout` prop also retires — LinkEditor's TextFileModel host is hidden behind the LinkEditor's own surface; there is no second editor to swap to inside the drawer. (Note: the original code block used `<bookmarks.linkEditor.View />` — that API does not exist on v4 EditorModel; the actual surface is `<LinkBody>` plus reused toolbar bits exported from `link-editor/index.tsx`. See NH5 amendment.)

### Lifecycle hooks table (Browser)

| Hook | Override? | Reason |
|------|-----------|--------|
| `editorId` | `"browser-view"` | required identity |
| `noLanguage` | `true` | not language-bound |
| `traits` | unset | no CONTENT_HOST_TRAIT (no-host) |
| `restore()` | yes | calls super; sets title from pageTitle; if `isTor` was persisted, leaves overlay visible for reconnect |
| `getRestoreData()` | yes | 10-field snapshot per today's behavior |
| `applyRestoreData(data)` | yes | per today's behavior — re-assigns fresh tab IDs, restores Tor overlay state |
| `dispose()` | yes | unsubscribes; disposes sub-models + bookmarks; stops Tor; clears HTTP cache |
| `getIcon()` | yes | Tor / Incognito / Globe (color from profile or default) |
| `isFreshEmpty()` | no — base returns false | Browser is never "fresh empty" (always has at least one tab) |
| `focus()` | optional | could `queue.send({ type: "focus" })` to focus URL input |

**8 overrides (or 9 with `focus()`).** Comparable to Grid / Todo / RC (9 hooks) — same shape, minus CONTENT_HOST_TRAIT, minus content-host-related lifecycle. The no-host shape is **two-to-three hooks lighter** than text-bearing Tier 5 editors because there's no adopt-host + no switchFrom + no descriptor.host wiring.

### Registration after refactor

```typescript
editorRegistry.register({
    id: "browser-view",
    name: "Browser",
    create: (state) => new BrowserEditorModel(state),
    accepts: ({ mode }) => -1,   // never accepts a file (standalone — explicit user gesture only)
});
```

**Drops `editorType: "browserPage"` per S10.** Drops `category: "standalone"` per MI3 — replaced by `!hasContentHost` (the no-host flag is derived from `editor.contentHost == null`). The `accepts()` predicate returns `-1` unconditionally — Browser does not appear in the switch widget, does not match files, only opens via explicit user gesture (`File → New Browser` menu, or `pagesModel.lifecycle.addBrowserPage()`).

---

## Persistence

Today's persistence path (walkthrough 04 / P1):

```typescript
PageDescriptor {
    id: "page-1",
    title: "Browser",
    mainEditorId: "abc123",
    editors: [
        {
            editorId: "browser-view",
            id: "abc123",
            state: {                          // BrowserEditorState (10 persisted fields)
                url: "https://example.com",
                pageTitle: "Example",
                tabs: [{ id, url, pageTitle, ... }],
                activeTabId: "bt-3",
                tabsPanelWidth: 34,
                profileName: "",
                isIncognito: false,
                isTor: false,
                searchEngineId: "google",
                lastSearchQuery: "..."
            }
            // no host (no-host editor)
        }
    ]
}
```

**No `EditorDescriptor.host`** — descriptor omits the host field entirely for no-host editors. Restore happens through `BrowserEditorModel.applyRestoreData(state)` followed by `restore()`. Tor reconnect is initiated from the view (overlay shows reconnect button per today's pattern).

**No per-editor cache file** — Browser persists everything inside the EditorDescriptor.state. Bookmarks live in their own file (the `.link.json` chosen by user via `settings`); search history lives in `searchHistoryManager`'s own files; nothing else needs caching.

---

## Scripting

`BrowserEditorFacade.ts` already exists today and wraps `BrowserEditorModel`. Under EPIC-028 it stays the same shape — flips from VM-wrap to EditorModel-wrap (no change since Browser was already EditorModel-backed today). Methods like `navigate`, `addTab`, `switchTab` stay sync (no Monaco-style queue.execute pattern needed).

`page.asBrowser()` per SF1: stays throw-only (Browser is not a switch target — `force?: boolean` would be a no-op since there's no compatible alternative). Throws when `mainEditor instanceof BrowserEditorModel` is false.

---

## Concerns NH1–NH10 (Browser)

### NH1 — Class shape: `BrowserEditorModel extends EditorModel<BrowserEditorState, void, BrowserQueueEvent>`

Today: `EditorModel<BrowserEditorState, void>` (two generics — pre-walkthrough-02 / S4 / B1).

Under EPIC-028 the third generic for ComponentQueue lands per S4. Browser's queue event union is small — likely `{ focus } | { reload } | { openFind }` based on the F5/Ctrl+F keyboard shortcuts that today directly call methods on `webview`.

Candidate shapes:

(a) **`BrowserQueueEvent = { type: "focus" }` only** — match Grid GR10 / Todo TD10 / RC10 / NB10 minimal-queue calibration; keyboard shortcuts stay direct calls into `webview` sub-model (today's pattern).

(b) **Larger union** — `{ focus } | { reload } | { openFind } | { closeFind } | { goBack } | { goForward }` for full keyboard-shortcut decoupling.

(c) **Skip the third generic entirely** — Browser stays `EditorModel<S, void>` (two-generic shape) since the base class third generic defaults to `never` per S4 / B1.

**RESOLVED 2026-05-20** — Option (a) confirmed. Minimal queue, matches Tier-5 calibration across eight prior editors. Keyboard shortcuts route via `globalKeyDown` subscription per today's pattern (direct method calls into `webview`); the queue stays reserved for chrome-to-editor wakeups like focus restoration after switch. Rejected (b) — premature scaffolding; today's direct-call shape works fine. Rejected (c) — inconsistent with the rest of Tier-5; the third generic is free when defaulted to `{ focus }`.

### NH2 — No CONTENT_HOST_TRAIT — confirm

Browser is the **first walked editor that's explicitly NOT a content host owner**. Confirm:

- No `traits.set(CONTENT_HOST_TRAIT, ...)` closure.
- `contentHost` getter inherits the base-class default returning `null` (B2 from walkthrough 08).
- `findCompatibleEditors()` registry probe returns `[]` — switch widget hidden per PT10.
- Switch widget UI confirmation: `findCompatibleEditors().length >= 2 && includes(editorId)` evaluates to false → widget renders nothing per the walkthrough 09 mockup.

Candidate shapes:

(a) **Confirm + no mockup change** — base class already supports the no-host shape.

(b) **Add a `NO_CONTENT_HOST_TRAIT` marker** — explicit opt-out symbol on the editor for documentation.

**RESOLVED 2026-05-20** — Option (a) confirmed. No marker needed. Absence of CONTENT_HOST_TRAIT IS the marker (the negative of presence). Switch widget already correctly hides per PT10. Rejected (b) — adds a redundant declaration with no machinery consuming it.

### NH3 — State slice partitioning (10 persisted / 22 transient)

Today's 32-field state divides into:
- **10 persisted** (return from `getRestoreData()`): `url`, `pageTitle`, `tabs`, `activeTabId`, `tabsPanelWidth`, `profileName`, `isIncognito`, `isTor`, `searchEngineId`, `lastSearchQuery`
- **4 derived-from-active-tab** (recomputed on restore): `loading`, `canGoBack`, `canGoForward`, `favicon`
- **3 Tor runtime** (reset/reconnect on restore): `torStatus`, `torLog`, `torOverlayVisible`
- **15 transient** (stripped from `getRestoreData()` — managed by sub-models or runtime-only): `urlInput`, `suggestionsOpen`, `userHasTyped`, `hoveredIndex`, `searchEntries`, `popupOpen`, `blockedPopupCount`, `bookmarksOpen`, `bookmarksWidth`, `isBookmarked`, `bookmarksReady`, `pageMuted`, `_anyTabAudible`, `findBarVisible`, `findText`, `findActiveMatch`, `findTotalMatches`

Candidate shapes:

(a) **Keep today's 10-persisted boundary as-is** — `getRestoreData()` returns the 10-field snapshot per today's behavior; transient state strips via MO5 pattern.

(b) **Promote `pageMuted` to persisted** — today's `pageMuted` is in the transient column; some users would expect it to survive restart.

(c) **Promote `bookmarksWidth` to persisted** — per-window UI dimension; same family as `tabsPanelWidth` (which IS persisted).

**RESOLVED 2026-05-20** — Options (a) + (c) confirmed. Keep the 10-field boundary today's code already enforces, AND extend with `bookmarksWidth` because it's structurally identical to `tabsPanelWidth` (silent today-bug — **fifth instance** of `leftPanelWidth`-equivalent incidental fix after LK2 / TD2 / RC2 / NB2). Rejected (b) — `pageMuted` is a transient gesture meant to silence one specific browsing session; persisting it would surprise users who don't realize they muted the browser at last close. Rejected isolated (a) — leaving `bookmarksWidth` un-persisted matches the pattern of incidental fixes carried by the prior four walkthroughs; the descriptor consolidation gets it for free.

**Amended 2026-05-25 (US-558 implementation):** Sixth instance — Markdown's `compactMode` (MK) landed between NH3's original drafting and US-558 implementation, so the running series is now LK2 → TD2 → RC2 → NB2 → MK → NH3 (bookmarksWidth). The promotion landed verbatim per option (a)+(c).

### NH4 — Bookmarks `acquireViewModel("link-view")` retirement

Today's `BrowserBookmarks.init()` calls `this.textModel.acquireViewModel("link-view")` to get a shared LinkViewModel. Under SF2 + LV9 + NB6 the `acquireViewModel` machinery is fully retired (interface declaration deleted; both implementations deleted).

Candidate shapes:

(a) **Embedded LinkEditor via `EditorConstructorArgs.initialHost` (the NB7 pathway)** — `new LinkEditor({ initialHost: this.textFileHost })`; LinkEditor's `restore()` adopts the already-restored host without re-reading (host's `state.restored === true`). Mirror of Notebook NB7's per-note editor construction.

(b) **Direct LinkViewModel construction (legacy)** — bypass LinkEditor entirely; construct just the data layer (loaders, parsers, mutators). Loses LinkEditor's traits, methods, and unified persistence path.

(c) **Share via a service locator pattern** — global map from `filePath → LinkEditor` instance. Browser and any future consumer of the same bookmarks file would share one instance. New machinery.

**RESOLVED 2026-05-20** — Option (a) confirmed. Exact match for NB7's resolution. The `EditorConstructorArgs.initialHost` pathway is **already the canonical injection mechanism** per walkthrough 29 / NB7 ("supersedes C4's tentative `setContentHost()` separate-call shape"). Browser is the **second consumer** of `initialHost` after Notebook — confirms the property NB7 established (host adoption at construction, not post-construction). With NH4 resolved, the `acquireViewModel` / `releaseViewModel` / `prepareViewModel` / `acquireViewModelSync` quartet is now **fully retired across the entire codebase** — Browser's `BrowserBookmarks.init()` was the final remaining external consumer outside of NoteItemEditModel (which dropped it in NB6). Rejected (b) — loses the unified LinkEditor abstraction; would create a parallel data layer that diverges over time. Rejected (c) — speculative; today only Browser embeds LinkEditor, so a service locator is YAGNI machinery.

**Amended 2026-05-25 (US-558 implementation):** The "second consumer of `EditorConstructorArgs.initialHost` after NB7" framing is superseded. NB7 was **deferred to US-579** under the outer-only scope of US-557, so the `initialHost` primitive does NOT exist when US-558 lands — US-558 is the **first** would-be consumer. Per BR-IMPL2, US-558 uses **construct-then-adoptHost** instead (matches the existing Tier-5 `wrapLegacyForPage` pattern from Todo / RestClient / Notebook):

```typescript
this.textFileHost = new TextFileModel(new TComponentState(state));
this.linkEditor = new LinkEditor(
    new TComponentState({ ...defaultLinkEditorState, id: crypto.randomUUID() }),
);
// init():
await this.textFileHost.restore();
// ... encryption handling ...
this.linkEditor.adoptHost(this.textFileHost);
this.linkEditor.loadData(this.textFileHost.state.get().content ?? "");
```

The NH4 invariants still hold — `acquireViewModel`'s **external direct** consumers are fully retired (the `useContentViewModel` indirection in preserved legacy views like `LinkView.tsx` / `NotebookView.tsx` stays alive until US-559). NoteItemEditModel's own LEGACY `IContentHost` impl retires under US-579 alongside the rest of the inner per-note migration.

### NH5 — `<LinkEditor model={textModel} swapLayout toolbar/footerRefXxx>` retirement

Today's `BookmarksDrawer.tsx` invokes LinkEditor with the legacy portal-ref props (`toolbarRefFirst`, `toolbarRefLast`, `footerRefLast`) and a `swapLayout` flag. All three retire per walkthrough 09 / 10's inline composition + walkthrough 10's `<TextChrome>` dissolution.

Candidate shapes:

(a) **Render the embedded LinkEditor through its View component** — `<bookmarks.linkEditor.View />` per the walkthrough 22 / 29 NoteItemView pattern. LinkEditor composes its own toolbar + footer; BookmarksDrawer hosts no portal refs. The drawer's own toolbar (the close button, etc.) is rendered separately as plain JSX.

(b) **Keep the portal-ref shape** — extend EPIC-028 to support embedded-host scenarios. Adds machinery that only Browser would consume.

(c) **Replace `swapLayout` with an explicit `embedded?: boolean` prop on `<LinkEditor>` View** that toggles the layout** — similar to today's behavior but typed.

**RESOLVED 2026-05-20** — Option (a) confirmed. Symmetric with NB7's per-note rendering pattern (`<embeddedEditor.View />`). The embedded LinkEditor inside Browser is no different from an embedded Monaco inside Notebook. Drawer-specific UI (the close button, the splitter, the slide-in animation) stays in `BookmarksDrawer.tsx` as plain JSX; the LinkEditor body is the only piece that renders LinkEditor-specific chrome. Rejected (b) — adds machinery for one consumer. Rejected (c) — Browser's drawer doesn't need a separate layout; the standard LinkEditor layout fits the drawer's body slot directly.

**Amended 2026-05-25 (US-558 implementation):** The proposed `<bookmarks.linkEditor.View />` API does not exist — v4 `EditorModel` subclasses don't expose a `View` member. The actual v4 surface is `linkModule.Component` (from `link-editor/index.tsx`), which wraps `<LinkBody>` in `<TextChrome>`. Browser's drawer + the `BlankPageLinks` blank-tab overlay both want a **chrome-less** embed (TextChrome would add NavPanel button / script panel / encoding label — irrelevant inside Browser). Per BR-IMPL3 / BR-IMPL4 the resolution is:

- Drawer + BlankPageLinks render `<LinkBody model={bookmarks.linkEditor} />` directly.
- The three LinkEditor toolbar bits (`LinkBreadcrumbBits`, `LinkActionBits`, `LinkFooterBits`) get **exported** from `link-editor/index.tsx` so the drawer can compose them inline inside its own slim toolbar layout. BlankPageLinks renders only `LinkBreadcrumbBits` (today's CSS-hide behavior for `.link-btn-add` / `.link-btn-browser-selector` becomes "don't render" instead of "render hidden").

The "embedded editor is a fully-formed LinkEditor" claim still holds — the SAME instance backs both the drawer and the blank-page overlay (BR-IMPL5), so state stays consistent across the two surfaces.

### NH6 — Sub-model preservation (webview / urlBar / bookmarksUI / target)

Browser today owns four sub-models: `BrowserWebviewModel` (617 LOC — webview refs, IPC, context menu, keyboard), `BrowserUrlBarModel` (262 LOC — URL input, suggestions, search engine), `BrowserBookmarksUIModel` (370 LOC — drawer state, star button, image discovery), `BrowserTargetModel` (92 LOC — Playwright automation adapter).

Under EPIC-028 do these sub-models survive, or do they get flattened?

Candidate shapes:

(a) **Preserve all four sub-models verbatim** — they're orthogonal organizational concerns (webview lifecycle, URL bar UX, bookmarks UX, automation adapter); they each have their own state subscriptions and disposal logic; flattening would produce a 2300-LOC monolith.

(b) **Flatten into BrowserEditorModel** — single class, all methods inline. Loses cohesion; harder to test.

(c) **Promote one or more sub-models to base-class hooks** — e.g., make BrowserTargetModel an opt-in EditorModel trait. Speculative.

**RESOLVED 2026-05-20** — Option (a) confirmed. Sub-models are an internal composition pattern that EPIC-028 has no opinion on; today's split works (each sub-model holds a reference to its parent BrowserEditorModel and subscribes to its state). The sub-model boundary is **orthogonal to the EditorModel boundary**. Rejected (b) — would balloon a 1075-LOC class to 2316 LOC with no benefit. Rejected (c) — would over-fit EPIC-028 to one editor's needs; sub-model patterns are editor-internal policy.

### NH7 — Bookmarks lifecycle: lazy + opt-in

Today's bookmarks lifecycle:

1. `BrowserEditorModel.constructor()` schedules `preloadBookmarks()` 300ms after construction (silent — skips password prompt for encrypted files).
2. If silent preload succeeds, `bookmarks: BrowserBookmarks` is populated and `state.bookmarksReady = true`.
3. If silent preload fails (no file configured, or encrypted), `bookmarks` stays null until user opens drawer; user gesture calls `initBookmarks(filePath)` with password prompt.
4. `BrowserEditorModel.dispose()` calls `await this.bookmarks?.dispose()`.

Under EPIC-028 the lifecycle stays identical — the only piece that changes is the **interior of `BrowserBookmarks.init()`** (NH4) and the **interior of the drawer view** (NH5).

Candidate shapes:

(a) **Preserve lifecycle verbatim** — only the construction-of-LinkEditor pieces change (NH4 / NH5).

(b) **Eager-construct LinkEditor at BrowserEditorModel construction** — even if file isn't loaded yet. Adds an unused LinkEditor when no bookmarks are configured.

(c) **Refactor the lazy lifecycle into the `restore()` chain** — wait for first user gesture. Same as (a) shape, different code placement.

**RESOLVED 2026-05-20** — Option (a) confirmed. Today's lifecycle (timer-based silent preload + lazy on-demand init) is good Persephone behavior; it avoids blocking page open on bookmarks parsing. The EPIC-028 changes are surgical (replace `acquireViewModel` with `initialHost` construction; replace portal refs with `<View />` invocation). Rejected (b) — wastes memory when bookmarks aren't configured. Rejected (c) — would move lazy-init plumbing into framework lifecycle for one consumer.

### NH8 — `restore` / `getRestoreData` / `applyRestoreData` already EPIC-028-shaped

Today's `BrowserEditorModel` already overrides all three. Walking through each:

- `restore()` — calls `super.restore()`; sets title; no host adoption (no-host).
- `getRestoreData()` — returns `Partial<BrowserEditorState>` per the legacy IEditorState shape; merges `currentUrls` map into `data.tabs[].url`.
- `applyRestoreData(data)` — re-assigns fresh tab IDs, syncs top-level from active tab, restores Tor overlay state.

Under walkthrough 04 / P6 the return type of `getRestoreData()` becomes `EditorDescriptor` (not `Partial<S>` directly). Browser's override needs to return `{ editorId: "browser-view", id: this.id, state: {...} }` instead of the raw partial state.

Candidate shapes:

(a) **Wrap the partial state in EditorDescriptor** — `return { editorId: this.editorId, id: this.id, state: { ...10 fields } }`. Same internal logic; outer envelope changes.

(b) **Keep raw partial state** — backward-compat with today's caller shape. Breaks walkthrough 04 / P1.

**RESOLVED 2026-05-20** — Option (a) confirmed. Mechanical wrap to match P6's `EditorDescriptor` shape. No behavioral change. The `currentUrls` merge logic carries verbatim inside the `state` field. Rejected (b) — would diverge Browser from the EPIC-028 persistence contract.

### NH9 — Tor reconnect + window-close cleanup

Today's Tor lifecycle:
- `initTorProxy()` starts a Tor process via main-process IPC; subscribes to `TorChannel.log` events; shows overlay until connected.
- On `windowClosing` event, stops the Tor partition.
- On `dispose()`, also stops the Tor partition + clears HTTP cache.
- On `applyRestoreData(data)` with `data.isTor === true`, leaves overlay visible with "Reconnect" button — user re-initiates.

Under EPIC-028 the Tor flow doesn't touch any EPIC-028 lifecycle hook directly — it's a sub-flow inside the existing override list. Does it need any EPIC-028-specific change?

Candidate shapes:

(a) **No EPIC-028 changes to Tor flow** — today's logic carries verbatim. The `applyRestoreData → show-reconnect-overlay` path stays; the `dispose → stop Tor` path stays; the `windowClosing → stop Tor` path stays.

(b) **Move Tor reconnect into the `restore()` chain** — auto-reconnect on restore instead of requiring user gesture. UX regression — user lost ability to choose whether to restart Tor (which has performance/privacy implications).

**RESOLVED 2026-05-20** — Option (a) confirmed. Tor's manual-reconnect flow is intentional UX; today's pattern carries verbatim with no EPIC-028 touches. Rejected (b) — auto-reconnect on restart violates user expectation.

### NH10 — Registry `accepts()` + standalone category retirement

Today's registration is `category: "standalone"` + `editorType: "browserPage"`. Both retire:

- `category: "standalone"` → replaced by `!hasContentHost` flag per walkthrough 13 / MI3.
- `editorType: "browserPage"` → deleted per S10 (the `type` field no longer exists).

Browser's `accepts()` predicate returns `-1` unconditionally (never matches files — opens via explicit user gesture only). Browser is invisible in the switch widget per NH2.

Candidate shapes:

(a) **`accepts({ mode }) => -1` + drop `editorType` + drop `category`** — minimal predicate; matches MI3 + S10.

(b) **`accepts({ fileName, mode }): number` with `mode === "view" && fileName.match(/\.html$/)` returns 70** — let Browser be a preview target for `.html` files. Speculative — today's `.html` files open in Html preview editor; users have no expectation of Browser being a target.

**RESOLVED 2026-05-20** — Option (a) confirmed. Browser doesn't open files. Today's behavior is that users must explicitly create a Browser page (menu, hotkey, script). The `accepts()` returns `-1` keeps this exact behavior. Rejected (b) — would change today's file-open routing for `.html` files in a way the user didn't ask for; not a goal of EPIC-028.

---

# Section 2 — Compare

## State today

`src/renderer/editors/compare/CompareEditor.tsx` (113 LOC) is the entire compare implementation. It's a React component, NOT a registered EditorModel.

### Today's class shape

```typescript
class CompareEditorModel extends TComponentModel<null, CompareEditorProps> {
    didChangeSubscription: monaco.IDisposable | null = null;
    editor: monaco.editor.IStandaloneDiffEditor | null = null;

    editorDidMount = (editor) => {
        this.editor = editor;
        const modifiedEditor = editor.getModifiedEditor();
        this.didChangeSubscription = modifiedEditor.onDidChangeModelContent(() => {
            this.props.groupedModel.changeContent(modifiedEditor.getValue(), true);
        });
    };

    dispose() {
        this.didChangeSubscription?.dispose();
        this.editor?.dispose();
        this.editor = null;
    }
}

function CompareEditor({ model, groupedModel }: CompareEditorProps) {
    const editorModel = useComponentModel(props, CompareEditorModel, null);
    // ... renders DiffEditor with model.content + groupedModel.content
    // ... exit button calls model.setCompareMode(false); groupedModel.setCompareMode(false);
}
```

Two pieces:
1. **`CompareEditor`** — React component receiving `model: TextFileModel` and `groupedModel: TextFileModel` as props.
2. **`CompareEditorModel`** — `TComponentModel` (not `EditorModel`) — owns the Monaco `IStandaloneDiffEditor` instance + the modified-side change subscription.

### Today's invocation site

`Pages.tsx` line 84-113 detects compare mode and renders CompareEditor:

```tsx
const textEditor = editor && isTextFileModel(editor) ? editor : null;
const compareMode = useOptionalState(textEditor?.state as any, (s: any) => s.compareMode, false);
if (compareMode) {
    const { leftRight } = pagesModel.state.get();
    const rightId = leftRight.get(pageId);
    if (rightId) {
        const rightEditor = pagesModel.query.findPage(rightId)?.mainEditor;
        if (editor && rightEditor && isTextFileModel(editor) && isTextFileModel(rightEditor)) {
            return <CompareEditor model={editor} groupedModel={rightEditor} />;
        }
    }
    return null;  // right side of compare-mode group renders nothing
}
```

The activation is **driven by `model.state.compareMode` flag** today — walkthrough 06 / CK1 already resolved that this flag moves to `pagesModel.state.compareGroups: Set<string>` keyed by left page id.

---

## State after refactor

Per walkthrough 06 (CK1–CK10), the changes are all on the **caller side** of CompareEditor, not on CompareEditor itself:

1. **Activation** — read `pagesModel.state.compareGroups: Set<string>` (CK1) instead of `model.state.compareMode`.
2. **Detection helper** — `pagesModel.query.isInCompareMode(pageId): { active, leftId?, rightId? }` (CK5) returns the derived state.
3. **Entry / exit** — `pagesModel.enterCompareMode(pageId)` / `pagesModel.exitCompareMode(pageId)` (CK4) replace today's `model.setCompareMode(true/false)`.
4. **Predicate** — `pagesModel.query.canCompare(leftId, rightId)` (CK3) centralizes the `instanceof TextFileModel` check.
5. **Third prop** — `<CompareEditor model={editor} groupedModel={rightEditor} leftPageId={pageId} />` (CK10) — required for the exit button to call `pagesModel.exitCompareMode(leftPageId)`.

CompareEditor's **interior is unchanged** — DiffEditor mounting, modified-side change subscription, exit button JSX, all carry verbatim. The only edit to `CompareEditor.tsx` itself is replacing `model.setCompareMode(false); groupedModel.setCompareMode(false);` with `pagesModel.exitCompareMode(leftPageId);`.

```tsx
// CompareEditor.tsx — after refactor
function CompareEditor({ model, groupedModel, leftPageId }: CompareEditorProps) {
    // ... DiffEditor invocation unchanged ...
    <IconButton onClick={() => pagesModel.exitCompareMode(leftPageId)} ... />
}
```

### Pages.tsx after refactor

```tsx
function PageContent({ pageId }: { pageId: string }) {
    const page = pagesModel.query.findPage(pageId);
    if (!page) return null;
    page.state.use((s) => s.mainEditorId);
    const editor = page.mainEditor;

    // CK1: read from pagesModel.state.compareGroups instead of editor's state
    const compareGroups = pagesModel.state.use((s) => s.compareGroups);
    const { active, leftId, rightId } = pagesModel.query.isInCompareMode(pageId);

    if (active && pageId === leftId) {
        const rightEditor = pagesModel.query.findPage(rightId!)?.mainEditor;
        const leftHost = pagesModel.query.getTextFileHost(leftId!);
        const rightHost = pagesModel.query.getTextFileHost(rightId!);
        if (leftHost && rightHost) {
            return <CompareEditor model={leftHost} groupedModel={rightHost} leftPageId={leftId!} />;
        }
    }
    if (active && pageId === rightId) {
        return null;  // right side of compare-mode group renders nothing
    }

    // Regular page render
    return (...);
}
```

Three EPIC-028 helpers used:
- `pagesModel.state.use((s) => s.compareGroups)` — CK1.
- `pagesModel.query.isInCompareMode(pageId)` — CK5.
- `pagesModel.query.getTextFileHost(pageId)` — GK2 / T2 (the canonical TextFileModel accessor across 14 callsites).

---

## Concerns CP1–CP5 (Compare)

### CP1 — Confirm CompareEditor stays a React component, not an EditorModel

Per walkthrough 06 / CK2: "CompareEditor stays a React component — not a registered EditorModel". Today's code already enforces this — CompareEditor uses `TComponentModel`, not `EditorModel`; is not in `editorRegistry`; has no `editorId` / `accepts()` / `getRestoreData()`.

Candidate shapes:

(a) **Confirm + no change** — CK2's resolution holds. CompareEditor stays a React component; the Monaco diff editor lifecycle stays in `CompareEditorModel` (a `TComponentModel`).

(b) **Promote CompareEditor to a registered EditorModel** — would gain switch-widget visibility, descriptor persistence, etc. Loses the simplicity (CompareEditor is a transient view of two already-existing TextFileModel hosts).

**RESOLVED 2026-05-20** — Option (a) confirmed. CK2 stands. CompareEditor is not in the per-page state; it's a transient render of two already-existing hosts. Walkthrough 06 already chose this. Rejected (b) — would require manufacturing a synthetic page id, synthetic editor id, synthetic descriptor — none of which is meaningful for a compare view that's already represented by the `compareGroups` set.

### CP2 — Activation reads `pagesModel.state.compareGroups`, not `model.state.compareMode`

Per CK1 + CK6 + CK7: `compareMode` flag retires from TextFileModel; `pagesModel.state.compareGroups: Set<string>` is the new source of truth; `compareModeChanged` Subscription retires; `fixCompareMode` deletes (cleanup inlined into `ungroup` / `removePage` / `setMainEditor`).

Candidate shapes:

(a) **Per CK1 — read from `pagesModel.state.compareGroups`** — Pages.tsx subscribes to `pagesModel.state.use((s) => s.compareGroups)`; reactivity covered by single subscription on the unified pages state.

(b) **Keep `compareMode` flag on TextFileModel for backward compat** — adds dead state across the host that's not consumed anywhere else.

**RESOLVED 2026-05-20** — Option (a) confirmed. CK1 stands. The `compareMode` flag on TextFileModel was a duplicate of the `leftRight`/`rightLeft` parallel maps' truth state; consolidating to `compareGroups` removes the duplication. Rejected (b) — would leave orphaned state on TextFileModel for no consumer.

### CP3 — Exit compare via `pagesModel.exitCompareMode(leftPageId)`

Per CK4: `enterCompareMode(pageId)` / `exitCompareMode(pageId)` accept either side, resolve `leftId` internally, return boolean. The exit button on CompareEditor today calls `model.setCompareMode(false); groupedModel.setCompareMode(false);` which becomes `pagesModel.exitCompareMode(leftPageId)`.

Candidate shapes:

(a) **CompareEditor receives `leftPageId` as third prop (CK10) + exit button calls `pagesModel.exitCompareMode(leftPageId)`** — explicit prop, no derivation needed.

(b) **CompareEditor derives leftPageId from `pagesModel.query.findPageForEditor(model)`** — adds a lookup function with one consumer. Brittle when same TextFileModel is referenced from two pages (shouldn't happen, but the lookup needs to handle it).

**RESOLVED 2026-05-20** — Option (a) confirmed. CK10 stands. The prop is a thin string; passing it from PageContent (which already has pageId in scope) is one line. Rejected (b) — would add a new query helper for a single call site.

### CP4 — Internal `CompareEditorModel` (TComponentModel) — preserve

Today's `CompareEditorModel` is a `TComponentModel` (not `EditorModel`) that owns the Monaco `IStandaloneDiffEditor` instance and the modified-side change subscription. Under EPIC-028 does it need any change?

Candidate shapes:

(a) **Preserve verbatim** — TComponentModel is unrelated to EditorModel; the EPIC-028 changes don't touch this layer. The DiffEditor + change subscription lifecycle stays exactly as today.

(b) **Inline `CompareEditorModel` into the React component as `useEffect` + `useRef`** — loses the typed model class; harder to test.

**RESOLVED 2026-05-20** — Option (a) confirmed. TComponentModel is a different abstraction (React-mount-scoped state) than EditorModel (page-scoped persistent editor); they cohabit fine. Rejected (b) — would add complexity to a component that's already small (113 LOC).

### CP5 — Migration scope verification

Per walkthrough 06 / CK summary the real-code rewrites are:
- `PagesModel.ts` — add `compareGroups: Set<string>` field, remove `rerender` field + `rerender()` method.
- `PagesLayoutModel.ts` — add `enterCompareMode` / `exitCompareMode`, remove `fixCompareMode`, fold cleanup into `ungroup`.
- `PagesQueryModel.ts` — add `canCompare(leftId, rightId)` + `isInCompareMode(pageId)`.
- `PagesLifecycleModel.ts` — `openDiff` rewrite (compose `groupTabs + enterCompareMode`); `removePage` cleanup hook.
- `PageModel.ts` — `setMainEditor` cleanup hook.
- `events.ts` — delete `compareModeChanged`.
- `Pages.tsx` — `PageContent` + `Pages` reads use CK1 source.
- `TextToolbar.tsx` — Compare button calls `pagesModel.enterCompareMode(pageId)`.
- `CompareEditor.tsx` — accepts `leftPageId` prop, exit calls `exitCompareMode(leftPageId)`.
- `TextEditorModel.ts` + `TextFileActionsModel.ts` — drop `compareMode` field + `setCompareMode` method.

Candidate shapes:

(a) **Confirm migration scope above is complete** — no additions needed.

(b) **Add a migration shim for old persisted `compareMode` flags** — there are no persisted compare states per CK9 ("persistence dropped — main window's tray-hide design covers in-memory survival"), so no migration shim is needed.

**RESOLVED 2026-05-20** — Option (a) confirmed. Migration scope is complete per walkthrough 06; CK9 already established that persistence isn't part of the contract (the main window survives in tray, so the in-memory `compareGroups` is sufficient). Rejected (b) — would add complexity for a state that was never persisted.

---

# Section 3 — Explorer

## State today

`src/renderer/editors/explorer/` is a 4-file folder:

| File | LOC | Role |
|------|-----|------|
| `ExplorerEditorModel.ts` | 206 | EditorModel subclass (secondary-only) |
| `ExplorerSecondaryEditor.tsx` | 155 | Renders the file tree in the navigator panel |
| `SearchSecondaryEditor.tsx` | 57 | Renders the search panel |
| `index.ts` | 2 | Exports |

### Today's class shape

```typescript
class ExplorerEditorModel extends EditorModel<ExplorerEditorModelState> {
    treeProvider: ITreeProvider | null = null;
    treeState: TreeProviderViewSavedState | undefined = undefined;
    readonly selectionState = new TOneState<NavigationState>({ selectedHref: null });
    readonly revealVersion = new TOneState({ version: 0 });
    searchState: FileSearchState | undefined = undefined;

    constructor(rootPath?: string) {
        super(new TComponentState(getDefaultExplorerEditorModelState()));
        this.noLanguage = true;
        this.skipSave = true;
        if (rootPath) {
            this.state.update((s) => { s.rootPath = rootPath; });
        }
    }

    // setSelectedHref, setTreeState, openSearch, closeSearch, setSearchState, navigateUp, makeRoot
    // beforeNavigateAway (no-op — always survives)
    // onMainEditorChanged (highlight + reveal)
    // onPanelExpanded (reveal current file when explorer panel becomes active)
    // getRestoreData / applyRestoreData / restore / setPage / dispose
}
```

**One generic** — `EditorModel<ExplorerEditorModelState>` (no `R` second generic, no `E` third generic).

### Today's state shape

```typescript
interface ExplorerEditorModelState extends IEditorState {
    type: "fileExplorer";
    rootPath: string;
}
```

**Tiny.** Only `rootPath` on the main state. The interesting state is in three other places:
- `treeState: TreeProviderViewSavedState | undefined` — tree expansion state (private field; persisted via `_treeState` underscore-key in `getRestoreData()`).
- `selectionState: TOneState<NavigationState>` — selected href in the tree (reactive; persisted via `_selectedHref` underscore-key).
- `searchState: FileSearchState | undefined` — search panel state (private field; persisted via `_searchState` underscore-key).
- `revealVersion: TOneState<{ version: number }>` — counter that the secondary editor view subscribes to for reveal-current-file requests (transient — not persisted).

Plus one method-derived: `treeProvider: ITreeProvider | null` — lazily created on first tree render.

### Today's registration

```typescript
// NOT in editorRegistry. Constructed directly:
//   src/renderer/api/pages/PageModel.ts:256
async createExplorer(rootPath: string): Promise<EditorModel> {
    const { ExplorerEditorModel } = await import("../../editors/explorer");
    const explorer = new ExplorerEditorModel(rootPath);
    ...
}

// Two secondary-editor registrations:
secondaryEditorRegistry.register({
    id: "explorer",
    label: "Explorer",
    loadComponent: () => import("./explorer/ExplorerSecondaryEditor"),
});
secondaryEditorRegistry.register({
    id: "search",
    label: "Search",
    loadComponent: () => import("./explorer/SearchSecondaryEditor"),
});
```

**Secondary-only.** Explorer never appears in the main editor area; lives only in `secondaryEditors[]`. The `secondaryEditor` array on the model is `["explorer"]` or `["explorer", "search"]` depending on whether the search panel is open.

### Today's hook overrides

| Hook | Behavior |
|------|----------|
| `beforeNavigateAway(newModel)` | **No-op** — Explorer always survives navigation (sidebar-only) |
| `onMainEditorChanged(newMainEditor)` | If newMain has a filePath inside rootPath, set `selectionState.selectedHref` + bump `revealVersion`; else clear selection |
| `onPanelExpanded("explorer")` | Bump `revealVersion` to re-reveal the current file when user expands the panel |
| `setPage(page)` | On first attach to a page, initialize `secondaryEditor = ["explorer"]` (or `["explorer", "search"]` if search was open) |
| `restore()` | Same — initialize `secondaryEditor` array per `searchState` |
| `getRestoreData()` | Returns descriptor with `rootPath` + underscored extras (`_treeState`, `_selectedHref`, `_searchState`) |
| `applyRestoreData(data)` | Sets rootPath; restores tree state + selectedHref + searchState from underscored extras |
| `dispose()` | Disposes treeProvider |

**8 hook overrides.** Comparable to Browser's count (8–9), and one more than Notebook (~7 if you don't count overlapping hooks). Slightly less than Link's 11 because Explorer doesn't have CONTENT_HOST_TRAIT closure or adoptHost.

---

## State after refactor

`ExplorerEditorModel` becomes a no-host secondary-only EditorModel. Targeted edits:

```typescript
class ExplorerEditorModel extends EditorModel<ExplorerEditorModelState, void, ExplorerQueueEvent> {
    readonly editorId = "explorer";        // singleton-ish — see EX2 on construction
    noLanguage = true;

    treeProvider: ITreeProvider | null = null;
    readonly selectionState = new TOneState<NavigationState>({ selectedHref: null });
    readonly revealVersion = new TOneState({ version: 0 });

    private _treeState: TreeProviderViewSavedState | undefined = undefined;
    private _searchState: FileSearchState | undefined = undefined;

    constructor(state: TComponentState<ExplorerEditorModelState>) {
        super(state);
        // rootPath initialized via applyRestoreData (not constructor arg)
    }

    // ... same method bodies as today
}
```

Three changes vs. today:
1. **Constructor signature** flips from `(rootPath?: string)` to `(state: TComponentState<ExplorerEditorModelState>)` — matches the rest of EPIC-028's `create(state)` factory pattern. Initial `rootPath` flows through `applyRestoreData({ rootPath })` instead of being a constructor arg.
2. **`treeState` + `searchState` become private** (`_treeState` / `_searchState`) with explicit getters/setters; persistence path uses the `EditorDescriptor.state` underscore-extras pattern from today (no change there).
3. **Third generic `ExplorerQueueEvent`** for queue hookup per S4.

`PageModel.createExplorer(rootPath)` (today's direct-construction path) becomes:

```typescript
// In PagesLifecycleModel.addEmptyPageWithNavPanel — inlined per walkthrough 11 / EW5
const page = await this.addEmptyPage();
const explorer = new ExplorerEditorModel(new TComponentState({
    ...getDefaultExplorerEditorModelState(),
    rootPath: folderPath,
}));
await explorer.restore();
page.secondaryEditors.push(explorer);
explorer.secondaryEditor = ["explorer"];
explorer.setPage(page);
```

### Persistence

Explorer descriptor lives **inside `PageDescriptor.editors[]`** alongside the main editor (Monaco, or whatever). Distinguished by `editorId === "explorer"`:

```typescript
PageDescriptor {
    id: "page-1",
    mainEditorId: "monaco-abc",
    editors: [
        { editorId: "monaco", id: "monaco-abc", state: {...}, host: {...} },
        { editorId: "explorer", id: "exp-xyz", state: { rootPath, _treeState, _selectedHref, _searchState } },
    ]
}
```

Per walkthrough 04 / P5, the parallel `Promise.all` restore handles both — Monaco restores from one descriptor; Explorer restores from the other; no special-case logic.

---

## Concerns EX1–EX10 (Explorer)

### EX1 — Explorer as a no-host secondary-only EditorModel — confirm

Today: secondary-only EditorModel that never appears in mainEditor slot; lives in `secondaryEditors[]`. Under EPIC-028 does the unified-array (A8) model carry this verbatim?

Candidate shapes:

(a) **Confirm verbatim** — A8's unified `editors[]` array has `_mainEditorId: string | null` flag; Explorer simply never has `editor.id === _mainEditorId`, only ever satisfies the visibility criterion via `contributesPanels() === true`. The unified-array model already supports secondary-only editors; Explorer is the canonical example.

(b) **Promote Explorer to a special "secondary-only" subclass** — adds machinery to distinguish secondary-only from sidebar-owning-mainEditor editors. Unnecessary — both work via the same visibility criterion.

**RESOLVED 2026-05-20** — Option (a) confirmed. A8's unified-array model is general enough to cover both shapes (sidebar-owning mainEditor like Link + secondary-only EditorModel like Explorer). The single visibility criterion `(editor.id === _mainEditorId) || editor.contributesPanels()` covers both. Rejected (b) — speculative subclass adds no machinery the current contract doesn't already provide.

### EX2 — Constructor signature: `(rootPath?: string)` → `(state)`

Today's `ExplorerEditorModel` constructor takes a `rootPath?: string` arg (because Explorer is constructed directly, not via registry factory). Under EPIC-028 the unified factory shape is `(state: TComponentState<S>)` — does Explorer break this convention or align with it?

Candidate shapes:

(a) **Align with `(state)` convention** — `new ExplorerEditorModel(new TComponentState({ rootPath, ... }))`. Callers in `PagesLifecycleModel.addEmptyPageWithNavPanel` + bootstrap restore construct the state directly with the rootPath baked in.

(b) **Keep `(rootPath?)` shape** — Explorer is constructed by lifecycle methods, not registry factories; the divergence is harmless.

(c) **Hybrid — `(state)` + factory helper `createExplorerWithRoot(rootPath)`** — keeps a one-line caller surface AND aligns with the convention.

**RESOLVED 2026-05-20** — Option (a) confirmed. Explorer is the only no-host editor outside the registry, and its constructor diverging from the rest of EPIC-028 would be surprising. The state-bake-in shape works fine; lifecycle callers are already calling `getDefaultExplorerEditorModelState()` today, so adding `rootPath: folderPath` to the destructure is a one-line change. Rejected (b) — divergence with no upside. Rejected (c) — adds a helper for a single caller (only `addEmptyPageWithNavPanel` constructs Explorer outside bootstrap restore).

### EX3 — State slice partitioning

Today's persistence shape (10 fields visible across `state` + private fields + TOneStates):

- **`rootPath`** — persisted on `state.rootPath` (visible).
- **`treeState`** — persisted via underscore-extra `_treeState` (private field; not in state).
- **`selectionState.selectedHref`** — persisted via underscore-extra `_selectedHref` (TOneState).
- **`searchState`** — persisted via underscore-extra `_searchState` (private field; not in state).
- **`revealVersion.version`** — NOT persisted (transient counter).
- **`treeProvider`** — NOT persisted (recreated on restore).
- **Implicit: `secondaryEditor` array** — derived from `searchState` (`["explorer"]` or `["explorer", "search"]`) on restore.

Candidate shapes:

(a) **Keep today's underscore-extras pattern** — `getRestoreData()` returns `{ rootPath, _treeState, _selectedHref, _searchState }`. The underscore prefix marks fields-not-on-state-but-persisted.

(b) **Promote `treeState` + `selectedHref` + `searchState` to fields on `state`** — would make them reactive (`state.use((s) => s.treeState)`) but most consumers don't need reactivity (treeState only flows on save, searchState only on visibility change).

(c) **Drop underscore prefix; use proper field names in descriptor.state** — typed shape: `{ rootPath, treeState?, selectedHref?, searchState? }`. Cleaner type — eliminates the `as any` cast at `ExplorerEditorModel.ts:161-178` (today's code uses two `eslint-disable-next-line @typescript-eslint/no-explicit-any` casts to add underscore-prefixed extras).

**RESOLVED 2026-05-20** — Option (c) confirmed. Drop underscores; use a typed nested shape per EPIC-028's typed-descriptor philosophy. The `_treeState` / `_selectedHref` / `_searchState` underscores are a today-artifact of the IEditorState interface only allowing certain known fields — under EPIC-028 the `EditorDescriptor.state` is the editor's own typed shape (T generic), so typed extras are first-class. Drops two `as any` casts; matches Tier-5 typed-state convention (Grid, Link, Todo all have proper typed shapes for ride-state). Rejected (a) — preserves the today-artifact unnecessarily. Rejected (b) — promotes private state to reactive surface for no consumer; would force re-renders on save.

### EX4 — Persistence shape — typed extras, not underscore-prefix

Continuation of EX3: the `EditorDescriptor.state` shape becomes:

```typescript
interface ExplorerEditorModelState extends IEditorState {
    rootPath: string;
    treeState?: TreeProviderViewSavedState;
    selectedHref?: string | null;
    searchState?: FileSearchState;
}
```

But — `treeState` + `selectedHref` + `searchState` aren't naturally on the reactive `state` (today's design correctly keeps them as private fields + TOneStates because the secondary view subscribes to them through different reactive shapes). So the question is: do they go on `state` (forcing reactivity), or do they stay as private fields with `getRestoreData()` merging them into the returned `EditorDescriptor.state`?

Candidate shapes:

(a) **Stay as private fields + TOneStates; `getRestoreData()` merges them into the returned descriptor.state** — typed extras live on the returned descriptor but NOT on the reactive `state`. Same shape Link uses for its `restoreSelectionState` cache (pre-LK3 retirement) but cleaner.

(b) **Promote to fields on `state`** — see EX3 (b); rejected for reactivity reasons.

(c) **Stay underscore-prefixed** — see EX3 (a); rejected for type cleanliness.

**RESOLVED 2026-05-20** — Option (a) confirmed. Typed extras in the persistence shape, but the runtime carriers stay as today (private fields for treeState/searchState; TOneState for selectionState/revealVersion). The pattern is: **persistence shape ≠ runtime shape** — `getRestoreData()` is a typed bridge between them. Same pattern Grid uses for its sortColumn (lives on gridRef at runtime, lives in descriptor.state at persistence). Rejected (b) — would force reactivity for fields that don't need it. Rejected (c) — keeps the `as any` cast for no benefit.

### EX5 — `beforeNavigateAway` no-op + `onMainEditorChanged` highlight — second consumer after Link

Today's Explorer has the **two-hook recipe** Link uses (LK7 + LK8): `beforeNavigateAway` + `onMainEditorChanged`. But the BEHAVIOR is different:

- **Link** uses `beforeNavigateAway` to **conditionally drop panels** based on `contributesPanels()` discriminator (LK7).
- **Explorer** uses `beforeNavigateAway` as a **no-op** — Explorer ALWAYS survives navigation (it's a sidebar-only EditorModel; the only thing that disposes it is page close or user-driven panel close per N4).

Candidate shapes:

(a) **Confirm Explorer is the second consumer of the LK8 hook (`onMainEditorChanged`) but NOT the LK7 hook (`beforeNavigateAway`)** — Explorer's `beforeNavigateAway` no-op is the **default base-class behavior**; today's override is just an explicit "always survives" documentation. Recommendation: drop the override entirely — base class default is no-op anyway.

(b) **Keep `beforeNavigateAway` no-op override for documentation** — explicit "I always survive" annotation in code.

(c) **Reframe as "the LK8 hook recipe is generic; the LK7 hook is sidebar-owning-mainEditor-specific"** — Explorer demonstrates that LK8 (`onMainEditorChanged`) is independent of LK7 (`beforeNavigateAway`); they're two separate hooks that happen to both be used by Link but each has its own applicability scope. The first walkthrough that surfaces this clarification.

**RESOLVED 2026-05-20** — Options (a) + (c) confirmed. Drop the no-op `beforeNavigateAway` override (base class default suffices); document Explorer as the **second consumer of the LK8 hook** (the second instance of `onMainEditorChanged` after Link, confirming the hook is generic), but NOT the LK7 hook (`beforeNavigateAway` doesn't apply because Explorer isn't a sidebar-OWNING mainEditor — it's a sidebar-ONLY EditorModel that doesn't toggle between mainEditor and panel-only roles). **Reframes walkthrough 24's "LK7 + LK8 recipe" as two separable hooks.** Rejected isolated (b) — explicit no-op is noise.

### EX6 — `setPage` override — fits unified-array N1 lifecycle

Today's `ExplorerEditorModel.setPage(page)`:
```typescript
setPage(page: PageModel | null): void {
    super.setPage(page);
    if (page && this.rootPath && !this.secondaryEditor?.length) {
        this.secondaryEditor = this.searchState ? ["explorer", "search"] : ["explorer"];
    }
}
```

This sets the `secondaryEditor` array on first attach to a page. Under EPIC-028's unified-array + N1 slice-subscribe lifecycle (walkthrough 03), does this work?

Candidate shapes:

(a) **Preserve verbatim** — `setPage(page)` is part of the EditorModel base; setting `secondaryEditor` on first attach triggers N1's slice subscription on the next event-loop turn, which fires `onEditorPanelsChanged(this)` and bumps `state.version`. Same path Link uses to publish its panels.

(b) **Move into `restore()` instead** — would defer panel publication until restore completes; today's pattern publishes panels eagerly on attach.

**RESOLVED 2026-05-20** — Option (a) confirmed. `setPage` override fits the N1 lifecycle: setting `secondaryEditor` is a pure state mutation; the slice subscription handles the rest. Today's order (publish on attach) is correct because Explorer is constructed already-restored (no second-phase restore is needed for the panel publication). Rejected (b) — would create a window where Explorer is attached but doesn't yet publish panels; UI gap.

### EX7 — Self-close via `pageNavigatorModel.close()` — fits N4

Today's `ExplorerSecondaryEditor.tsx` close button calls `model.page?.pageNavigatorModel?.close()` (which closes the entire navigator panel). Under walkthrough 03 / N4, the close-button = "close the model" gesture pattern is `model.secondaryEditor = undefined`, which triggers the visibility criterion → detach + dispose via N1.

Candidate shapes:

(a) **Switch to N4 — close button calls `model.secondaryEditor = undefined`** — Explorer detaches + disposes per the unified-array lifecycle. Subsequent re-open via `addEmptyPageWithNavPanel` constructs a fresh Explorer.

(b) **Keep the today-pattern — close button closes the entire navigator panel** — affects all secondary editors on the page (search would also disappear). This is what today does.

(c) **Hybrid — close button calls `pageNavigatorModel.close()` which iterates `page.panelEditors` and sets each `secondaryEditor = undefined`** — N4 path applied N times.

**RESOLVED 2026-05-20** — Option (b) confirmed. Explorer's close-button is a **PageNavigator-level gesture**, not an "Explorer-level" gesture — it should close the whole sidebar, not just the Explorer tree (today's UX). Per walkthrough 03 / N4, the close button = "close the model" gesture applies to **panel header close buttons** (per-panel close affordance), not to a sidebar-wide close affordance. Explorer's "Close Panel" button in its header IS a sidebar-wide affordance (it closes the navigator panel entirely). N4's panel-header close button affordance is different — and Explorer's panel doesn't currently expose a per-panel close (only a sidebar-wide one). Keep today's behavior (sidebar-wide close); add a per-panel close-button gesture **separately** in a future walkthrough if there's demand. Rejected (a) — would change UX (currently the close button hides everything, not just Explorer). Rejected (c) — speculative; today's single-button-closes-all UX works.

### EX8 — `treeProvider` typed accessor — same shape as Link's LK9?

Today's `ExplorerEditorModel.treeProvider: ITreeProvider | null` is a public field, accessed by `findTreeProviderHost` (which today casts via `(editor as any).treeProvider` per Link's LK9 pre-resolution). Per LK9 the cast retires across writer + reader because Link added a typed accessor.

Candidate shapes:

(a) **Explorer's `treeProvider` field gets the same typed-accessor treatment as Link's LK9** — `findTreeProviderHost` becomes a typed `instanceof` chain over `LinkEditor → ArchiveEditor → ExplorerEditor`. Three editors expose `treeProvider` getter/field; the cast retires across all consumers.

(b) **Keep Explorer's `treeProvider` as today's public field; only Link uses the typed accessor** — partial migration.

(c) **Promote `treeProvider` to a base-class field on EditorModel** — extends LK9's typed-accessor to a base abstraction. Speculative — only three editors expose it.

**RESOLVED 2026-05-20** — Option (a) confirmed. Full migration. The `findTreeProviderHost` helper iterates the three editors via `instanceof` chain; Explorer joins Link + Archive as the third typed source. **Confirms LK9's recipe across three architectural shapes simultaneously** — Link as text-bearing host + Archive as no-host sidebar-owning + Explorer as no-host secondary-only. Rejected (b) — partial migration leaves an `as any` cast for one editor. Rejected (c) — would over-fit base class for one trait that only three editors expose; the `instanceof` chain at the helper site stays clean.

### EX9 — Search panel via `secondaryEditor = ["explorer", "search"]` array

Today's Explorer uses the array form of `secondaryEditor` to publish multiple panels — `["explorer"]` (tree only) or `["explorer", "search"]` (tree + search). Under EPIC-028's unified-array + N1 lifecycle, does the array form work?

Candidate shapes:

(a) **Preserve array form verbatim** — `secondaryEditor` setter takes `string | string[] | undefined`; N1's slice subscription fires on any change to the array; panels list updates per `editor.contributesPanels()`. Today's behavior carries.

(b) **Split into two EditorModels — `ExplorerTreeModel` + `ExplorerSearchModel`** — each owns one panel; lifecycle becomes two parallel publications. Doubles model count for one feature.

**RESOLVED 2026-05-20** — Option (a) confirmed. The array form of `secondaryEditor` is part of EPIC-028 (walkthrough 03 / N3 mentions `panelEditors` getter that iterates `editors[]` and inspects each's `secondaryEditor`). Explorer is the **canonical multi-panel example** — one EditorModel publishes two panels with related lifecycles (search opens within Explorer's rootPath; closing Explorer also closes search). Confirms the array-form works under unified-array. Rejected (b) — would scatter related state across two models; Explorer-internal coordination (search inheriting Explorer's rootPath) would need cross-model plumbing.

### EX10 — Direct construction site (`PageModel.createExplorer` → `addEmptyPageWithNavPanel` inlining)

Per walkthrough 11 / EW5: "Explorer creation stays direct construction — secondary-only editor not in main editor registry; today's `page.createExplorer` dissolves into lifecycle method."

Candidate shapes:

(a) **Per EW5 — inline `PageModel.createExplorer(rootPath)` into `PagesLifecycleModel.addEmptyPageWithNavPanel(folderPath)`** — explicit `new ExplorerEditorModel(state)` + `page.secondaryEditors.push(explorer)` + `explorer.setPage(page)` inside the lifecycle method.

(b) **Keep `PageModel.createExplorer` as a thin helper** — minimal change; lifecycle method still calls `page.createExplorer(folderPath)`.

(c) **Promote Explorer to a registered editor (in editorRegistry)** — would unify construction. But Explorer is secondary-only — it has no `accepts()` predicate, no switch-widget visibility, no main-editor slot. Registry membership would be semantically empty.

**RESOLVED 2026-05-20** — Option (a) confirmed. EW5 stands. `addEmptyPageWithNavPanel` is the only construction site outside bootstrap restore; inlining the four-line construction is clean. Removes the `PageModel.createExplorer` method (which is page-scoped state plumbing that doesn't belong on PageModel) — Explorer construction is a page-lifecycle concern, not a page-model concern. Rejected (b) — keeps a thin helper for one caller. Rejected (c) — speculative; Explorer has no main-editor identity to register.

---

## Mockup adjustments

**Zero mockup changes proposed.** All concerns (NH1–NH10, CP1–CP5, EX1–EX10) resolve at the real-code layer.

- Browser: lands as a no-host EditorModel under the same `EditorModel<S, R, E>` mockup; embedded LinkEditor reuses `EditorConstructorArgs.initialHost` (already in `mockups/EditorModel.ts` from walkthrough 04 / P6, confirmed by walkthrough 29 / NB7 as canonical).
- Compare: fully resolved by walkthrough 06 (CK1–CK10); no mockup involvement.
- Explorer: lands under the same unified-array (A8) + slice-subscribe (N1) + LK9-style typed-accessor + N4-aware-but-distinct close-button shape; no base-class change.

If the user agrees with the proposed recommendations, this would be the **eighth template-confirmation walkthrough in a row** (Grid + Preview group + Log View + Link + Todo + Rest Client + Notebook + No-host group) and the first to span three architecturally distinct shapes in a single walkthrough.

---

## Migration scope

Real-code only (carried to implementation):

### Browser

- **Edited files**:
  - `src/renderer/editors/browser/BrowserEditorModel.ts` — add `editorId = "browser-view"`; add third generic; wrap `getRestoreData()` return in `EditorDescriptor`; promote `bookmarksWidth` to persisted (NH3 (c)).
  - `src/renderer/editors/browser/BrowserBookmarks.ts` — flips from `acquireViewModel("link-view")` to `new LinkEditor({ initialHost: this.textFileHost })`; drop `releaseViewModel` call from dispose.
  - `src/renderer/editors/browser/BookmarksDrawer.tsx` — drops `swapLayout` + portal-ref props; renders `<bookmarks.linkEditor.View />` instead.
  - `src/renderer/editors/browser/BrowserEditorView.tsx` — adapts to the new BookmarksDrawer signature (mechanical).
  - `src/renderer/editors/register-editors.ts` — browser-view registration drops `editorType: "browserPage"` + `category: "standalone"`; adds `accepts: () => -1`.

- **Preserved verbatim**:
  - `BrowserWebviewModel.ts`, `BrowserUrlBarModel.ts`, `BrowserBookmarksUIModel.ts`, `BrowserTargetModel.ts` — sub-models unchanged.
  - All view sub-components: `BrowserTabsPanel.tsx`, `UrlSuggestionsDropdown.tsx`, `TorStatusOverlay.tsx`, `DownloadButton.tsx`, `BrowserDownloadsPopup.tsx`.
  - `BrowserEditorFacade.ts` — already wraps the EditorModel; methods preserved. `page.asBrowser(force?)` adds the SF1 parameter (force is always a no-op since Browser is not a switch target).
  - Tor flow + window-close cleanup + HTTP cache clearing — all preserved per NH9.

- **No new files**: zero.
- **No file deletes**: zero.

### Compare

- **Edited files** (per walkthrough 06 / CK migration scope, restated here):
  - `src/renderer/editors/compare/CompareEditor.tsx` — accepts `leftPageId` prop; exit button calls `pagesModel.exitCompareMode(leftPageId)`.
  - `src/renderer/ui/app/Pages.tsx` — `PageContent` reads `pagesModel.state.compareGroups`; uses `pagesModel.query.isInCompareMode(pageId)` + `pagesModel.query.getTextFileHost(pageId)`.

- **No new files**: zero.
- **No file deletes**: zero (CompareEditor stays).
- **Cross-walkthrough verification**: walkthrough 06's CK migration scope (`PagesModel`, `PagesLayoutModel`, `PagesQueryModel`, `PagesLifecycleModel`, `PageModel.setMainEditor`, `events.ts`, `TextToolbar`, `TextEditorModel`, `TextFileActionsModel`) is the broader real-code surface — this walkthrough only touches CompareEditor itself and Pages.tsx.

### Explorer

- **Edited files**:
  - `src/renderer/editors/explorer/ExplorerEditorModel.ts` — constructor flips to `(state)` shape; `treeState` + `searchState` become private with proper typed extras in descriptor.state; `getRestoreData()` returns `EditorDescriptor` with typed (not underscored) extras; drop the `beforeNavigateAway` no-op override (base default suffices).
  - `src/renderer/editors/explorer/ExplorerSecondaryEditor.tsx` — close button keeps today's "close entire panel" behavior (EX7 (b)); no change.
  - `src/renderer/editors/explorer/SearchSecondaryEditor.tsx` — no change.
  - `src/renderer/api/pages/PageModel.ts` — `createExplorer` method deletes (EW5 / EX10); migration shim at line 532 (today's "Migrate old format: rootPath at top level → create ExplorerEditorModel descriptor") moves to the new descriptor migration path per walkthrough 04 / C2 (no migration — old format triggers detect-and-skip; user re-opens explorer manually).
  - `src/renderer/api/pages/PagesLifecycleModel.ts` — `addEmptyPageWithNavPanel(folderPath)` inlines Explorer construction (4-line block per EX10).
  - `src/renderer/editors/link-editor/LinkEditor.ts` (when it lands per walkthrough 24) + `src/renderer/editors/archive/ArchiveEditor.ts` (when it lands) + `src/renderer/editors/explorer/ExplorerEditorModel.ts` — all expose typed `treeProvider` getter; `findTreeProviderHost` helper becomes `instanceof` chain over the three (EX8).

- **No new files**: zero.
- **No file deletes**: zero (Explorer files stay).

- **Persistence migration**: zero per C2 + P2 (today's underscored-extras shape and the new typed-extras shape are both inside `EditorDescriptor.state`; old persisted Explorer descriptors with underscored keys get detected per C2 and the page boots with empty content instead of restoring). User reopens explorer manually after the first post-EPIC-028 boot.

---

## Closure

All 25 concerns RESOLVED 2026-05-20. **Zero mockup changes.**

Final outcomes by concern:

### Browser (NH1–NH10)

| # | Resolution | Mockup change |
|---|------------|---------------|
| NH1 | (a) — `BrowserQueueEvent = { type: "focus" }` only; minimal queue matches Tier-5 calibration | none |
| NH2 | (a) — confirm no-host shape; absence of CONTENT_HOST_TRAIT IS the marker | none |
| NH3 | (a) + (c) — keep 10-field persisted boundary; promote `bookmarksWidth` to persisted (fifth instance of incidental fix) | none |
| NH4 | (a) — embedded LinkEditor via `EditorConstructorArgs.initialHost` (second consumer after Notebook NB7); `acquireViewModel` quartet fully retires from codebase | none |
| NH5 | (a) — render `<bookmarks.linkEditor.View />`; portal refs + `swapLayout` retire | none |
| NH6 | (a) — preserve four sub-models verbatim; sub-model boundary orthogonal to EditorModel boundary | none |
| NH7 | (a) — preserve lazy bookmarks lifecycle verbatim | none |
| NH8 | (a) — wrap return in `EditorDescriptor` per P6 (mechanical envelope) | none |
| NH9 | (a) — preserve Tor manual-reconnect flow verbatim | none |
| NH10 | (a) — `accepts({mode}) => -1` + drop `editorType` (S10) + drop `category: "standalone"` (MI3) | none |

### Compare (CP1–CP5)

| # | Resolution | Mockup change |
|---|------------|---------------|
| CP1 | (a) — confirm CompareEditor stays React component (CK2) | none |
| CP2 | (a) — activation reads `pagesModel.state.compareGroups` (CK1) | none |
| CP3 | (a) — `leftPageId` third prop + `exitCompareMode(leftPageId)` (CK4 + CK10) | none |
| CP4 | (a) — preserve internal `CompareEditorModel` (TComponentModel) verbatim | none |
| CP5 | (a) — walkthrough 06 / CK migration scope already complete; no shim per CK9 | none |

### Explorer (EX1–EX10)

| # | Resolution | Mockup change |
|---|------------|---------------|
| EX1 | (a) — confirm no-host secondary-only EditorModel under unified-array (A8); single visibility criterion covers both shapes | none |
| EX2 | (a) — constructor flips to `(state)` per EPIC-028 factory convention | none |
| EX3 | (c) — drop underscore-prefix; typed nested shape in `EditorDescriptor.state`; drops two `as any` casts | none |
| EX4 | (a) — persistence shape ≠ runtime shape; `getRestoreData()` is typed bridge | none |
| EX5 | (a) + (c) — drop no-op `beforeNavigateAway` override (base default suffices); reframe LK7 + LK8 as SEPARABLE hooks; Explorer is second consumer of LK8 but NOT LK7 | none |
| EX6 | (a) — `setPage` override fits N1 slice-subscribe lifecycle verbatim | none |
| EX7 | (b) — keep today's sidebar-wide close-button gesture (different from N4's per-panel close affordance) | none |
| EX8 | (a) — `treeProvider` typed `instanceof` chain over `LinkEditor → ArchiveEditor → ExplorerEditor`; confirms LK9's recipe across three architectural shapes | none |
| EX9 | (a) — preserve `secondaryEditor = ["explorer", "search"]` array form; Explorer is canonical multi-panel example | none |
| EX10 | (a) — per EW5; inline construction into `addEmptyPageWithNavPanel`; delete `PageModel.createExplorer` method | none |

**Eighth template-confirmation walkthrough in a row** — Grid + Preview group + Log View + Link + Todo + Rest Client + Notebook + No-host group. Tier 5 template + IContentHost mockup + unified-array (A8) + slice-subscribe (N1) + N4 close-button + LK7/LK8 separable hooks + LK9 typed-accessor + B2 contentHost getter + PT10 switch-widget visibility now confirmed stable across: (a) nine text-bearing editors with `CONTENT_HOST_TRAIT`; (b) two host implementations (TextFileModel + NoteItemEditModel); (c) two switch scopes (page-level + per-note); (d) three sidebar topologies (sidebar-owning Link / non-sidebar-owning Grid-Todo-RC-Notebook / secondary-only Explorer); (e) three no-host shapes (page-mainEditor Browser / not-an-EditorModel Compare / secondary-only Explorer).

**Cross-walkthrough cleanups landed by this walkthrough:**

- **NH3 (c)** — **fifth instance** of `leftPanelWidth`-equivalent silent-today-bug incidental fix (LK2 → TD2 → RC2 → NB2 → NH3 (c)). Pattern fully solidified: any field that lived on VM-state-but-never-persisted gets a free persistence upgrade when descriptor folding runs.
- **NH4** — `acquireViewModel` / `releaseViewModel` / `prepareViewModel` / `acquireViewModelSync` quartet **fully retired across the entire codebase**. The chain: SF2 (walkthrough 12) declared retirement; LV9 (walkthrough 23) retired `acquireViewModelSync` at `IContentHost.ts` interface + `TextEditorModel.ts:74` implementation; NB6 (walkthrough 29) retired the quartet at `NoteItemEditModel.ts:331` + deleted `ContentViewModelHost.ts` entirely; NH4 finishes by retiring the last external consumer in `BrowserBookmarks.init()`. Net codebase loses the ref-counted view-model machinery across **all consumers**.
- **EX5** — **reframes walkthrough 24's LK7 + LK8 recipe as two separable hooks.** Explorer demonstrates LK8 (`onMainEditorChanged`) WITHOUT LK7 (`beforeNavigateAway`); confirms the two hooks are independent capabilities; documents the architectural property that pay-only-when-used extends to per-hook granularity, not just per-feature.
- **EX8** — **LK9's typed-accessor recipe extends to three editors** across three architectural shapes simultaneously (text-bearing host Link + no-host sidebar-owning Archive + no-host secondary-only Explorer). The `(editor as any).treeProvider` cast retires across all consumers via typed `instanceof` chain. Confirms the recipe is fully general across the host/no-host axis AND the sidebar-topology axis.
- **EX2 / EX3** — Explorer aligns with EPIC-028's factory convention `(state)` AND drops two `as any` casts at `ExplorerEditorModel.ts:161-178` via typed `EditorDescriptor.state` extras. Last EditorModel constructor outside the registry now aligns with the in-registry shape.

**Implementation notes carried forward:**

- **Browser is the second consumer of `EditorConstructorArgs.initialHost`** — after Notebook NB7, with two consumers the canonical-injection-mechanism property is now confirmed across two distinct embedding patterns: per-note-variable (Notebook chooses editor type per note) vs. drawer-fixed (Browser always embeds LinkEditor). The property NB7 established — "host adoption at construction, not post-construction" — holds across both.
- **Explorer is the second consumer of `onMainEditorChanged` (LK8)** — confirms the hook is generic across two membership patterns: sidebar-OWNING-mainEditor (Link transitions in/out of mainEditor role) vs. sidebar-ONLY-EditorModel (Explorer never mainEditor). Reframes walkthrough 24's "recipe" as separable hooks; future text-bearing editors that own a sidebar can choose any subset of the LK7 + LK8 + LK9 hooks based on their membership pattern.
- **Compare is the canonical "not an EditorModel" pattern** — CompareEditor is a React component over two pre-existing TextFileModel hosts; internal `CompareEditorModel` (TComponentModel) handles Monaco DiffEditor lifecycle. Documents the architectural property that not every page-shape needs to be an EditorModel — transient views over already-existing content can stay as React components when their lifecycle is tied to React mount (not page identity).
- **Three architecturally distinct shapes in one walkthrough** — first time EPIC-028 covers three editor families in a single walkthrough; established the no-host-group pattern. Future walkthroughs covering multiple editors with shared no-host classification but distinct internal structures should follow the same shape (three concern blocks under one umbrella, with deferred-investigation note for the broader group).
- **No-host editors are two-to-three hooks lighter than text-bearing editors** — Browser ~8 hooks (no CONTENT_HOST_TRAIT, no adoptHost, no switchFrom), Explorer ~7 hooks (after EX5 drops no-op override), Compare 0 hooks (not an EditorModel). Versus Grid/Todo/RC's 9 hooks and Link's 11 hooks. The hook count cleanly tracks the EditorModel surface area each editor consumes.
- **Explorer is the canonical multi-panel example** (EX9) — one EditorModel publishes two panels (`["explorer", "search"]`) with related lifecycles (search opens within Explorer's rootPath; closing Explorer also closes search). Documents the `secondaryEditor: string | string[] | undefined` array-form contract via a concrete consumer; future multi-panel editors follow this pattern.

### Umbrella note for the remaining nine no-host editors

Per user direction (2026-05-20): the other nine no-host editors are deferred for design phase and will be investigated first-principles during implementation:

| Editor | Source folder | Expected fit |
|--------|---------------|--------------|
| PDF | `src/renderer/editors/pdf/` | Same shape as Browser — no-host EditorModel; opens `.pdf` files via `accepts()` predicate. |
| Image | `src/renderer/editors/image/` | Same shape — no-host EditorModel; opens image files. |
| Archive | `src/renderer/editors/archive/` | **Sidebar-owning no-host editor** — has `treeProvider` (per EX8's chain); per walkthrough 02 / S8 already has the `beforeNavigateAway` override (Archive demote-on-navigate). Closest in shape to Link. |
| Video | `src/renderer/editors/video/` | No-host EditorModel; opens audio/video files. |
| Settings | `src/renderer/editors/settings/` | Singleton-id no-host EditorModel; opens via `addEditorPage` / well-known-pages (per walkthrough 11 / EW3). |
| About | `src/renderer/editors/about/` | Same singleton-id shape as Settings. |
| MCP Inspector | `src/renderer/editors/mcp-inspector/` | No-host EditorModel; has its own state shape (request/response inspector). |
| Storybook | `src/renderer/editors/storybook/` | Singleton-id no-host EditorModel; dev-only surface. |
| Category | `src/renderer/editors/category/` | Aggregator editor — composes links from multiple `LinkEditor` siblings into one category-tree view; potentially has `treeProvider` (EX8 chain candidate). |

Each will read its source end-to-end during implementation; if its concerns mirror the standardized set (no-host EditorModel with `editorId` + `accepts()` + `getRestoreData()` returning `EditorDescriptor`), it lands without new walkthrough doc. If it surfaces novel concerns, they're logged in `concerns.md` at PR time per the established pattern from walkthroughs 27 / 28.

The walkthrough 30 doc covers the three editors with novel architectural questions (Browser's embedded-LinkEditor, Compare's not-an-EditorModel-ness, Explorer's secondary-only construction); the other nine are pattern instances.

---

**Status:** Done 2026-05-20. All 25 concerns RESOLVED. Eighth template-confirmation walkthrough in a row. Zero mockup changes. **EPIC-028 design phase is now complete** — all 30 walkthroughs landed (or deferred per documented skip-rationale).
