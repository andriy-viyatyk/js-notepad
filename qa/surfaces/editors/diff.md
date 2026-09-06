# Surface QA: file-diff editor and compare mode

Manual scenarios for `pages[i].editor` after narrowing `editor.id` to `"file-diff"`, and for
`pages.compare`. Run through `call` only; do not add or run automated tests or a test harness for
this surface. Leave pinned tabs untouched and close only pages created by the scenario.

## Test D.1 — file-diff revision identity

**Preparation:** Open a repository file with the `file-diff` editor and ensure both revision
pickers have initialized.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Resolve `page.editor` and inspect `id`, `from`, `to`, `hasStaged`, and `readOnly`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** `id` is `file-diff`; `from` and `to` identify the actual revisions shown by the diff;
and `readOnly` agrees with whether `to.kind` is `unstaged`. No scripting is needed.

## Test D.2 — file-diff controls and panel cross-reference

**Preparation:** Keep the file-diff page active, with a repository that has file history available.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Inspect `page.editor.elements`, highlight each available editor-owned control, then
inspect `page.panels` and expand `git-diff-revisions`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The facade exposes the two revision pickers and only the applicable shared controls;
the Git revisions panel is reachable once through `page.panels`, with its refresh/tree descendants,
and is not duplicated in `page.editor.elements`.

## Test D.3 — compare pair identity and entry/exit

**Preparation:** Open two compatible text pages, or call
`pages.openDiff({ firstPath, secondPath })`.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Inspect `pages.compare.pairs`, call `pages.compare.enter(pageId)` with each side in turn,
inspect `pages.compare.elements`, highlight `compare-root` and `compare-exit`, then call
`pages.compare.exit(pageId)` from either side. Also attempt `enter()` on an ungrouped page, on a
grouped but non-comparable pair, and `exit()` on a page with no active compare mode.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** Each pair identifies left and right page ids/titles/paths explicitly; enter/exit accepts
either member; failed `enter()` calls throw diagnostics that distinguish missing grouping from failed
comparability and name the resolved page ids; failed `exit()` calls throw a diagnostic for the
missing/inactive pair; the compare elements become visible only while the pair is in compare mode;
and leaving compare removes the compare surface. The inspection answers which pages are compared
without scripting.

## Test D.4 — compare highlight scope from the right page

**Preparation:** Enter compare mode and make the right page the active/selected page if the page
manager permits that state.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Highlight `pages.compare`’s `compare-root` or `compare-exit`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The left page slot is activated/shown and allowed to lay out before the highlight is
resolved; the target is found under the left page’s `data-page-id`; the right slot is not incorrectly
used as the selector scope; and no second `CompareEditor` is mounted.
