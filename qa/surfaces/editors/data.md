# Surface QA: the data editors

Manual scenarios for the grid, notebook, REST client, env vars, archive and Log View surfaces —
everything a user *holds structured data in* rather than reads. Run through `call` only; do not add
or run automated tests or a test harness for these surfaces. Leave pinned tabs untouched and close
only pages the scenario created.

Landed by EPIC-087 (US-1318 to US-1322); the acceptance run is US-1324.

## Test D.1: Grid inventory, scope, and the portaled popups

**Preparation:** Open a CSV grid page and a JSON grid page, and obtain both ids from `pages`.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `pages[csvId].editor.elements` and `pages[jsonId].editor.elements`. Then open CSV
Options from the toolbar and read the CSV page's `elements` again.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** Both inventories carry the same nine declarations, and every selector contains its own
`[data-page-id="id"]`. `grid-csv-options` is visible only on the CSV page. The three
`csv-options-*` controls report `visible: false` while the popup is closed and `visible: true` once
it is open — even though the popup is portaled to the overlay layer rather than rendered inside the
page. `grid-search-clear` is invisible until search text exists.

## Test D.2: Grid state is honest about an empty grid

**Preparation:** A grid page whose content is an empty array, and a grid page with rows.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `filters`, `sort`, `searchText`, `hiddenColumns`, `visibleRowCount` and
`csvDelimiter` on both.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The empty grid returns real `[]`, `""` and `0` — **not** `undefined` — because absence
on this surface means "no attached host", not "no data". `sort` is `undefined` only when nothing is
sorted. `csvDelimiter` is `undefined` on a JSON or JSONL grid, where CSV options do not exist.
Confirm no member writes a header, cell or column value that was not asked for.

## Test D.3: Notebook repeated controls and the honest `count`

**Preparation:** A notebook page with at least two notes.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `editor.elements`, then `editor.highlight("note-delete")`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** Eleven declarations; the six `note-*` entries say in their purpose text that they occur
once per note. The highlight result reports `count` equal to the number of mounted notes and
`highlighted` equal to it as well — the surface rings every instance rather than one arbitrary note.
On a notebook with no notes the same entries report `visible: false`. Confirm `$help` states that
singling out one note is what the id-taking actions are for.

## Test D.4: Notebook state and panel ownership

**Preparation:** The same notebook page, with the Categories or Tags sidebar panel open.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `filteredCount`, `searchText`, `selectedCategory`, `expandedNoteId` and `notes`.
Then read `page.panels`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** `searchText` is a real `""` when no search is active and `expandedNoteId` is `undefined`
when no note is expanded. `notes` entries carry `language`, `createdDate` and `updatedDate`, and
`editor` is absent rather than empty when the note has none. The Categories and Tags controls are
**not** in `editor.elements`: they belong to `page.panels`, and `$help` says so.

## Test D.5: REST client — the surface shows what the page text shows

**Preparation:** A `.rest.json` page with one request that has a URL, at least one header and a
body.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `pages[id].content`, then `pages[id].editor.selectedRequest`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The facade returns the same URL, header values and body the page text already contains.
This is deliberate: the REST client is a content-host editor, so a redaction in the facade would
protect nothing while claiming to. Confirm `$help` says so plainly rather than implying a
guarantee. Then confirm the other half of the rule holds: there is **no** `setHeaderValue`, no
`setBody`, no `setFormDataValue`, no generic `updateRequest(id, Partial)` and no paste — a member
that *accepts* a secret would write it into the call transcript.

## Test D.6: REST client elements and `send`

**Preparation:** The same page, with no response yet.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `editor.elements`; then `editor.highlight("kv-row-key")` with two header rows
present.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** 21 declarations, page-scoped. The `response-*` entries are invisible until a response
exists, and `form-data-*` entries are invisible while the body type is raw. The repeated
`kv-row-*` highlight reports `count` and `highlighted` equal to the row count. Confirm `send`
carries a caution naming the network effect, and do **not** run it against a real service during
QA unless a throwaway endpoint is available.

## Test D.7: Env vars — locked is not empty

**Preparation:** An unencrypted env-vars page with at least one namespace, and if available an
encrypted one that has not been unlocked.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `status`, `namespaces`, `profiles`, `variables` and `encrypted`/`unlocked` on each.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The unencrypted page reports `status: "ok"` and its real values, and
`env-vars-unlock` is `visible: false`. The locked page reports `status: "locked"` and returns **no**
variables — not an empty list — so an agent cannot mistake "locked" for "has nothing in it", and it
must not return data decrypted earlier in the session. `unlocked` is only meaningful when
`encrypted` is true. No member accepts a password; unlocking goes through `showEncryptionDialog`,
the same name the text editor uses, and a `call` to it returns `pending` with the dialog in
`attention`.

## Test D.8: Archive listing and open

**Preparation:** Any `.zip` with at least two entries, one of them nested in a folder.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** Read `editor.archivePath`, call `editor.listEntries()`, then
`editor.openEntry("<entry path>")`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The entry list carries path, size and directory flag for each entry. `openEntry`
navigates the page to that entry's content — the same result as clicking the entry in the tree,
because both go through one model path. Confirm `extractTo` carries a caution naming the disk
write, and that no member takes a password.

## Test D.9: Log View — the `ui_push` replacement, without dialogs

**Preparation:** None; `pages.logView` creates its page.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `pages.logView.push([...])` with, in one batch: a bare string, a `log.success`, an
`output.markdown`, an `output.grid` with `contentType: "csv"`, and an `output.progress`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The call returns `entryIds` for all five and an empty `dialogIds`, and all five render
in the Log View page — the CSV grid as a table with its first row as headers, the progress entry as
a progress bar. `pages.logView` and the page's own `pages[i].editor` describe the same editor.

## Test D.10: Log View — a dialog does not block, and unresolved is not falsy

**Preparation:** None.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `pages.logView.push([{ type: "input.confirm", message: "...", buttons: ["No", "Yes"] }])`.
Then `pages.logView.dialogResult("<returned id>")`. Then answer the dialog **in the page**, as the
user, and read `dialogResult` again.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The push returns **immediately** with the dialog's id — it does not wait for the answer.
Every call made while the dialog is unanswered carries an `attention` block naming the page, the
dialog id and its type, and saying the agent cannot answer it. `dialogResult` reports
`status: "unresolved"` before the answer and `status: "resolved"` with the chosen `button` after,
and the attention block then disappears. Confirm an unanswered dialog is distinguishable from an
answered one whose value is falsy — the test is that a `button` property exists, not that it is
truthy.

## Test D.11: Log View — shared validation and the old tool

**Preparation:** None.

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `pages.logView.push([{ type: "input.select", title: "x", bogusProp: 1 }])`. Then call the
`ui_push` tool with a plain string.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The malformed dialog is rejected before any entry is created, with the same worked
usage string the `ui_push` tool has always returned — the validation table is shared, not
duplicated. `ui_push` still works and writes to the same Log View page, because this epic added a
replacement path and removed nothing. Confirm a script's `ui.info(...)` also lands on that page:
before EPIC-087 a script and an agent could write to two different Log Views.

## Test D.12: Log View in a second window

**Preparation:** Two windows open (`windows`).

**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Call:** `windows[1].pages.logView.push(["second window"])`.

**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Verify:** The entry appears in the second window's Log View, not the first. This row of the
retirement table must be exercised rather than reasoned from the routing code.
