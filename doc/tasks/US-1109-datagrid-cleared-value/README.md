# US-1109 — A cleared DataGrid value can vanish silently

**Status:** Open (latent, not live) · **Epic:** none

## Goal

Remove the trap behind US-1108 rather than documenting it once: make "this option disappeared"
representable through `DataGridView`'s push/collect path.

## Background

`DataGridView.invalidatePushed()` discards the baseline that makes a disappearance detectable,
and `collectValues` drops `undefined` — so **any** consumer that maps a cleared value to
`undefined` silently loses the clear.

`av-grid` is a vendored npm package (v2.2.4); `DataGridView` is a shim over `DataGridInstance`.

**This is latent rather than live:** no other consumer has the `|| undefined` coercion today.

## Options

1. **Have `invalidatePushed` retain the key set** (not the values), so a disappearance is still
   representable.
2. **Stop dropping `undefined` in `collectValues`** and let the union diff carry it.

Option 2 is closer to the shim's stated **exclusion-not-allow-list** design, but it changes
what reaches `create()` — so it needs the story harness run over **all five** `DataGrid`
consumers.

## Implementation plan

1. Read `DataGridView`'s `invalidatePushed` and `collectValues`, and enumerate the five
   `DataGrid` consumers.
2. Pick option 2 unless the harness run shows a consumer that breaks on `undefined` reaching
   `create()`; fall back to option 1 if so.
3. Run the story harness over all five consumers either way — the change is in the shim, so
   every consumer is in blast radius.

## Acceptance criteria

- A consumer that maps a cleared value to `undefined` no longer loses the clear.
- All five `DataGrid` consumers render and edit correctly in the story harness.
- `typecheck`, `lint`, `build-prod` clean.
