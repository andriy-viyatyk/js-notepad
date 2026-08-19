# US-995: Close the UIKit import boundary and lint Rule 6

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-054 — De-React Epic C1: Foundation and primitives](../../epics/EPIC-054.md)
**Created:** 2026-08-19

## Goal

Make roadmap Rule 6 executable: production code under `src/renderer/uikit/` must not import
application-layer modules from `api/`, `ui/`, `components/`, or the cross-process `shared/`
folder. Remove five current violations — four by relocation and one by a documented AVGrid
exemption — and add an ESLint rule that prevents the boundary from opening again.

The AVGrid context-menu integration remains a single, explicit exception until EPIC-054's C4
replacement removes AVGrid. This task changes no component behavior or public UIKit prop shape.

## Background

### Rule 6

The roadmap defines the intended dependency direction as:

```text
uikit/  ->  core/ and theme/
       X  api/, ui/, components/, src/shared/
```

UIKit is still React-backed in much of the codebase, so React and third-party UI libraries remain
valid imports. The boundary is specifically about application ownership: a reusable primitive
must receive app concepts through props/callbacks or consume a neutral core contract rather than
reaching upward into the application shell.

Stories are harnesses, not library code. They may import `editors/storybook`, `components/icons`,
or app event helpers to construct demonstrations. The lint rule must therefore exclude only
`*.story.ts` and `*.story.tsx` files under `src/renderer/uikit/`, while still covering every
production `.ts`/`.tsx` file.

### Current inventory

The production scan at EPIC-054 open found five imports above the boundary:

| File | Current import | Resolution | Reason |
|---|---|---|---|
| `src/renderer/uikit/ListBox/ListBoxModel.ts` | `../../api/events/events` → `ContextMenuEvent` | Move the neutral context-menu event bridge to `src/renderer/core/events/context-menu.ts`; keep the API path as a compatibility re-export. | `ListBoxModel` must add row menu items to the native-event context-menu envelope. |
| `src/renderer/uikit/Tree/TreeModel.ts` | `../../api/events/events` → `ContextMenuEvent` | Use the same core event bridge as `ListBoxModel`. | `TreeModel` has the identical row-menu responsibility. |
| `src/renderer/uikit/Menu/types.ts` | `../../api/types/events` → `MenuItem` | Re-export the neutral `MenuItem` descriptor from core. Keep the shipped `api/types/events.d.ts` declaration surface self-contained and unchanged. | This is a type-only dependency, but it still points the reusable library at the app API. |
| `src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx` | `../../../shared/utils` → `debounce` | Add a one-line renderer-core bridge that re-exports `debounce` from `src/shared/utils`, then change this one import. | `debounce` is a genuine cross-process utility with 20 consumers; its shared owner and all other consumers stay unchanged. |
| `src/renderer/uikit/AVGrid/model/ContextMenuModel.tsx` | `../../../ui/dialogs/poppers/showPopupMenu` → `showAppPopupMenu` | Keep unchanged and add a file-level, reasoned `import/no-restricted-paths` exemption stating that AVGrid is replaced by C4. | This is the one deliberate remaining violation; moving it now would couple this task to the superseded AVGrid UI. |

`ContextMenuEvent` extends `BaseEvent`, so the neutral extraction also moves the four-line base
class to `src/renderer/core/events/BaseEvent.ts` and leaves
`src/renderer/api/events/BaseEvent.ts` as a compatibility re-export. This is part of closing the
dependency, even though `BaseEvent` is not itself imported by a UIKit file today.

The scan must be repeated after the changes with stories excluded. No other production import is a
Rule 6 violation. Story-only imports are not candidates for conversion and must not be “fixed” by
pulling Storybook or demo data into core.

## Implementation plan

### 1. Create the framework-neutral context-menu contract

Add `src/renderer/core/events/context-menu.ts` as the single neutral owner for the shared menu
descriptor and the native-event context-menu envelope, and add
`src/renderer/core/events/BaseEvent.ts` as the neutral owner of the four-line base event class:

- move the structural `MenuItem` shape there without changing its fields or runtime behavior,
  including the existing `icon?: any` compatibility surface. Keep the one-line
  `@typescript-eslint/no-explicit-any` suppression on that field, with a comment pointing to the
  Epic C icon/slot work; do not widen the ESLint `any` exemption for all of core;
- move `ContextMenuTargetKind` there;
- move `ContextMenuEvent<T>` there, preserving `BaseEvent`/`handled`, `targetKind`, `target`,
  `items`, and `ContextMenuEvent.fromNativeEvent(...)` behavior;
- keep the helper framework-neutral. It should accept a native `MouseEvent` or a structural
  `{ nativeEvent: MouseEvent }` carrier, so existing React callers can keep passing their event
  without making the core module import React;
- preserve the expando identity on `nativeEvent.contextMenuEvent`. A row handler and the global
  context-menu handler must continue seeing the same event object and accumulated `items`.

Update the app-facing event/type files without breaking their existing import paths:

- `src/renderer/api/events/events.ts` imports and re-exports the neutral `ContextMenuEvent` and
  `ContextMenuTargetKind`; its runtime import from `api/types/events` goes away. `BookmarkEvent`
  remains app-owned and continues to use the compatibility re-export of `BaseEvent`.
- `src/renderer/api/events/BaseEvent.ts` re-exports the neutral `BaseEvent` so existing internal
  imports remain valid.
- `src/renderer/api/types/events.d.ts` and `assets/editor-types/events.d.ts` are shipped script
  typings and remain untouched. Their parallel `MenuItem` and `ContextMenuTargetKind` declarations
  are deliberate; structural typing keeps them compatible with the runtime contract, and the
  typings invariant forbids imports from runtime modules.
- `src/renderer/types/events.d.ts` points the native-event augmentation at the neutral event
  class, avoiding a core → API type cycle.
- `src/renderer/uikit/Menu/types.ts` re-exports `MenuItem` from the core contract, so
  `MenuItem` remains available from `uikit/Menu` and the root UIKit barrel exactly as before.
- `src/renderer/uikit/ListBox/ListBoxModel.ts` and `src/renderer/uikit/Tree/TreeModel.ts` import
  `ContextMenuEvent` directly from core. Their row and root handlers remain behaviorally
  unchanged.

The before/after boundary is therefore:

```ts
// Before: reusable models reach into the application event implementation.
import { ContextMenuEvent } from "../../api/events/events";

// After: the event envelope is a neutral renderer-core contract.
import { ContextMenuEvent } from "../../core/events/context-menu";
```

### 2. Add a renderer-core bridge for the shared debounce helper

Add `src/renderer/core/utils/debounce.ts` containing exactly the renderer bridge:

```ts
export { debounce } from "../../../shared/utils";
```

Change only `src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx` to import it from
`../../core/utils/debounce`. Leave `src/shared/utils.ts`,
`src/renderer/core/utils/file-watcher.ts`, and every other consumer untouched.

The helper's delayed execution, cancellation of the prior timeout, and optional `canRun` retry
behavior remain identical because the shared implementation and its 20 consumers do not move.
This is a boundary bridge, not an ownership migration; changing the shared utility's owner would
be a separate 20-call-site task.

### 3. Add the scoped Rule 6 ESLint boundary

Modify `eslint.config.mjs` with a dedicated flat-config block for production files below
`src/renderer/uikit/`, using the already-configured `eslint-plugin-import` path resolver:

- apply `import/no-restricted-paths` at error level with a zone targeting `./src/renderer/uikit`
  and `from` paths `./src/renderer/api`, `./src/renderer/ui`, `./src/renderer/components`, and
  `./src/shared`;
- rely on resolved filesystem paths rather than relative import-string depth. This distinguishes
  `uikit/shared/` from `src/shared/` at every nesting depth and remains correct if a future UIKit
  folder gains another level;
- exclude only `src/renderer/uikit/**/*.story.ts` and `src/renderer/uikit/**/*.story.tsx` from
  this rule; do not use a general directory disable;
- use a custom message that points authors to core/theme or a prop/callback boundary.

The rule must cover imports and re-exports, not only `import` declarations. It must also reject
type-only imports: a type dependency still couples the library to an app-owned contract. The
configured `eslint-plugin-import` resolver is the boundary check; do not add a second
string-pattern rule.

### 4. Record the single AVGrid exemption

Add a file-level `eslint-disable` immediately around the existing import in
`src/renderer/uikit/AVGrid/model/ContextMenuModel.tsx`, with a comment naming the exact reason:
the app popup menu is intentionally retained until EPIC-054 C4 replaces AVGrid. Disable only
`import/no-restricted-paths` around that import. Do not add a
blanket `eslint-disable` to AVGrid, `ContextMenuModel`, or the whole UIKit tree, and do not move
the popup-menu implementation into this task.

When C4 removes AVGrid, its exemption and the final Rule 6 count must disappear together.

### 5. Verify the boundary and compatibility

Run the lint rule itself as the boundary scan, rather than relying on a path-string grep:

```text
npm run lint        # Rule 6 is the resolved-path boundary scan
npm run typecheck
git diff --check
```

Also verify the behavior-bearing paths, not just the static scan:

- ListBox and Tree row context menus still accumulate items on the native event and the global
  handler still opens the same app menu;
- `MenuItem` remains assignable at `uikit/Menu`, the root `uikit` barrel, and the public API type
  declarations;
- RenderGrid resize behavior and file watching retain the old debounce timing;
- story files continue to lint and compile despite their harness imports;
- the lint rule reports a deliberately introduced forbidden import in a temporary check, while
  the AVGrid exemption is the only production suppression.

No component conversion, story rewrite, visual change, or new unit-test harness belongs in this
task.

## Concerns / Open questions

1. **Context-menu ownership crosses the current app API.** `ContextMenuEvent` is more than a type:
   it is the runtime object that carries menu items through a native-event expando. The plan moves
   that small contract into core and keeps the API module as a compatibility re-export so object
   identity and existing public imports survive. A simpler type-only alias would not work because
   `ListBoxModel` and `TreeModel` construct and mutate the event at runtime.

2. **The React carrier must remain a structural input, not a React dependency.** The existing
   callers pass `React.MouseEvent`, but the neutral helper should operate on `MouseEvent` or an
   object with `nativeEvent`. This is the bridge that lets current React components compile while
   leaving the core contract usable by the vanilla views that C1 and later epics will add.

3. **`MenuItem.icon` is deliberately not narrowed here.** Existing callers pass React elements,
   icon names, and resolver output. Preserve the current `any` field and public shape; Epic C's
   icon/slot work and the later API cleanup own any narrowing. The boundary task must not create a
   second incompatible menu descriptor.

4. **The AVGrid exception is temporary but real.** `ContextMenuModel` is the only production
   violation allowed after this task. It must remain visibly tied to C4, and the acceptance scan
   must count it rather than pretending Rule 6 is already at zero. If C4 is deferred, this task
   still closes with one named exception.

5. **The resolved-path rule must distinguish the two shared folders.** `uikit/shared/*` is an
   allowed internal helper namespace while `src/shared/*` is outside the UIKit boundary. Using
   `import/no-restricted-paths` makes that distinction independent of relative import depth. The
   temporary probe must verify both sides: a `src/shared` import fails, while `../shared/slots`
   from a UIKit component passes.

6. **Moving `debounce` changes its source path, not its semantics.** The shared implementation is
   also used by the main process and 18 other renderer files. Keep the shared export and all those
   consumers untouched; the new core module is only a renderer-local import bridge.

7. **Core is not globally framework- or app-pure today.** Other core files already import API
   modules, so this task must not claim to establish a universal purity rule for `core/`. The
   guarantee is narrower and deliberate: `context-menu.ts` and `BaseEvent.ts` themselves have no
   API/UI/components/shared imports, which is sufficient for the UIKit boundary being closed here.

## Acceptance criteria

- [ ] The production inventory has zero unapproved `uikit/` imports from `api/`, `ui/`,
      `components/`, or `src/shared/`; the sole remaining match is the explicitly annotated AVGrid
      `ContextMenuModel` exemption for C4.
- [ ] `BaseEvent`, `ContextMenuEvent`, `ContextMenuTargetKind`, and `MenuItem` have a
      framework-neutral core owner; existing runtime API and UIKit import paths remain
      source-compatible, the shipped `api/types/events.d.ts` and `assets/editor-types/events.d.ts`
      remain unchanged, and native-event expando/global context-menu dispatch behavior is
      unchanged.
- [ ] `src/renderer/core/utils/debounce.ts` is the one-line bridge to `src/shared/utils`; only
      RenderFlexGrid changes its import, and the shared export plus all 20 consumers remain intact.
- [ ] `eslint.config.mjs` enforces Rule 6 with `import/no-restricted-paths` for production `.ts`/
      `.tsx` files under `uikit/`, rejects type-only/re-exported app imports, excludes only story
      files, and reports the reasoned AVGrid exemption rather than masking it.
- [ ] `MenuItem` remains available from `uikit/Menu`, `uikit`, and the public API declarations;
      no menu caller changes its runtime data shape.
- [ ] ListBox and Tree context menus, RenderGrid resizing, and file watching retain their existing
      behavior after the relocations.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass, and a deliberate temporary
      forbidden-import probe confirms the new lint rule actually fails the boundary.
- [ ] No UIKit component, consumer call site, visual styling, story behavior, or unit-test
      harness is changed as part of this task.

## Files changed

| File | Change |
|---|---|
| `src/renderer/core/events/BaseEvent.ts` | New neutral base event contract |
| `src/renderer/core/events/context-menu.ts` | New neutral `MenuItem`/context-menu event contract |
| `src/renderer/core/utils/debounce.ts` | One-line renderer bridge to the shared debounce helper |
| `src/renderer/api/events/BaseEvent.ts` | Compatibility re-export for `BaseEvent` |
| `src/renderer/api/events/events.ts` | Compatibility import/re-export for `ContextMenuEvent` and target kind |
| `src/renderer/types/events.d.ts` | Point native-event augmentation at the neutral event type |
| `src/renderer/uikit/ListBox/ListBoxModel.ts` | Import the context-menu event from core |
| `src/renderer/uikit/Tree/TreeModel.ts` | Import the context-menu event from core |
| `src/renderer/uikit/Menu/types.ts` | Re-export `MenuItem` from core |
| `src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx` | Import `debounce` from renderer core |
| `src/renderer/uikit/AVGrid/model/ContextMenuModel.tsx` | Document the temporary C4 lint exemption |
| `eslint.config.mjs` | Add the scoped Rule 6 `import/no-restricted-paths` block |
| `doc/epics/EPIC-054.md` | Link US-995 and record the boundary implementation |
| `doc/active-work.md` | Link US-995 under EPIC-054 |
| `doc/tasks/US-995-uikit-boundary-lint/README.md` | This plan and investigation record |

## Related

- [EPIC-054 — De-React Epic C1](../../epics/EPIC-054.md)
- [Rule 6 in the de-React roadmap](../../de-react.md)
- [UIKit authoring rules](../../../src/renderer/uikit/CLAUDE.md)
- [State and framework boundaries](../../architecture/state-management.md)
- US-996 — vanilla UIKit contracts *(planned; its task document will be linked when created)*
- [EPIC-053 — reactive foundation and boundary](../../epics/EPIC-053.md)
