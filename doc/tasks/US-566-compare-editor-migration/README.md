# US-566 — Compare editor migration

> **EPIC-028 Phase C** · walkthrough 30 §2 (CP1–CP5) · walkthrough 06 (CK1–CK10).

## Goal

Verify the Compare-mode migration is complete and exercise the end-to-end flows in a running app. **No code changes are expected.** All architectural work — `compareMode` flag retirement, `compareGroups: Set<string>` placement on `PagesModel.state`, `enterCompareMode`/`exitCompareMode`/`canCompare`/`isInCompareMode`/`getTextFileHost` query helpers, `fixCompareMode` deletion + inline cleanup hooks, `openDiff` rewrite, V4 `TextChrome` Compare button, `Pages.tsx` render bridge, `CompareEditor` `leftPageId` prop, `compareModeChanged` Subscription + `pagesModel.rerender()` deletion — was completed during US-548 (PageModel adapter layer) and US-549 (shared chrome). This task closes the loop with a structured verification pass.

## Background

### Walkthrough 06 — pair-level placement (CK1–CK10)

`doc/epics/EPIC-028-editor-architecture/walkthroughs/06-compare-mode.md` resolved all ten concerns in 2026-05-19:

| Concern | Decision | Realized in |
|---------|----------|-------------|
| CK1 — storage location | `compareGroups: Set<string>` on `PagesModel.state`, keyed by left page id | `PagesModel.ts:24, 38` |
| CK2 — EditorModel vs React component | React component (not in `editorRegistry`) | `CompareEditor.tsx` — `TComponentModel` only |
| CK3 — compatibility check | `pagesModel.query.canCompare(leftId, rightId)` | `PagesQueryModel.ts:103–112` |
| CK4 — activation API | `pagesModel.layout.enterCompareMode(pageId)` / `exitCompareMode(pageId)` (accepts either side, resolves leftId internally) | `PagesLayoutModel.ts:221–262` |
| CK5 — render reads | `pagesModel.query.isInCompareMode(pageId): { active, leftId?, rightId? }` | `PagesQueryModel.ts:119–137` |
| CK6 — retire bridges | `compareModeChanged` + `pagesModel.rerender()` deleted | `events.ts` (deleted entry); `PagesModel.ts:37–38` (history comment) |
| CK7 — retire `fixCompareMode` | Inline cleanup in `ungroup` / `removePage` / `setMainEditor` | `PagesLayoutModel.ts:122–131`, `PagesModel.ts:136–148`, `PageModel.ts:384–396` |
| CK8 — `openDiff` rewrite | Compose `groupTabs + enterCompareMode` | `PagesLifecycleModel.ts:697–698` |
| CK9 — persistence | Don't persist (main window tray-hides; secondary-window loss is rare-edge) | `WindowState` unchanged |
| CK10 — exit-button wiring | `CompareEditor` receives `leftPageId` prop | `CompareEditor.tsx:14, 94` |

### Walkthrough 30 §2 — confirmations (CP1–CP5)

All five concerns were resolved 2026-05-20 to the **(a) preserve / confirm** option:

- **CP1** — CompareEditor stays a React component (`TComponentModel`, not `EditorModel`); not in `editorRegistry`.
- **CP2** — Activation reads from `pagesModel.state.compareGroups`; the `compareMode` flag on `TextFileEditorModelState` is deleted.
- **CP3** — Exit calls `pagesModel.exitCompareMode(leftPageId)`.
- **CP4** — Internal `CompareEditorModel` (`TComponentModel`) preserved verbatim — Monaco `IStandaloneDiffEditor` lifecycle + modified-side `onDidChangeModelContent` subscription are unchanged.
- **CP5** — Migration scope verification — all caller-side rewrites are in place.

### Today's state — already at the post-refactor shape

**`CompareEditor.tsx` (113 LOC) — final shape**:

```tsx
interface CompareEditorProps {
    model: TextFileModel;
    groupedModel: TextFileModel;
    /** The left page's id — needed to exit compare mode on the pair. CK10. */
    leftPageId: string;
}

class CompareEditorModel extends TComponentModel<null, CompareEditorProps> {
    // Monaco IStandaloneDiffEditor + modified-side change subscription. Verbatim.
}

export function CompareEditor({ model, groupedModel, leftPageId }: CompareEditorProps) {
    // ... DiffEditor invocation ...
    <IconButton
        title="Exit Compare Mode"
        onClick={() => pagesModel.exitCompareMode(leftPageId)}
        icon={<CompareIcon />}
    />
}
```

**`Pages.tsx#PageContent` — final shape** (`Pages.tsx:81–138`):

```tsx
function PageContent({ pageId }: { pageId: string }) {
    pagesModel.state.use();                       // CK5 — react to compareGroups
    const page = pagesModel.query.findPage(pageId);
    if (!page) return null;
    const compareInfo = pagesModel.query.isInCompareMode(pageId);

    if (compareInfo.active) {
        if (compareInfo.leftId === pageId && compareInfo.rightId) {
            const leftHost = pagesModel.query.getTextFileHost(compareInfo.leftId);
            const rightHost = pagesModel.query.getTextFileHost(compareInfo.rightId);
            if (leftHost && rightHost) {
                return <CompareEditor model={leftHost} groupedModel={rightHost} leftPageId={compareInfo.leftId} />;
            }
        }
        return null;                              // right side or missing host
    }
    // ... regular page render ...
}
```

**V4 `TextChrome.CompareButton`** (`TextChrome.tsx:162–182`):

```tsx
function CompareButton({ model }: { model: EditorModel }) {
    const ownerPage = model.page;
    if (!ownerPage) return null;
    pagesModel.state.use((s) => ({ leftRight: s.leftRight, rightLeft: s.rightLeft }));
    const leftGroupedPage = pagesModel.getLeftGroupedPage(ownerPage.id);
    if (!leftGroupedPage) return null;
    if (!pagesModel.canCompare(leftGroupedPage.id, ownerPage.id)) return null;
    return (
        <IconButton
            title="Compare with Left Page"
            onClick={() => pagesModel.enterCompareMode(ownerPage.id)}
            icon={<CompareIcon />}
        />
    );
}
```

### Why this task is verification-only

US-548's commit message (26ecc8d) explicitly lists every CK item:

> PagesModel: `compareGroups: Set<string>` keyed by left page id (CK1). … `rerender()` and `compareModeChanged` Subscription deleted (CK6).
> PagesLayoutModel: `enterCompareMode`/`exitCompareMode`/`canCompare` (CK3/CK4). `fixCompareMode` deleted; `ungroup` carries compare cleanup (CK7).
> PagesQueryModel: … new `canCompare`/`isInCompareMode`/`getTextFileHost` (CK3/CK5/GK2).

The reason it landed there (instead of waiting for US-566) is that compare-mode is **infrastructure for grouped pages, not an editor migration** — there is no Tier-5 `CompareEditor extends EditorModel` to write, no `editorRegistry` entry to register, no `wrapLegacyForPage` branch, no `asCompare` facade, no host-slot HS1 pattern. The "Compare editor" is a React composition over two already-migrated `TextFileModel` hosts, and its caller-side wiring had to land alongside the v4 PageModel surface that US-548 introduced.

US-549 (shared chrome) then moved the toolbar Compare button into V4 `TextChrome` — completing the activation surface.

The walkthrough 30 §2 (CP1–CP5) deliberately phrased every option as **"preserve / confirm"** — recognizing that the work was already done. US-566 is the formal verification + smoke-test pass.

---

## Implementation plan

### Phase 1 — Static verification (read-only)

Confirm every CK/CP wiring is intact by reading the named files:

1. **CK1** — `PagesModel.ts:24` has `compareGroups: new Set<string>()` in default state.
2. **CK3** — `PagesQueryModel.ts:103–112` `canCompare(leftId, rightId)` checks both pages exist, are grouped together, and both have `TextFileModel` hosts.
3. **CK4** — `PagesLayoutModel.ts:221–243` `enterCompareMode(pageId)` resolves leftId, checks `canCompare`, adds to set. `PagesLayoutModel.ts:248–262` `exitCompareMode(pageId)` resolves leftId, removes from set.
4. **CK5** — `PagesQueryModel.ts:119–137` `isInCompareMode(pageId)` returns `{ active, leftId?, rightId? }`. `PagesQueryModel.ts:81–100` `getTextFileHost(pageId)` returns the host (unwrapping `LegacyEditorAdapter`).
5. **CK6** — `grep -r compareModeChanged src/renderer` returns only the history comment at `PagesModel.ts:37`. `pagesModel.rerender` is absent.
6. **CK7** — `PagesLayoutModel.ts:122–131` (`ungroup`), `PagesModel.ts:136–148` (`removePage`), `PageModel.ts:384–396` (`setMainEditor`) all carry inline cleanup. `fixCompareMode` is absent.
7. **CK8** — `PagesLifecycleModel.ts:697–698` `openDiff` composes `groupTabs + enterCompareMode`. No direct `state.update(s => s.compareMode)` mutation.
8. **CK10** — `CompareEditor.tsx:14` declares `leftPageId: string`; `CompareEditor.tsx:94` calls `pagesModel.exitCompareMode(leftPageId)`.
9. **CP1** — `CompareEditor.tsx:17` `CompareEditorModel extends TComponentModel`. `register-editors.ts` has no `compare-editor` entry; `compare/index.ts` has no `EditorModule` export.
10. **CP2** — `TextFileEditorModelState` in `TextEditorModel.ts:19–36` does not contain `compareMode`. `TextFileActionsModel.ts` does not contain `setCompareMode`.
11. **CP3** — `CompareEditor.tsx:93–95` exit button calls `pagesModel.exitCompareMode(leftPageId)`.
12. **CP4** — `CompareEditorModel.editorDidMount` at `CompareEditor.tsx:21–30` is byte-identical to the pre-refactor implementation (Monaco `onDidChangeModelContent` → `props.groupedModel.changeContent`).

### Phase 2 — Smoke tests (manual, in a running dev app)

1. **`app.openDiff` path** — call `await app.pages.openDiff({ firstPath, secondPath })` from a script. Verify both pages open, group together, enter compare mode, and Monaco DiffEditor renders the diff.
2. **Toolbar Compare button** — open two unrelated files; group them via tab drag. The CompareIcon button appears on the right page's TextChrome. Click it → CompareEditor takes over the layout (left page's slot paints the diff; right page's slot is blank).
3. **Exit button** — click the CompareIcon inside CompareEditor's toolbar → returns both pages to their normal Monaco view; the `compareGroups` set drops the leftId.
4. **Ungroup cleanup (CK7 — `ungroup`)** — enter compare mode, then drag-out one of the pages. The grouping dissolves AND compare mode exits automatically (no orphaned `compareGroups` entry).
5. **Close-page cleanup (CK7 — `removePage`)** — enter compare mode, then close one of the pages via the tab X. Compare mode exits; the surviving page returns to its normal Monaco view.
6. **Main-editor swap cleanup (CK7 — `setMainEditor`)** — enter compare mode, then on one side switch the editor to a non-text editor (e.g., grid-json on a `.json` file or markdown-preview on a `.md`). Compare mode exits because the new editor's host isn't a `TextFileModel`.
7. **Tray-hide survival (CK9 in-memory contract)** — enter compare mode; minimize the main window to tray; restore the window. Compare mode is still active (no persistence, but in-process state survives).

### Phase 3 — Dashboard

- Mark US-566 unchecked `[ ]` on `doc/active-work.md` (implemented-but-unreviewed under EPIC-028 Phase C epic-task model).
- Add the *(verification complete YYYY-MM-DD, no code changes — all work landed in US-548 + US-549)* note to the entry so future readers know to skip ahead.

No `/review` / `/document` / `/userdoc` runs are triggered now — they defer to EPIC-028 close per the project's epic-task workflow.

---

## Concerns

### CP-IMPL1 — Redundant `useEffect dispose` in `CompareEditor.tsx`

`CompareEditor.tsx:56–60`:

```tsx
useEffect(() => {
    return () => {
        editorModel.dispose();
    };
}, []);
```

`useComponentModel`'s `onUnmountInternal` (`model.ts:188–198`) already calls `dispose()` on unmount. So `editorModel.dispose()` runs twice on unmount.

The `dispose()` implementation:

```ts
dispose() {
    this.didChangeSubscription?.dispose();   // null after first call
    this.editor?.dispose();                  // null after first call
    this.editor = null;
}
```

Second call is a harmless no-op (both fields null-checked), but it's still wasted work and a latent confusion source.

**Resolution: DO NOT REMOVE.** CP4 resolves to "preserve verbatim" — the walkthrough explicitly rejected interior changes. Even though this looks like minor cleanup, removing it widens the scope past CP4. Leave it for a future targeted refactor or fold it into EPIC-028 closure cleanup (US-559).

If user wants to remove it as part of US-566, the change is one-line:

```diff
- useEffect(() => {
-     return () => {
-         editorModel.dispose();
-     };
- }, []);
```

### CP-IMPL2 — Subscribe-to-everything in `Pages.tsx#PageContent`

`Pages.tsx:84`:

```tsx
pagesModel.state.use();   // subscribes to ALL state changes
```

This is a broad subscription (any `pagesModel.state` mutation triggers re-render), used so `compareGroups` mutations propagate. The comment above it (`Pages.tsx:82–83`) explains the intent.

A tighter selector (`pagesModel.state.use((s) => s.compareGroups)`) would re-render only on compareGroups changes — but `PageContent` is one component per page, and `state.use()` in this position only triggers React re-render (the per-pageContent work is cheap).

**Resolution: ACCEPT AS-IS.** The current broad subscription was deliberately chosen during US-548 (commit 26ecc8d) — it matches `Pages` (the parent) which destructures `{ pages, leftRight, compareGroups } = pagesModel.state.use()`. Narrowing inside `PageContent` would create a subscription-pattern asymmetry between parent and child without functional gain.

### CP-IMPL3 — `getTextFileHost` runtime cost in PageContent

`Pages.tsx:106–107` calls `pagesModel.query.getTextFileHost()` twice per render whenever the page is in compare mode. Each call walks `mainEditorV4`, checks `LegacyEditorAdapter`, then reads `contentHost`.

**Resolution: ACCEPT AS-IS.** Compare mode is the rare path (not the hot path), and the call is cheap (two field reads + an instanceof). Memoization would add complexity for negligible gain.

### CP-IMPL4 — No persistence (CK9) — confirmation

CK9 chose **(c) don't persist**. Verify by reading `PagesPersistenceModel.ts` and `PersistenceTypes.ts:WindowState` — there should be NO `compareGroups` field.

**Expected:** Confirmed during Phase 1 static verification. If a `compareGroups` field accidentally appears, that's a bug to fix (delete it; rely on tray-hide in-memory survival per CK9).

### CP-IMPL5 — No edge case for "both pages in compare mode but `mainEditorV4` is not yet ready"

`PageContent` reads `pagesModel.query.getTextFileHost()` synchronously. If the page's `mainEditorV4` is null mid-attach (transient state), the function returns null, and PageContent renders nothing for the compare-mode path. The next render cycle (when `mainEditorV4` is attached) re-evaluates and paints the diff.

**Resolution: ACCEPT AS-IS.** This is the same defensive pattern `TextEditorView.tsx:21–25` uses ("Defensive — should not happen post US-548"). The transient null is harmless: blank for one frame, then the diff appears.

### CP-IMPL6 — `TextEditorView.tsx` shim retirement

`TextEditorView.tsx:14` says: *"this shim retires with US-558's RenderEditor collapse."* That hasn't happened yet (US-558 was the Browser migration, not the RenderEditor collapse). The shim still exists.

**Resolution: NOT IN SCOPE.** US-566 doesn't touch `TextEditorView.tsx`. The shim retirement is part of the EPIC-028 closure cleanup (US-559).

### CP-IMPL7 — Validating CompareEditorModel's `props.groupedModel` reactivity

`CompareEditor.tsx:24–29`:

```ts
editorDidMount = (editor) => {
    this.didChangeSubscription = modifiedEditor.onDidChangeModelContent(() => {
        const newValue = modifiedEditor.getValue();
        this.props.groupedModel.changeContent(newValue, true);
    });
};
```

The callback captures `this`, not `props.groupedModel` directly. So `this.props.groupedModel` resolves at *call time* to whatever `useComponentModel` last wrote via `setPropsInternal` (`model.ts:173–178`).

**Resolution: VERIFIED CORRECT.** The closure pattern correctly tracks prop changes. If `groupedModel` ever changes mid-lifecycle (which doesn't happen in practice — CompareEditor is mounted with a stable pair), the next typed change would write to the new groupedModel.

### CP-IMPL8 — Possible scope creep — TextEditorView, ActiveEditor, TextChrome's leftToolbarContributions

Reading `TextChrome.tsx`, the `CompareButton` is rendered unconditionally as a `rightToolbarContribution`. There's no opt-out mechanism for editors that shouldn't show it (e.g., a Markdown preview pane might not need compare). Today, `CompareButton` self-guards via `getLeftGroupedPage` + `canCompare` — so the button just doesn't render for non-text or ungrouped pages.

**Resolution: ACCEPT AS-IS.** The self-guard is sufficient; no editor-level opt-out needed.

### CP-IMPL9 — Cross-window transfer + compare pair

CK9 closure: *"cross-window transfer of a compare pair is impossible by design (both pages can't be dragged simultaneously)"*. Need to verify what happens if a user enters compare mode, then drags ONE of the two pages into another window. Expected: ungroup happens during `movePageOut`, compareGroups cleanup fires automatically (CK7 via `ungroup`).

**Resolution: VERIFIED VIA CK7 INLINE CLEANUP.** `PagesLayoutModel.ungroup()` (line 122–131) drops the `compareGroups` entry as part of ungroup, regardless of WHY ungroup was called (close, drag-out, etc.). The "move-out + compareGroups cleanup" chain is already covered.

### CP-IMPL10 — Edge case: V4-native MonacoEditor on one side, legacy on the other

`getTextFileHost` (`PagesQueryModel.ts:81–100`) handles both `LegacyEditorAdapter`-wrapped and v4-native hosts. The `canCompare` check at lines 110–111 calls `getTextFileHost` for both sides. So a pair where left is legacy text + right is v4 Monaco (or vice versa) is supported.

**Resolution: VERIFIED CORRECT.** Both flavors of `TextFileModel` resolve through the same helper.

---

## Files Changed

**Expected: NONE.** All migration code landed in US-548 + US-549. US-566 is verification only.

If any of the Phase 1 static checks fails (e.g., a regression introduced by a later task accidentally re-introduced `compareModeChanged` or removed `getTextFileHost`), file specific fixes. The expected outcome is zero changes.

| File | Status | Notes |
|------|--------|-------|
| `doc/tasks/US-566-compare-editor-migration/README.md` | **NEW** | This task document |
| `doc/active-work.md` | **MODIFIED** | Update US-566 entry to verification-complete |
| All source files | **UNCHANGED** | Verification reveals existing wiring is correct |

---

## Acceptance criteria

1. Phase 1 static checks (CK1, CK3–CK10, CP1–CP4) all PASS.
2. Phase 2 smoke tests 1–7 all PASS:
   - `app.pages.openDiff()` opens + groups + enters compare.
   - Toolbar Compare button enters compare from a grouped pair.
   - Exit button exits compare cleanly.
   - Ungroup auto-exits compare.
   - Close-page auto-exits compare.
   - Main-editor swap away from text auto-exits compare.
   - Tray-hide preserves compare (in-memory survival).
3. Zero source-file changes (or only targeted fixes if a regression is found).
4. `doc/active-work.md` entry updated with verification-complete note.
5. Task stays unchecked `[ ]` on the dashboard per the EPIC-028 epic-task review model.

---

## Files NOT changing

These are foundation pieces touched by US-548 / US-549; US-566 reads but does not modify:

- `src/renderer/api/pages/PagesModel.ts` (compareGroups state field + delegate methods)
- `src/renderer/api/pages/PagesLayoutModel.ts` (enterCompareMode / exitCompareMode / ungroup cleanup)
- `src/renderer/api/pages/PagesQueryModel.ts` (canCompare / isInCompareMode / getTextFileHost)
- `src/renderer/api/pages/PagesLifecycleModel.ts` (openDiff rewrite + removePage cleanup)
- `src/renderer/api/pages/PageModel.ts` (setMainEditor CK7 cleanup hook)
- `src/renderer/api/pages/PagesPersistenceModel.ts` (no compareGroups field — CK9)
- `src/renderer/core/state/events.ts` (compareModeChanged deleted)
- `src/renderer/ui/app/Pages.tsx` (PageContent + Pages reads from compareGroups)
- `src/renderer/editors/base/v4/TextChrome.tsx` (CompareButton)
- `src/renderer/editors/text/TextEditorModel.ts` (no compareMode field in state)
- `src/renderer/editors/text/TextFileActionsModel.ts` (no setCompareMode method)
- `src/renderer/editors/compare/CompareEditor.tsx` (leftPageId prop + exit wiring; CP4 preserved interior)
- `src/renderer/editors/compare/index.ts` (no EditorModule — CP1)
- `src/renderer/components/page-manager/AppPageManager.tsx` (compareModeIds prop preserved; source switched at caller per walkthrough 06)
- `src/renderer/components/page-manager/GroupContainer.ts` (compareMode DOM/layout method preserved unchanged)
- `src/renderer/ui/tabs/PageTab.tsx` (closeClick no longer calls fixCompareMode — CK7 comment at line 485)
- `src/renderer/editors/register-editors.ts` (no compare-editor entry — CP1)
