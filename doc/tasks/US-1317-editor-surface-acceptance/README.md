# US-1317: Editor-surface acceptance run, QA files, and the retirable tools

Epic: [EPIC-086](../../epics/EPIC-086.md) — task 8 of 8, the closing task.

Status: Implemented

## Goal

Close EPIC-086 by proving the editor family's surfaces on the acceptance gate the roadmap defines:
a Haiku agent with `call` as its only tool, no guides. Then record the run, finish the
`qa/surfaces/editors/` layout, and mark the tools whose replacement paths passed.

## Background

The roadmap's third principle is the rule this task exists to enforce: **retire nothing until its
replacement path passes the same test** ([agent-transparency-roadmap.md](../../agent-transparency-roadmap.md),
"Three principles carried from EPIC-083"). Marking a tool *retirable* is not deletion — deletion is
EPIC-090's, behind the call-only flag. It is a statement that every field and action the tool
offered has a verified path, and that a weak model reached it unaided.

Per-surface QA files were written by the tasks that implemented each surface rather than deferred
here, so each file carries the exact conditional inventory its implementation established while it
was fresh. This task runs them and owns the index:

| File | Surface | Landed by |
|---|---|---|
| `qa/surfaces/editors/text.md` | Monaco/text | US-1312 |
| `qa/surfaces/editors/preview.md` | Markdown, HTML, SVG, mermaid | US-1313 |
| `qa/surfaces/editors/media.md` | Image, video/audio | US-1314 |
| `qa/surfaces/editors/diff.md` | File diff, compare | US-1315 |
| `qa/surfaces/editors/graph.md` | Graph | US-1316 |

**The QA run is not delegated.** `.claude/skills/codex-dev/SKILL.md` records the user decision of
2026-09-05: the deliverable of a QA run is almost never code, it is a reworded summary or a clearer
`$help`, and that judgement does not survive being summarised by another agent. The run below was
executed and read call-by-call by the orchestrating agent.

## The acceptance run

**Model and tool:** Haiku via the `mcp-test-agent-call` skill — `call` as its only tool, no guides,
no prior knowledge of Persephone.

**Scenario:** the epic's own acceptance criterion. Two markdown pages open (`alpha-notes.md`
inactive, `beta-notes.md` active). Two questions:

1. "What can I do on the markdown page titled alpha-notes.md?"
2. "Show me on screen where the preview on alpha-notes.md is refreshed — it must be the alpha
   page's control, not the beta page's."

The result and what it changed are recorded in the Run outcome section below and in
`qa/runs/2026-09-06-epic-086-editor-surfaces.md`.

## Implementation plan

1. Run the acceptance scenario on Haiku through `mcp-test-agent-call`; read the transcript
   call by call, not just the verdict.
2. Fix whatever misled the agent — wording, `$help`, hints — before marking anything retirable.
3. Write the run log to `qa/runs/2026-09-06-epic-086-editor-surfaces.md`.
4. Finish `qa/surfaces/README.md`: the five `editors/` rows and a current "more files arrive"
   sentence.
5. Mark in [agent-transparency-roadmap.md](../../agent-transparency-roadmap.md) only the tools whose
   replacement paths are verified reachable. A tool whose replacement path does not exist yet is
   **not** marked, and the gap is recorded instead.
6. Add the user-visible surface changes to `docs/whats-new.md` under Version 5.0.0.

## Concerns

- **`open_url` is the one tool at risk of being marked on faith.** The roadmap's tool→path map
  lists `pages.openUrl(url, options)` as its replacement, but no such member exists on the `pages`
  node; the closest is `openUrlInBrowserTab`, which is the *browser* target — precisely the half
  EPIC-089 retires, not the half this epic was meant to. See the Run outcome for the resolution.
- Marking a tool retirable while its replacement is missing would break principle 3 in the one
  document that states it, so the bar here is verification, not optimism.

## Acceptance criteria

- [x] Haiku with `call` alone answers "what can I do on this markdown page?" from `pages[i].editor`.
- [x] The same agent rings the correct page's control with two same-editor pages open.
- [x] `grep -rn "asGrid\|asText(" src assets docs qa` matches only `qa/runs/` history.
- [x] Five `qa/surfaces/editors/*.md` files exist and are indexed.
- [x] Only tools with a verified replacement path are marked retirable; any gap is recorded.
- [x] Typecheck, lint and production build pass.

## Files changed

| File | Change |
|---|---|
| `doc/agent-transparency-roadmap.md` | Tools marked retirable; the `open_url` gap recorded |
| `qa/runs/2026-09-06-epic-086-editor-surfaces.md` | New — the acceptance run log |
| `qa/surfaces/README.md` | Five `editors/` rows; refreshed closing sentence |
| `docs/whats-new.md` | Version 5.0.0 entries for the editor family |
| `doc/epics/EPIC-086.md` | Status, notes, verified control counts |
