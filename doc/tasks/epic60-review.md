# EPIC-060 Review

Scope reviewed: `git diff ce11b6b6..HEAD -- src/` (25 files, 2,250 insertions, 1,185 deletions).
Standards checked: `coding-style.md`, `component-guide.md`, `model-view-pattern.md`,
`uikit-vs-components-split.md`, `src/renderer/uikit/CLAUDE.md`, and `editor-guide.md`.

## Concerns (resolved)

1. **Resolved — child DOM was built in constructors instead of `onMount()`.** The VanillaView lifecycle contract
   restricts constructors to the stable root and view-owned model/state; child DOM must be built after
   the owner has attached the root. This occurs in `src/renderer/editors/grid/GridBodyView.ts:140-159`,
   `src/renderer/editors/markdown/MarkdownBodyView.ts:223-258`,
   `src/renderer/editors/svg/SvgBodyView.ts:50-60`,
   `src/renderer/editors/markdown/CodeBlock.ts:265-281`, and
   `src/renderer/editors/markdown/MarkdownImage.ts:26-32`. Child-element creation/attachment
   (and constructor-time nested rendering) now occurs in `onMount()` in all five views. Ownership and
   exactly-once mounting were retained. `MermaidBodyView` carries the same older EPIC-059 violation,
   but is outside this EPIC-060 fix scope and remains a follow-up.

2. **Resolved — a highlight-scroll continuation could outlive `MarkdownBlockView`.**
   `src/renderer/editors/markdown/MarkdownBlockView.ts:238-240` schedules a microtask that calls
   `scrollIntoView()` on a captured span without checking view lifetime or render generation. Dispose
   or re-render can detach that span before the microtask runs; the continuation now checks the render
   generation before scrolling.

## Suggestions (advisory, resolved)

1. **Resolved.** `src/renderer/editors/markdown/MarkdownBlock.css:14` added `.md-image[hidden]`, but
   `src/renderer/editors/markdown/MarkdownImage.ts:34-35` applies HAST properties (including `hidden`)
   to the child `<img>`, not the `.md-image` root. The current `.markdown-block img` rules do not set
   `display`, so the browser's hidden behavior still works. The redundant `.md-image[hidden]` rule
   was removed because the child `<img>` needs no author counter-rule.

## Verified without concerns

- Every `child()`/`claimViewOwnership()` site in the diff has an attached root and exactly one mount;
  owned children are disposed through `VanillaView` ownership or explicit retirement.
- State, queue, page-focus, DOM-listener, timer, RAF, model-ref, and model-replacement cleanup is
  present; `state.subscribe`/queue functions and `{ unsubscribe }` page subscriptions are handled in
  their respective conventions.
- Content writes are guarded where they navigate/reload/re-parse: HTML `srcdoc`, image source, and
  markdown block rendering all avoid redundant side effects.
- Full-page and embedded geometry branches retain non-zero sizing/flex paths, and Panel's same-layer
  `.panel-root[hidden]` counter covers the grid toggles.
- `HtmlBodyView` sets `sandbox="allow-scripts"` in its constructor before `mount.tsx` can append the
  root to the live DOM.
- No newly added defensive non-null assertions or direct renderer `fs`/`path` imports were found.
