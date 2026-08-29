# US-1111 — ScriptPanel bypasses app.fs with require("fs")

**Status:** Implemented 2026-08-29 — awaiting batched review · **Epic:** none (raised by EPIC-067's close review)

## Goal

Resolve `editors/text/ScriptPanel.ts:16`'s direct `require("fs")` against `CLAUDE.md`'s
no-direct-`fs` rule — either by porting to `app.fs` or by documenting it as an exception.

## Background

`ScriptPanel.ts:16` uses `const nodefs = require("fs")` directly, with **seven call sites**,
all reading and writing script library files.

It is **pre-existing** — it was `ScriptPanel.tsx:23` before EPIC-067 — and it lives in the
*model* rather than the converted view, so it was explicitly excluded from that epic's scope
and raised again by its close review.

## Decision: port to `app.fs` (option 1), taken 2026-08-29

The document previously framed this as a genuine toss-up, on the grounds that the
`writeFileSync`/`existsSync`/`mkdirSync` calls are *"synchronous inside user actions, so the async
`app.fs` port is a behaviour change, not a rename."* **That premise is wrong for six of the seven
call sites.** Measured:

| Line | Call | Enclosing function | Already async? |
|---|---|---|---|
| 212 | `readFileSync` | `selectScript` | **No** — the only sync one |
| 238 | `writeFileSync` | `saveToLibrary` | Yes — already `await`s a dialog and a dynamic import |
| 271 | `existsSync` | `saveToLibrary` | Yes |
| 272 | `mkdirSync` | `saveToLibrary` | Yes |
| 276 | `existsSync` | `saveToLibrary` | Yes |
| 288 | `writeFileSync` | `saveToLibrary` | Yes |
| 314 | `existsSync` | `openInTab` | Yes — already `await`s `pagesModel.openFile` |

`saveToLibrary` and `openInTab` are **already `async` and already awaiting**, so porting their six
calls is a rename with an `await` in front of it — no behaviour change whatsoever. Only
`selectScript` (`:200`) is synchronous, and it is a dropdown change handler returning `void`:
nothing awaits it, so making it async costs one tick before the content lands and no caller can
observe the difference.

**So the exception argument does not survive contact with the code**, and `ScriptPanel` fits none
of the categories on `coding-style.md`'s exception list (`:326-335`) — circular dependency,
pre-initialisation startup, low-level binary/archive provider, `fs.watch`, or the `require()`
transpiler. It reads and writes plain text files, which is precisely `app.fs`'s job, and the
list's own closing rule applies directly: *"if `app.fs` or `file-path` can do the job, use them."*

`app.fs` covers all seven call sites 1:1 — `read` (`fs.ts:263`), `write` (`:289`),
`exists` (`:318`), `mkdir` (`:398`).

### A second violation in the same file, in scope

`ScriptPanel.ts:242` and `:295` both interpolate `err.message` from a `catch (err)` binding. That
is `CLAUDE.md`'s **no hand-rolled error stringification** rule: a caught value is `unknown` and must
go through `errMessage(e, fallback?)` from `/src/shared/utils.ts`. Both sites are being edited by
this task anyway, so they are fixed here rather than left for a later sweep.

## Implementation plan

1. Delete `const nodefs = require("fs")` (`:14`) and import `fs` from `../../api/fs`.
2. Port the six calls inside `saveToLibrary` and `openInTab` — each becomes `await fs.<method>(...)`
   in a function that is already `async`. Confirm `fs.mkdir` creates intermediate directories, as
   `mkdirSync(..., { recursive: true })` did; if it does not, create the parents explicitly.
3. Make `selectScript` async and `await fs.read(entry.path, "utf-8")`. Keep its existing
   `try`/`catch` semantics — a failed read leaves the current content in place. Verify no caller
   depends on it having completed synchronously.
4. Replace `err.message` at `:242` and `:295` with `errMessage(err)` from `/src/shared/utils.ts`.
5. Leave behaviour otherwise identical — no new toasts, no changed dialog flow.

## Acceptance criteria

- No `require("fs")` remains in `ScriptPanel.ts`; all seven call sites go through `app.fs`.
- No `err.message` remains; both catch sites use `errMessage`.
- If ported: script library read/write still works from the script panel.
- `typecheck`, `lint`, `build-prod` clean.

## Implementation record (2026-08-29)

**Shipped**, confined to `ScriptPanel.ts`: `require("fs")` deleted, all seven call sites moved to
`app.fs`, `selectScript` made `async`, and both `err.message` interpolations replaced with
`errMessage(err)`.

**A detail that reinforces the decision:** the file **already imported `fs` from `../../api/fs`**
and used it elsewhere. It was half-ported, carrying both APIs at once — which makes the
"documented exception" outcome even harder to defend than the async analysis alone suggested.

**The two behavioural risks, both verified rather than assumed:**

1. **`fs.mkdir` is recursive.** It delegates to `_ensureDir` (`fs.ts:202-210`), which calls
   `mkdirSync(dirPath, { recursive: true })`. Confirmed at runtime as well: creating
   `<lib>/script-panel/all` succeeded with **both** intermediate levels absent beforehand.
   (Incidentally `fs.write` also calls `_ensureDir(dirname)` at `:245`, so the explicit `mkdir`
   before writing is now redundant — left in place, since removing it would change structure for
   no gain.)
2. **`selectScript`'s single caller does not await it.** `ScriptPanelView.ts:311` is
   `onChange: (item) => this.scriptModel.selectScript(item)`; the arrow discards the promise, so
   making it async costs one tick before content lands and no caller can observe it. It also
   cannot become an unhandled rejection: the existing `try`/`catch` wraps the only `await`.

**Verification.** `typecheck`, `lint`, `build-prod` green. Runtime, against a scratch library
directory pointed at by `script-library.path` and then restored to unset: nested `mkdir` with
missing intermediates -> `exists` -> `write` -> `exists` -> `read` round trip all correct. The
probe file was deleted and the setting returned to genuinely absent (not empty string), so the
user's environment is unchanged.

**Scope note:** the two `errMessage` fixes were **added by plan review**, not requested by the
original ticket. They are in lines this task edits anyway, and leaving them would have meant a
later standards sweep reopening the same file.
