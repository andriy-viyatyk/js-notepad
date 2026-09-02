# US-1277: Delete the two 10 ms transition hacks

Epic: [EPIC-081 — DOM & IO mechanisms](../../epics/EPIC-081.md)

## Goal

Delete the two 10 ms CSS-transition workarounds. Inline the required forced style flush at the
single genuine transition site in `MenuBarView`, and remove the dead timer at the Bookmarks site
while preserving its once-per-open focus behavior and actual inline transform animation.

## Background

The current reviewed epic text describes `kickTransition` as a free function. The epic owner is
revising correction 1 because source review found only one genuine adopter; this task follows that
revision and keeps the forced flush inline so a one-call abstraction is not added.

Verified source at the current checkout (the epic's baseline is commit `d44ab072`):

- `src/renderer/ui/sidebar/MenuBarView.ts:227-249` toggles `doDisplay`, whose CSS changes the
  root from `display: none` to `display: block`, then waits 10 ms before adding `open`.
- `src/renderer/ui/sidebar/MenuBar.css:2-29` applies the transition to
  `.menu-bar-backdrop .menu-bar-content`; its initial transform is `translateX(-100%)`, and
  `.menu-bar-backdrop.open .menu-bar-content` changes it to `translateX(0)`.
- `src/renderer/editors/browser/BookmarksDrawer.ts:30,48-49` instead uses a timer to write
  `this.panel.dataset.open = ""`; a repository search finds no CSS selector or other consumer of
  that attribute. The drawer's real transition is the inline `transform` transition assigned to
  `panelWrap` at line 37. No BookmarksDrawer co-located CSS file exists, and the transform is set
  synchronously at line 49, so this site does not need a transition kick.

Before:

```ts
this.animationTimer = window.setTimeout(() => {
    this.animationTimer = undefined;
    if (!this.live) return;
    this.root.classList.add("open");
}, 10);
```

After:

```ts
// Flush the display change before adding `open`, or the opening transform can be skipped.
this.root.getBoundingClientRect();
this.root.classList.add("open");
```

Bookmarks before:

```ts
if (props.open && !this.animationTimer) {
    this.panel.focus();
    this.animationTimer = setTimeout(() => {
        this.panel.dataset.open = "";
        this.animationTimer = undefined;
    }, 10);
}
if (!props.open) delete this.panel.dataset.open;
```

Bookmarks after:

```ts
const shouldFocus = props.open && !this.hasFocusedOpen;
if (props.open) this.hasFocusedOpen = true;
if (!props.open) this.hasFocusedOpen = false;
if (shouldFocus) this.panel.focus();
```

The Bookmarks site should lose its unused `animationTimer`, timer cleanup, and `data-open` write.
Because that field is also a once-per-open guard around focus, replace it with a boolean
`hasFocusedOpen` that is set on the open path and cleared in the `if (!props.open)` branch. This
preserves focus-once semantics when `sync()` is re-entered while open: `onUpdate()` calls `sync()`
for every parent prop update, and the width-zero callback can also cause a re-entry; the boolean is
set before that callback, so neither path refocuses a user who is typing. The actual Bookmarks
animation survives because `panelWrap.style.transition = "transform 80ms ease-in-out"` at line 37
and the `style.transform` toggle at line 49 remain; neither involves `data-open`.

## Implementation Plan

1. Update `src/renderer/ui/sidebar/MenuBarView.ts` in `updateOpenState()` to replace the 10 ms
   `window.setTimeout` block with an inline `this.root.getBoundingClientRect()` followed by
   `this.root.classList.add("open")`. Keep the nearby WHY comment: `doDisplay` changes the root
   from `display: none` to `display: block`, and the flush is what makes the subsequent transform
   transition observable. Remove `animationTimer`, its disposal cleanup, and the timer reset because
   this transition timer is its only use. Keep the close path's
   `this.root.classList.remove("open")`, and keep `doDisplay` toggling before the flush.

2. Update `src/renderer/editors/browser/BookmarksDrawer.ts` to remove the dead 10 ms timer,
   `animationTimer` field, timer cleanup, and `dataset.open` writes. Add
   `hasFocusedOpen = false`; compute `shouldFocus`, set the boolean before the width-zero
   `onChangeWidth` callback, clear it in the `if (!props.open)` branch, and call `this.panel.focus()`
   only when `shouldFocus` is true. Preserve `panelWrap`'s inline transition, transform toggle,
   width initialization, and close behavior.

3. Re-check `src/renderer/ui/sidebar/MenuBar.css` after the edit: `doDisplay` must still expose
   the root, and `open` must still be added only after the inline flush. Confirm that no Bookmarks
   CSS selector exists or becomes necessary and that the inline Bookmarks animation remains intact.

## Concerns

- The epic's original correction 1 called for a free helper, but the owner is revising it after
  confirming there is only one genuine adopter. This task records and follows that revision:
  inline the flush at `MenuBarView` rather than add a one-call helper.
- Current source disproves a genuine transition adopter at Bookmarks: it uses an unconsumed dataset
  attribute, not a class, and its real transition is already a direct inline `transform` change.
- `MenuBarView`'s `doDisplay` is toggled in both `applyRootState()` and `updateOpenState()`; retain
  that existing behavior and place the helper after the final toggle, before `open` is added.
- This task must not introduce a shared helper, colors, CSS tokens, a scheduler method, or tests.
  No CSS change is planned because `MenuBar.css` already expresses the required transition.

## Acceptance Criteria

- [x] `MenuBarView.updateOpenState()` keeps `doDisplay` and close removal behavior, has no 10 ms
  transition timer, and directly flushes `this.root.getBoundingClientRect()` before adding `open`.
- [x] `BookmarksDrawer.ts` has no dead `animationTimer`/10 ms dataset timer; its inline
  `panelWrap` transform transition remains unchanged and focus occurs once on each open edge,
  including when `sync()` re-enters while still open.
- [x] `MenuBar.css` still maps `doDisplay` to `display: block`, maps `open` to the content's
  `translateX(0)`, and retains the transition declaration.
- [x] No `kickTransition` helper, dataset-key variant, or class-name variant is added: there is one
  genuine adopter, and Bookmarks has no consumer for `data-open`.
- [x] No unit tests or test harnesses are added, and `doc/active-work.md` is not edited.

## Files Changed Summary

| File | Planned change | Scope |
|---|---|---|
| `src/renderer/ui/sidebar/MenuBarView.ts` | Replace the display-to-open 10 ms timer with an inline forced style flush and class add; remove its now-unused timer field/cleanup. | Implementation |
| `src/renderer/editors/browser/BookmarksDrawer.ts` | Remove the unused dataset timer and replace its focus guard with explicit once-per-open state while preserving the inline transform transition. | Dead-residue cleanup |
| `src/renderer/ui/sidebar/MenuBar.css` | No code change; verify the existing `doDisplay`/`open` transition contract. | No change planned |
| `doc/epics/EPIC-081.md` | No change; its reviewed correction remains authoritative. | No change |
| `doc/active-work.md` | No change per the request; the existing epic dashboard remains user-maintained. | No change |

Files that need **no changes** in US-1277:

- `src/renderer/uikit/shared/` — no transition helper is added after the epic's revised decision to
  inline the only genuine adoption site.
- Any Bookmarks stylesheet — none exists, and no selector consumes `data-open`.
- `src/renderer/theme/color.ts`, theme definitions, tests, and test harnesses — this task adds no
  visual token and the project has no unit-test requirement for this work.
