---
name: codex-dev
description: The default way to do task work in this repo. Delegate investigation, planning, implementation, and the completion skills to Codex (gpt-5.6-luna, high effort) over MCP; Claude spends its budget on epic docs, reviewing Codex's plans, and fixing reported bugs. Use for any task big enough to need a document, and whenever the user says "use codex".
allowed-tools: mcp__codex__codex, mcp__codex__codex-reply, mcp__persephone__browser_snapshot, Read, Grep, Glob, Bash, Edit, Write
---

# Codex-delegated development

Codex does the reading and the typing. You do the thinking about whether the plan is
right. That division exists because the user's Claude budget is scarce and their Codex
budget is not — `gpt-5.6-luna` at high effort is cheap for them and competent at code.

**Target: you do 5–10% of the work.** If you are doing more, you are doing the wrong work.
Delegate by default and treat "should I just do this myself?" as a question that almost
always answers no.

## Who owns what

| Work | Owner |
|---|---|
| Epic-level plan and epic documents | **You** |
| Task investigation and writing the task document | Codex |
| Reviewing that document, and the corrections sent back | **You** |
| Task implementation | Codex |
| `/review`, `/document`, `/userdoc` at epic close | Codex |
| Confirming the app still renders | **You**, shallowly — see step 6 |
| A bug or visual defect the user reports | **You**, directly — see below |

Two boundaries matter more than the rest.

**Do not review the implementation.** Codex's diff is not yours to audit line by line. You
already spent your judgement where it pays — on the plan. Check that the diff touched what
the plan said and nothing else, confirm the three commands pass, and glance at the one or
two critical paths your plan review flagged as risky. Nothing more, unless asked.

**Bugs the user reports are yours.** When the user says "this renders wrong" or "this
broke", investigate and fix it yourself. Do not delegate it. Debugging is the one task
where the expensive model earns its cost outright: the symptom is known, the cause is not,
and a wrong guess costs a round trip plus a rebuild. This is the exception to delegate-by-default,
and it is why the budget is being conserved everywhere else.

**The core economic rule: every token Codex returns lands in your context.** So every
delegation prompt must end with an output contract that keeps the reply tiny and puts the
real artifact on disk. Never ask Codex to "show me the plan" — ask it to write the plan to
a file and reply with the path and a ≤10-line summary.

## What Codex starts with — and what it does not

Tested, not assumed: with `cwd` set to the repo, Codex **auto-loads `AGENTS.md`** into
every MCP session. It answered AGENTS.md questions correctly with zero file reads.

It does **not** auto-load `CLAUDE.md`. Asked about three CLAUDE.md-only rules — `errMessage`
over hand-rolled error stringification, colors only from `theme/color`, `file-path` over
`require("path")` — it answered UNKNOWN to all three, again with zero file reads.

That matters because `AGENTS.md` is 41 lines that mostly *point* at `CLAUDE.md`, and a
pointer is an instruction Codex may act on, not a load that already happened. Everything
that actually governs the code — coding standards, the colour and path and error rules,
dynamic imports for editors, task workflow, dashboard rules — is in `CLAUDE.md` and is
absent until something makes Codex read it.

So **every** thread you create must be told to read it, in two places:

1. `developer-instructions` on the `codex` call (a developer-role message, so it outranks
   ordinary prompt text):

   > Before doing anything else, read `CLAUDE.md` in full and follow it. It is the canonical
   > project context and its coding standards are mandatory. `AGENTS.md` only points at it.

2. As the first line of the prompt itself, so it survives if the thread is ever resumed.

Never use `base-instructions` for this — it *replaces* Codex's default instructions rather
than adding to them, and would strip its own operating rules. `developer-instructions` is
additive and is the right home.

Reading `CLAUDE.md` costs thread A a couple hundred lines up front. That is the cheapest
context in the whole run, and far cheaper than reworking an implementation that hardcoded a
hex colour or added a test suite.

## Two threads, split at implementation

Codex runs out of context. A single investigation of a real task takes it to nearly 100%,
and there is **no way to compact it over MCP** — `/compact` is a TUI command; sent as a
prompt it is treated as literal text and does nothing. Verified, not assumed.

So the context boundary is a **thread boundary**, and that is better than compacting
anyway. Compaction is lossy and non-deterministic — you do not control what survives. A
fresh thread pointed at the corrected task document starts near zero holding the
*authoritative, reviewed plan*, and loses nothing that matters, because the plan is
complete by construction. That is exactly what `CLAUDE.md`'s task-doc rule exists for:
*"A detailed plan with resolved concerns lets the agent implement correctly even after
context compaction."* What the investigation thread still holds by then is mostly
exploration debris — files read and rejected, dead ends, superseded hypotheses — which is
precisely what you do not want carried into implementation.

| Thread | Steps | Why |
|---|---|---|
| **A** — investigation | 1 investigate → 3 apply corrections | Still holds the code context, so corrections are cheap and accurate |
| **B** — implementation | 4 implement | Fresh context, reading the corrected document from disk |

Keep step 3 in thread A. It is a small delta against context Codex already has, which is
why it usually lands without auto-compacting. Start thread B for implementation — that is
where the manual `/compact` used to go.

### Keeping thread A from filling up

1. **Scope the brief.** Name the files, folders, and epic decisions you already know are
   relevant. You often know this from the epic document at zero extra cost, and it saves
   Codex a great deal of blind searching — the single largest source of its context burn.
2. **Make it write as it goes.** Require findings to be recorded into the task document
   *as they are verified*, not composed at the end. If Codex auto-compacts mid-investigation,
   the verified claims are already durable on disk. This is the main defense.
3. **Set `compact-prompt` when creating thread A.** It configures the summarization used if
   auto-compaction fires, so bias it toward what you need to survive:

   > Preserve: the task document path, all verified file/line findings, and unresolved
   > questions. Discard: file contents already recorded in the document.

4. **Escape hatch.** If the correction round comes back thin, vague, or confused about code
   it cited earlier, it compacted and lost the code context. Start a fresh thread with the
   document plus your review and have it re-verify the specific claims — do not accept the
   thin answer.

Codex keeps its own context across a thread, which is what makes step 3 cheap: it already
knows the task, so your review is the only new input it needs.

`codex-reply` accepts **only** `threadId` and `prompt`. Sandbox, model, approval policy,
and cwd are fixed when the thread is created — so create it correctly the first time:

```
mcp__codex__codex
  prompt:                 <the investigation brief>
  cwd:                    C:\projects\persephone
  sandbox:                workspace-write
  approval-policy:        never
  developer-instructions: <the read-CLAUDE.md standing rule above>
  compact-prompt:         <what must survive auto-compaction, see below>
```

- `sandbox: workspace-write` — required even for the investigation step, because Codex
  writes the task document. Read-only would fail at the last moment.
- `approval-policy: never` — mandatory. There is no interactive channel over MCP, so
  `on-request` or `untrusted` will hang the call waiting for an approval that can never
  arrive.
- Model and effort are already pinned to `gpt-5.6-luna` / `high` in the MCP server
  registration. Do not pass `model` unless the user asks for a different one.

The `threadId` comes back in the result's `structuredContent.threadId`. Record thread A's
and keep it through step 3. If you lose it, `codex exec resume --last` is the fallback, but
a lost thread means Codex re-reads the codebase — wasteful, though only of the cheap budget.

Codex streams progress as `codex/event` notifications while it works. Those do **not**
enter your context — only the final message does. That is precisely why the output contract
is the whole game: a thirty-minute Codex investigation costs you exactly the ten lines you
asked it to reply with.

## The six steps

### 1. Delegate investigation (thread A)

Codex reads the code and writes the task document. Only `AGENTS.md` arrives for free —
`CLAUDE.md` and everything under `.claude/` must be named explicitly, so point at both the
project context and the task-doc rules.

Brief it with: the task, the epic if any, `.claude/rules/task-docs.md` as the required
document structure, and this output contract:

> Read `CLAUDE.md` in full first, then `.claude/rules/task-docs.md`.
> Write the task document to `doc/tasks/US-XXX-short-name/README.md` following
> `.claude/rules/task-docs.md`. Investigate thoroughly — read the actual source, do not
> guess at file paths, line numbers, or existing patterns; every claim in the document
> must be verified against the code. Do not implement anything yet. Reply with only the
> document path and a ≤10-line summary of the approach. Do not paste the document.

Tell it to add the dashboard entry per `CLAUDE.md`, or note that you will.

### 2. Review the plan — this is where Claude's budget goes

Read the task document in full. **Verify its claims against the source rather than reading
them** — compile the claim, don't skim it. That is the entire value you add over Codex
doing this alone, and it is why the user pays Opus tokens here and nowhere else. In past
rounds of this workflow, the findings that mattered were always the same shape:

- a cited line range or symbol that does not say what the plan claims
- a stated invariant that the code does not actually guarantee
- a "matches current behavior" claim where current behavior is the opposite
- a cross-document conflict (an epic decision cited from the wrong epic)
- a silent-failure path: a value that is `undefined`/async/identity-unstable where the
  plan assumes it is present/sync/stable

Grep for the real definition of every load-bearing claim. Read the two or three files the
plan is actually about. Then write findings as **corrections addressed to Codex**, ordered
must-fix first, each naming the file and line that proves it.

Show the review to the user in the response. They may want to paste it themselves, or
adjust it before it goes to Codex.

### 3. Send corrections back to Codex (thread A)

`mcp__codex__codex-reply` with the retained `threadId` and the review text, plus:

> Apply these corrections to the task document. For each finding, either fix it or reply
> saying why it does not apply — do not silently skip one. Do not implement yet. Reply with
> only a ≤10-line list of what you changed.

Then read `git diff -- doc/tasks/<folder>/README.md` — the **diff**, not the whole document
again. Re-reading a 400-line document to check ten edits is the most common way this
workflow leaks Claude budget. If Codex pushed back on a finding, judge the pushback; it is
sometimes right, and it has been right before.

### 4. Delegate implementation — in a fresh thread

Start a **new** `mcp__codex__codex` thread with the same `cwd`, `sandbox: workspace-write`,
`approval-policy: never`, and the same `developer-instructions` — a fresh thread has none of
thread A's context, including its `CLAUDE.md` read. Do not continue thread A: by now it is
near its context limit, and the corrected document on disk is the complete handoff.

Name the document path explicitly and tell it to read the document first:

> Read `CLAUDE.md` in full, then `doc/tasks/US-XXX-short-name/README.md` in full. The task
> document is a reviewed, corrected plan — implement it as written, and treat `CLAUDE.md`'s
> coding standards as mandatory. Do not write unit
> tests or test harnesses — this project does not use them. Do not commit. Run
> `npm run typecheck`, `npm run lint`, and `npm run build-prod` and fix what they report.
> Reply with only a ≤15-line summary: files changed, and anything you could not complete.

### 5. Smoke verification — deliberately shallow

The user's instruction is explicit: keep this light. Do not re-review the implementation
line by line unless they ask.

1. `git status --short` and `git diff --stat` — did it touch what the plan said it would,
   and nothing else?
2. Confirm typecheck / lint / build actually passed. Re-run them yourself if Codex's
   summary is vague — a build is cheap in Claude tokens, a wrong claim is not.
3. Read only the files you flagged as risky during step 2. That list is short by
   construction, and it is where a defect would actually be.
4. **Confirm the app still renders.** A green build does not prove the renderer survived —
   a vanilla-view conversion can compile perfectly and mount a blank page. If Persephone is
   running, take one `mcp__persephone__browser_snapshot` of a page that exercises the
   converted code and confirm it is not empty. That is the whole check: *did we brick it?*
   Do not walk the UI, do not verify layout details, do not screenshot several states —
   snapshots are large and full UI verification is exactly the token sink this workflow
   exists to avoid. If Persephone is not running, say so rather than starting it — but if it *is*
   running and the renderer is wedged, that is step 5a's job, not a reason to stop.
5. Report what you verified and what you did not. Never imply broader verification than
   you performed.

A full implementation review is opt-in. Offer it if the diff is large or touched files the
plan never mentioned; otherwise let the user decide.

### 5a. Recovering a wedged Persephone — try this before asking the user

*(User decision, 2026-08-24, after an agent stalled on a blank renderer instead of recovering it.)*

**During autonomous work, Persephone is under your full control.** The user leaves nothing unsaved in
it, and every page — pinned ones included — can be reopened. You cannot break anything they cannot
restore. So a wedged app is **yours to fix**, not a reason to stop and wait.

The symptom to recognise: the window is blank, or renderer-side MCP calls (`get_app_info`,
`execute_script`) time out while main-process ones (`list_windows`) still answer. That is a dead
renderer, and it is usually **HMR failing to hot-swap a large batch** — not a defect in the code. A
conversion touching a dozen files, or any change to an entry module, routinely defeats it.

Work through these in order, and stop as soon as MCP answers again:

1. **Force a main-process rebuild.** Add a throwaway `console.log()` to a file under `src/main/`,
   which makes Vite rebuild and restart the main process *and* the window. Remove the line once the
   app is back. This is the cheapest option and it fixes the common case.
2. **Restart the dev server.** Kill the Vite process and Persephone (`Get-Process` filtered on
   `electron`, then stop them), and run `npm start` fresh. A cold start is also the honest test of
   whether the code actually works, since it exercises the real bootstrap rather than a hot-swap.
3. **Only then stop and ask.** If neither recovers it, the problem is probably real. Report the
   symptom, what you tried, and the first console error if you have one — and do not keep looping.
   Two attempts is the budget.

**Do not report a wedged renderer as a defect until a cold start reproduces it.** HMR failure and a
genuine mount failure look identical from outside, and only step 2 distinguishes them. Saying "the
conversion broke the app" when a restart fixes it sends the user chasing nothing.

### 6. Delegate the completion skills

`/review`, `/document`, and `/userdoc` go to Codex too — do not run them yourself.

`AGENTS.md` already carries the mechanism: it requires Codex to spawn **one dedicated
sub-agent per skill**, each reading `.claude/skills/<name>/SKILL.md` completely, run in
`CLAUDE.md`'s completion order. So the delegation is short — name the scope and let its own
instructions do the rest:

> Run the completion skills for <task/epic scope> per `AGENTS.md`: one sub-agent each for
> `/review`, `/document`, and `/userdoc`, in that order. Do not perform their workflows
> yourself. Do not commit. Reply with only a ≤15-line summary: what each skill changed, and
> any finding you did not act on.

Timing follows `CLAUDE.md`, not convenience: for an **epic task** these are deferred to
epic close, so do not run them per task. For a **standalone task** they are mandatory at
completion. Use a fresh thread — completion work reads broadly and deserves clean context.

Your job on the way back is to read the *findings*, not the doc diffs. If `/review`
surfaced something real, that is a plan-level judgement and therefore yours.

## Project rules that survive delegation

These live in `CLAUDE.md`, which Codex only has if you made it read it — so restate the two
it violates most often in the prompt itself, and hold yourself accountable for all four:

- **Never commit** unless the user asks. Not after implementation, not after verification.
- **No unit tests.** State it in the implementation prompt every time; it is the single
  most common thing a delegated agent adds unasked.
- **Epic tasks stay `[ ]`** on the dashboard. `/review`, `/document`, and `/userdoc` are
  deferred to epic close. Do not run them per task.
- **Keep `doc/tasks/US-XXX` folders** for the whole De-React programme — one cleanup sweep
  at the end, not on task close.

## When not to use this

Three cases, and only three:

- **A user-reported bug or visual defect.** Yours to investigate and fix. See the boundary
  above — this is the work the saved budget is being saved *for*.
- **Epic-level planning and epic documents.** Yours. An epic doc is a judgement about
  sequencing, risk, and what the abort criteria are; that is the same faculty you bring to
  reviewing a task plan, and it does not survive delegation.
- **A few lines in one file you already have open.** Delegating costs more in round trips
  than doing it.

Everything else goes to Codex. If you find yourself reasoning about whether some middle
case is worth delegating, delegate it — the 5–10% target is the tiebreak.
