# EPIC-087 acceptance run — the data surfaces and the `ui_push` replacement

**Date:** 2026-09-06
**Model:** Haiku, via the `mcp-test-agent-call` skill (`call` as its only tool, no guides)
**Surfaces:** [qa/surfaces/editors/data.md](../surfaces/editors/data.md),
[qa/surfaces/panels.md](../surfaces/panels.md)
**Verdict:** pass, after three runs and three fixes. `ui_push` marked retirable.

The point of these runs is not the verdict. It is watching a weak model try to use the app from the
descriptors alone, and then fixing whatever misled it. All three fixes below came out of that.

## Run 1 — two of three questions

Asked to (1) report a REST request's URL and point at Send, (2) show the user a table and ask them a
question, (3) count notebook notes and point at delete.

- **Q1 passed.** Reached `page.editor.selectedRequest` and `page.editor.elements`, reported the URL
  and method and named `rest-send`. Five calls, no guide.
- **Q3 passed.** Reported 24 notes and named `note-delete`, correctly quoting its purpose line —
  "occurs once per mounted note".
- **Q2 failed.** It never found `pages.logView`. It reached for `pages.addEditorPage("grid-json")`,
  tried to assign the rows, hit an error, and concluded: *"this would normally be solved with
  `ui_push` … but both are outside the `call`-only constraint."* It reported the task impossible.

Two distinct defects behind one failure.

### Fix 1 — `call` could not assign JSON text at all

The agent hit `Assigning object to "content" failed: content.match is not a function`, whose message
advises passing the value "as a string (JSON.stringify structured data first)". **That advice cannot
be followed.** MCP clients parse `value` as JSON, so a stringified JSON payload arrives back as an
object no matter what the caller does. Any agent trying to fill a JSON grid page through `call` was
in a dead end — and so was I, earlier the same night, when I worked around it with `execute_script`.

`resolver.ts` now serializes an incoming object or array when the target property currently holds a
string. Verified: assigning an array of three records to a `grid-json` page's `content` produced a
three-row grid.

### Fix 2 — the output channel described itself in implementation terms

`pages.logView`'s summary read "The get-or-created MCP Log View writer and dialog read-back
surface". Every word is true and none of it says *what it is for*. The `ui_push` tool it replaces
opens with "the AI agent's default output channel", which is why agents find that tool.

Reworded to lead with purpose, in three places — the `pages` member summary, the `pages` `$help`,
and the live-child summary — and, most importantly, **added a pointer at the root node**, since an
agent asked to show the user something looks at the root member list before it looks at `pages`.

## Run 2 — the assignment fix, confirmed

Re-asked Q2 alone. The agent completed both halves: it assigned the table to a grid page (fix 1
working) and asked its question through `ui.input`. It still had not found `pages.logView`, because
it navigated by `helpSearch` and never read the `pages` node where the reworded text lived. That is
what motivated putting the pointer on the root.

## Run 3 — the gate

Asked for a formatted write-up plus a recommendation table, then a question, with one nudge: *look
for a purpose-built channel first.*

The agent's first call was `path: ""`, and its own report names the deciding hint:

> discovered `pages.logView` described as "the channel for showing the user output or asking them a
> question" … **That single hint eliminated the need to create an ordinary editor page** and
> directed me to the purpose-built interaction channel.

It then called `pages.logView.push(...)` with markdown, a table and a dialog, and polled
`pages.logView.dialogResult("editor-choice")`. Nine calls, no guide, no `execute_script`.

### Fix 3 — and it was silently wrong

The agent reported "fully completed". The Log View showed **three blank entries**. It had guessed
the entry types `"markdown"` and `"dialog"` instead of `"output.markdown"` and `"input.confirm"`,
and `push` accepted all three: validation only ever ran for types beginning `input.`, and everything
else fell through to a lenient branch that renders `fields.text ?? ""`. So a guessed type produced
an empty entry, a returned id, and a confident success report — a **silent success**, which is the
single failure class this whole roadmap exists to remove.

`pages.logView.push` now validates the entry type against the documented set and names the
alternatives:

```
Unknown entry type 'markdown'. Valid types: log.text, log.info, log.warn, log.error, log.success,
output.text, output.markdown, output.mermaid, output.grid, output.progress, input.confirm,
input.text, input.buttons, input.checkboxes, input.radioboxes, input.select. A plain string is
shorthand for log.info.
```

The `ui_push` tool keeps its lenient behaviour byte-for-byte; only the new path is strict. The new
path being stricter than the tool it replaces is a deliberate asymmetry, recorded in US-1322.

## Retirement table, exercised rather than reasoned

Every row checked live before `ui_push` was marked retirable:

| Capability | Path | Result |
|---|---|---|
| Get-or-create the Log View page | `pages.logView` | page created and focused |
| String shorthand → `log.info` | `push(["text"])` | one `log.info` entry |
| Five log levels | `push([{ type: "log.success", … }])` | rendered |
| `output.text` / `markdown` / `mermaid` | same | rendered |
| `output.grid`, JSON and CSV | `contentType: "csv"` | parsed through `csvToRecords`, headers from row 1 |
| `output.progress` | same | progress bar |
| Six `input.*` types, with validation | shared `DIALOG_SPECS` | malformed `input.select` rejected with the tool's own usage string |
| Blocking until answered | **changed**: non-blocking + `attention` + `dialogResult` | push returned immediately with `dialogIds`; attention named the dialog on every later call; `unresolved` → `resolved` with `button: "Yes"` after the user answered in the page |
| `windowIndex` targeting | `windows[1].pages.logView.push([...])` | landed in the second window (`entryIds: ["1"]`) while window 0 stayed at 15 |

`ui_push` itself was re-run afterwards and still works, on the same page.

## Not fixed, recorded instead

- **`pages.openFile()` on a directory** returns `null` and leaves an "Empty" page that the tab strip
  renders but the object model does not contain. Confirmed **pre-existing** by stashing the epic's
  entire diff and reproducing on a clean tree. EPIC-087 Needs user check 2.
- **The REST/env-vars page-level secret boundary.** EPIC-087 Needs user check 1.
