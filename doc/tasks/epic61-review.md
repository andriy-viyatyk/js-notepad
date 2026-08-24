# EPIC-061 Review

Scope reviewed: `git diff fc8115d4..HEAD -- src/ package.json` (19 files, 494 insertions,
159 deletions), covering US-1056 through US-1061 and the six task areas listed in
`doc/epics/EPIC-061.md`.

Standards checked: `coding-style.md`, `component-guide.md`, `model-view-pattern.md`,
`uikit-vs-components-split.md`, `src/renderer/uikit/CLAUDE.md`, and `editor-guide.md`,
plus the EPIC-061 decisions E3-1 through E3-9 (with withdrawn E3-6 excluded from
the acceptance checks).

## Concerns (resolved)

1. **Resolved — diff external writes are now suppressed at the host boundary.**
   `src/renderer/editors/shared/MonacoDiffEditorHostView.ts:31,68-89` now uses the
   same save-and-restore `suppressOnChange` guard as the single-editor host, and
   `listenToModifiedContent()` checks it before invoking its consumer callback.
   `FileDiffBodyModel.ts:113-119` retains its value comparison because it also
   avoids calling `TextFileModel.changeContent()` and its unsaved-marking and
   detection side effects when a genuine edit already equals host state; it is no
   longer responsible for suppressing the host's external write.

2. **Resolved — single-editor language changes are normalized and applied.**
   `src/renderer/editors/shared/MonacoEditorHostView.ts:37-45,58-65` now maps an
   absent language to `"plaintext"` both when creating the model and when applying
   updates, so `currentLanguage` always describes the model's actual language.

## Suggestions (advisories, resolved)

1. **Resolved — the diff scroll comment now describes the host/effect relationship.**
   `src/renderer/editors/git-tree/CommitDiffPanel.tsx:155-160` no longer refers to
   the removed wrapper's child-effect ordering; it identifies the preceding
   `setDiffValues()` effect as the content synchronization step.

## Verified without concerns

- `MonacoEditorHostView`, `MonacoDiffEditorHostView`, and `TextDialogView` have public
  constructors that create only stable roots; child DOM for `TextDialogView` was
  already constructed in its constructor at `fc8115d4`, so that pre-existing UIKit
  lifecycle issue is outside this epic's changes.
- Both hosts detach their widgets before scheduling owned-model disposal in a
  macrotask, release displaced owned models, preserve borrowed models, and make
  disposal idempotent. `FileDiffBodyModel` no longer performs a second model or
  listener disposal; the diff host owns that lifecycle.
- Model-content subscriptions, replace-the-previous modified-content listeners,
  and `MonacoBody`'s wheel-zoom, selection, rich-paste, and decoration cleanup are
  present. The converted consumers do not add controlled-prop reconciliation in
  host `onUpdate()` or direct model writes for their external content paths.
- The previously raised MCP resource and tool-result concerns are withdrawn: these
  sites intentionally use mount-only `initialValue`:
  `ResourcesPanel.tsx:166-176,233-243` gates both resource branches on non-null
  content, while `McpInspectorEditorModel.ts:531-543,572-582` clears the old
  content before each fetch; `ToolsPanel.tsx:241-249` gates results and
  `McpInspectorEditorModel.ts:420,429-440` clears the previous result before
  assigning the new one. Each new result therefore mounts a fresh host, and a
  `setValue()` effect would be dead code unless those clear/gate invariants change.
- The host-specific geometry CSS uses separate roots for single and diff editors and
  supplies the required width/flex/min-size rules. No new defensive non-null
  assertions were found, and `npm exec tsc -- --noEmit`, `npm run lint`, and
  `git diff --check` pass. The production build is also clean.
- `@monaco-editor/react` has no remaining importer in `src/`; its loader config and
  package dependency are removed. The withdrawn E3-6 performance claim is not used
  as a review criterion.
