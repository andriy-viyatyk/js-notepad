# US-1111 — ScriptPanel bypasses app.fs with require("fs")

**Status:** Open · **Epic:** none (raised by EPIC-067's close review)

## Goal

Resolve `editors/text/ScriptPanel.ts:16`'s direct `require("fs")` against `CLAUDE.md`'s
no-direct-`fs` rule — either by porting to `app.fs` or by documenting it as an exception.

## Background

`ScriptPanel.ts:16` uses `const nodefs = require("fs")` directly, with **seven call sites**,
all reading and writing script library files.

It is **pre-existing** — it was `ScriptPanel.tsx:23` before EPIC-067 — and it lives in the
*model* rather than the converted view, so it was explicitly excluded from that epic's scope
and raised again by its close review.

## The decision this task has to make

The `writeFileSync`/`existsSync`/`mkdirSync` calls are **synchronous inside user actions**, so
the async `app.fs` port is a **behaviour change, not a rename**.

Two acceptable outcomes:

1. **Port to `app.fs`** — and handle the sync→async consequence at each of the seven call
   sites (a user action that currently completes before returning would become a promise).
2. **Add it to the documented exception list** in `doc/standards/coding-style.md`, with the
   reason stated — the same treatment the other documented `fs` exceptions get.

Option 2 is the smaller change and is defensible on the sync-in-user-action grounds. Option 1
is the rule-conformant one. Pick one deliberately; do not leave it undocumented either way.

## Implementation plan

1. Read `editors/text/ScriptPanel.ts` and enumerate the seven call sites with their sync/async
   sensitivity.
2. If porting: replace each with the `app.fs` equivalent and make the enclosing user action
   async, checking that no caller depends on synchronous completion.
3. If documenting: add the entry to `coding-style.md`'s exception list beside `file-path.ts`
   and the other documented exceptions, stating the synchronous-user-action reason.

## Acceptance criteria

- No undocumented `require("fs")` remains in `ScriptPanel.ts`.
- If ported: script library read/write still works from the script panel.
- `typecheck`, `lint`, `build-prod` clean.
