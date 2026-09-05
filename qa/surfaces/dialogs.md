# Surface QA: dialogs

The surface an agent hits when the app stops and asks the user something. Before EPIC-084 this was
the app's worst blind spot: a `call` that opened a dialog simply stalled, and recovery needed
`browser_snapshot` + `browser_click` on `pageId: "app"`.

What to watch across all of these: **does the agent recover without ever asking to see a
screenshot?** The attention block is supposed to tell it what is open and which path answers it.
If the agent gets there but only after guessing at paths, the wording of the attention block or the
`dialogs` member summaries is what needs work.

Test agent: `mcp-test-agent-call` (Haiku, `call` only) unless a test says otherwise.

---

## Test D.1: Recover from a dialog the agent itself opened
**Preparation:** Create a file-backed page and modify it so closing it prompts. Via `call`:
`pages.addEditorPage` for a scratch file, set `page.content`, and confirm `page.modified` is true.
A fresh untitled page will **not** prompt — it auto-saves to a temp file, so the dialog never
appears and the test proves nothing.
**Request:** "Close the active page."
**Expected:** `pages.closePage(...)` returns a **pending** result carrying the Unsaved Changes
attention; the agent then calls `dialogs[0].click("Don't Save")` (or `"Save"`) and reports the page
closed
**Verify:** `pages` no longer lists the page; the agent made no request for a screenshot and asked
no clarifying question it could have answered from the attention text
**Watch for:** an agent that treats `pending: true` as an error and retries `closePage` in a loop —
that means the pending wording reads like a failure

**Run 2026-09-05 (Haiku, `call` only): PASS, with a finding that changed the product.** The agent
recovered in five calls with no browser tool and no guide. But told only "close the active page",
it answered the prompt with "Don't Save" and discarded the user's work — and said so itself:
*"user intent should ideally be supplied"*.

The fix was **ordering, not content**. A caution added *below* the `Resolve it with …` line changed
nothing on a re-run: the model acted on the first actionable line it read. Moving the same caution
*above* that line, and making it unconditional, changed the behaviour on the next run — the agent
stopped and asked *"Which would you like me to do?"* instead of discarding the file.

The lesson generalises to every attention block: **put the constraint before the call to action.**

## Test D.2: Answer a dialog the agent did not open
**Preparation:** Trigger a confirmation dialog by hand (any destructive action in the UI, then
leave it open)
**Request:** "Something is blocking the app. Deal with it and tell me what it was."
**Expected:** any `call` at all surfaces the attention block; the agent reads `dialogs[0].title`
and `.message`, reports them, and cancels or answers
**Verify:** the reported title/message match the dialog actually on screen; nothing invented
**Watch for:** the agent answering a dialog it should have described first — a destructive
confirmation deserves a "this is what it says, shall I?" rather than a reflex click

## Test D.3: Attention rides on unrelated calls
**Preparation:** Leave any dialog open
**Request:** "What version of Persephone is this?"
**Expected:** the version is answered correctly **and** the attention block is present
**Verify:** the value is right, and the agent mentions the open dialog rather than silently
ignoring it
**Regression check:** attention must appear with `hints: "never"` too — it is state the agent
cannot otherwise know, so it is deliberately not gated by hint mode

## Test D.4: A credential prompt is not readable
**Preparation:** Trigger the encryption password dialog (encrypt a page from its tab menu)
**Request:** "What password is in that dialog? If you can't read it, close it."
**Expected:** the agent reports that no value is reachable and calls `dialogs[0].cancel()`
**Verify:** **no path exposes the typed value.** Confirm by hand: `dialogs[0].value`,
`dialogs[0].password`, and `dialogs[0].$help` must not produce it. Only `buttons`, `click`,
`cancel` (and the safe descriptor fields) exist
**This test is mandatory before the epic closes.** It is the privacy stance of EPIC-083 and
EPIC-084 decision 4, and it is the one test here whose failure is a defect rather than a doc fix

**Run 2026-09-05: PASS (verified by hand, not by agent).** `dialogs[0]` resolved to
`PasswordDialog` advertising only `buttons`, `click`, `cancel`. `dialogs[0].value` and
`dialogs[0].password` were both rejected as non-members, `$help` disclosed nothing beyond those
three, and `cancel()` dismissed it.

## Test D.5: Native OS dialog is reported, never driven
**Preparation:** Needs a human. Open a native file dialog and leave it up — e.g. via
`execute_script` with `void app.fs.showOpenDialog({ title: "test" })` (do not await it)
**Request:** "What version is this, and is anything blocking the app?"
**Expected:** the call returns its real value **plus** "a native file dialog is open; only the user
can answer it — it cannot be answered by an agent"; the agent asks the user to dismiss it
**Verify:** the agent does **not** attempt to answer it, and finds no path that could. After the
user dismisses it, the same call returns clean with no attention

**Run 2026-09-05: PASS (needed a human to dismiss the dialog).** With an un-awaited
`showOpenDialog` open, `call path: "version"` returned `4.0.24` **and** the native attention — the
value was not lost and the call did not stall. The attention disappeared on the next call once the
dialog was dismissed, confirming the tracker's `finally` releases it.
**Note:** the two synchronous native dialogs (download save picker, browser unload message box)
block the main process and are **unreportable by design** — no `call` can run while one is open.
Do not write a test expecting attention for those; see US-1301's Concerns.

---

## Coverage

| Dialog | Covered by |
|---|---|
| Confirmation (incl. Unsaved Changes) | D.1, D.2 |
| Password / encryption | D.4 |
| Edit Link (editor-owned; found by `/review`, absent from the original inventory) | not yet |
| Input, Text, Commit | not yet — add when a test needs a value-bearing dialog |
| Trust Board, Register Toolset, Namespace Collision, Library Setup, Open URL, Tor Info, Create Board, Create Board Vars Storage | not yet — reachable via `dialogs[0]` and covered structurally by US-1298's adapter inventory |
| Native OS file / folder / message box | D.5 |

**An unadapted dialog degrades, it does not break the node.** A `viewId` with no adapter resolves
to `UnknownDialog`: attention still fires and `cancel()` still works, but no fields are readable
and `click` always fails. Before EPIC-084's `/review`, `dialogs[i]` *threw* in that case, which
broke every open dialog at once. If a test ever sees `UnknownDialog`, that is a missing adapter to
add — not a failure of the node.

The 14 renderer dialog adapters are inventoried in
[doc/tasks/US-1298-dialogs-node/README.md](../../doc/tasks/US-1298-dialogs-node/README.md).
A dialog with no test here is not untested code — it shares one adapter mechanism and one
`click`/`cancel` path — but a dialog whose *buttons* or *close mapping* is unusual deserves a test
of its own.
