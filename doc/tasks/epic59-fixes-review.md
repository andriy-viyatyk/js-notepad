# EPIC-059 deferred fixes review

Scope: `git diff e9e093f0..HEAD -- src/` — the four visual-testing follow-up commits
`d39dbf38`, `a39ab6ab`, `a548b3c0`, and `c1a0a10f`.

## Review result

No runtime correctness concern was found in the four fixes. The claims hold against the current
code and the requested architecture and standards:

- `configure-monaco.ts:2,18` points the wrapper at the bundled instance. There are 11 remaining
  `Editor`/`DiffEditor` consumers under `src/renderer`; the config must stay until the last one is
  removed.
- `MonacoDiffEditorHostView.css:14` targets the direct child created by
  `MonacoDiffEditorHostView.ts:31` via `monaco.editor.createDiffEditor(this.root, ...)`, and keeps
  the native-host geometry in the editor-owned `@layer editor` stylesheet.
- The six `[hidden]` counter-rules are correctly scoped to roots that author CSS makes flex/inline
  flex/block. The complete `.hidden =` search found no uncovered author-display target: Panel and
  Text cover the dialog, toolset, and Mermaid targets; Button/IconButton cover the image and tab
  controls; and `PageTabView.ts:273`'s encryption span has no author `display` rule.
- `PinnedRail.css:8-10` is intentionally kept. `PinnedRailView.ts:107` toggles an app-owned
  `[data-type="tools-editors-pinned"]` root whose `PinnedRail.css:3` sets `display: flex`; it is not
  covered by the UIKit rules.
- `TagsInputView.ts:64-69` now claims and mounts each `TagView` before `KeyedList` inserts its root.
  This is required because `TagView.tsx:22-27` builds its content and attributes in `onMount()`;
  `TagsInputView.ts:78-82` disposes the manually claimed view on removal.

## Concerns

Three advisory documentation gaps were found and resolved in this pass; there are no must-fix
concerns and no unresolved advisories.

1. **Advisory — hidden counter-rule convention was implicit.** Evidence: the six fixes in
   `src/renderer/uikit/{Panel,Toolbar,Text,IconButton,Button,Spinner}/*.css` add the same-layer
   counter-rule, while `doc/standards/coding-style.md` and the UIKit authoring guide previously did
   not require it. The convention is now stated in `doc/standards/coding-style.md`,
   `doc/standards/component-guide.md`, and `src/renderer/uikit/CLAUDE.md`.
2. **Advisory — ownership did not explicitly imply mounting.** Evidence:
   `src/renderer/uikit/shared/vanilla-view.ts:21-26` only records ownership, while
   `TagsInputView.ts:64-67` needed the missing explicit `mount()`. The lifecycle convention is now
   stated in `doc/standards/model-view-pattern.md`, `doc/standards/component-guide.md`, and
   `src/renderer/uikit/CLAUDE.md`.
3. **Advisory — stale planning text said `loader.config` would be deleted with the wrapper.**
   Evidence: `doc/de-react.md:793-799` and the EPIC-059 E1-4 section contradicted the 11 remaining
   wrapper consumers. Both developer-doc references now say to retain the config until the last
   importer is removed.

## User documentation

No files under `/docs` were changed. These are internal renderer lifecycle, CSS-cascade, layout,
and migration details; they do not add or alter a user-facing feature, setting, workflow, or API.
