# US-1131 — Close the remaining gaps in the VanillaView lifecycle lint rules

**Status:** Open · **Epic:** none (residual of EPIC-071)

## Goal

Extend the `VanillaView` lifecycle ESLint guard to cover the three defect shapes it
currently cannot see, so the classes of bug that repeatedly survived typecheck, lint and
`build-prod` become mechanically detectable.

## Background

The guard itself was **delivered in EPIC-071 as US-1142** — this task is only the residue.

`eslint.config.mjs` carries a local plugin enforcing four clauses:

- no listeners/subscriptions in a constructor
- no timers in a constructor
- no layout measurement in a constructor

  (all three were measured at a **zero** baseline before being enabled)
- **Class A** — no synchronous constructor dereference of a field whose only assignment is
  in `onMount`/`onUpdate`

plus one narrow **Class B** rule: a field claimed from `this.child(...)` must be assigned in
exactly one method.

Alongside it, `VanillaView.mount()` now disposes and rethrows on a failed `onMount()`,
skipping `onDispose()` on the half-built view, and `PageSlot.renderNative` performs
construction inside its rollback scope — which covers EPIC-070's mount-failure constraint.

EPIC-071 also established that the original premise was wrong: the "four violations of one
rule" were **three** violations of **two** rules, and `MermaidBodyView` (US-1055) is **not a
defect** — the rule sentence was stricter than the codebase's own deliberate
create → claim → mount pattern, which 157 constructor `this.child(...)` calls follow. The
rule text in `uikit/CLAUDE.md` was narrowed to match.

## The three gaps

### (1) The clauses cover a *constructor* only

`this.listen()` inside a method called repeatedly is the same no-early-release defect through
another door, and EPIC-071's close review found it **three times in new code** (fixed there by
delegation).

**Proposed rule:** no `this.listen()` outside `onMount()` or the constructor. Measure the
baseline before enabling.

### (2) The rules match `extends VanillaView` **directly**

There are no indirect subclasses today, so coverage is complete by accident of the current
tree — the first `class X extends SomeOtherView` silently leaves the guard's scope.
EPIC-067 already met that shape (`ContentHostFooterView extends EditorToolbarView`, removed
because *a footer contains a toolbar; it is not one*).

**Proposed rule:** forbid any class from extending a `VanillaView` subclass. Zero baseline
today, and it makes the direct match complete by construction.

### (3) Update-path asymmetry — added 2026-08-28 from the US-1173 verification batch

That batch produced **three defects of one shape**:

- **US-1186** — a rest-client child never updated, so the BODY type switch did nothing
- **US-1188** — the bookmarks drawer opened invisible because a props object captured before
  `mount()` overwrote a recovery the child wrote during it
- **EPIC-067's `pipe` regression**

All three are the same class: **the parent's idea of its children's props diverges from the
model's actual state, and nothing type-checks the difference.** Every gate stayed green for
all three, and the symptom in each case was *absence* — which no root count or marker can
measure.

A 77-site sweep for the obvious shape — `const x = this.child(new X(...))` never retained, in
a class that has an update path — found almost all of them benign: dividers, spacers, per-row
views held in collections, static-literal props. Two high-risk singletons were checked and
cleared. **So "not retained" is the wrong detector.**

The signal that actually found US-1186 is **asymmetry: a `sync()`/`onUpdate()` that explicitly
updates every claimed child but one.** That is mechanically checkable — enumerate the claimed
children of a class, enumerate the ones its update path touches, report the difference — and it
is the cheapest of the three clauses to baseline.

**Companion rule worth measuring at the same time:** a props object read after an `await` or
after a child's `mount()` must be re-read from state, not captured beforehand.

### (4) Two more clauses handed over by US-1152 (2026-08-29)

US-1152 fixed five secondary views that re-bound to a replacement model without releasing the
previous subscription. Two rules fall out of it, and both are mechanically checkable:

- **A retained `bind()` handle must be released before rebinding.** `bind()` now returns an
  idempotent release handle (`uikit/shared/vanilla-view.ts`), so the shape to detect is a
  `bind()` call inside a method that can run more than once whose handle is not released first.
- **A `bind()` selector must read only its reactive state argument** — never a lazy getter or a
  directly-assigned model field, which the subscription cannot observe. This is the EPIC-067
  `pipe` class and it recurred in US-1152's own first draft.

**The evidence that prose is not enough:** `model-view-pattern.md` *already* carried the rule
("use `bind()` only when the observed state source outlives the view") while five views violated
it. That is the argument for the lint clause over more documentation.

**Known false positive to exclude:** `() => editor.isMain` inside a binding over
`editor.page?.state` looks like a selector reading a non-state field, but it is the sanctioned
pattern — `EditorModel.ts:210-214` documents `isMain` as deriving from page state and instructs
views to subscribe to `editor.page?.state` for it. The rule must not fire on this shape.

### (5) Bare callback references can lose their model receiver

A class method handed to a view as a bare callback reference must be an arrow property. A
prototype method loses its `this` receiver when the view later invokes the reference, while an
inline React callback such as `onNext={() => model.playNext()}` hides that distinction during a
De-React conversion. This is a candidate lint clause: baseline callback props and event/listener
registrations first, then flag method references that require the owning instance to remain bound.
The rule must allow intentional receiver-free callbacks and should focus on class methods passed
across a model/view boundary rather than banning prototype methods categorically.

**Baseline measured 2026-08-29, which settles the detector shape.** Two sweeps over
`src/renderer`, resolving each referenced name against whether it is declared anywhere as an arrow
property or only as a prototype method:

- **Narrow** — a prop named `on[A-Z]*` assigned a bare `this.model.<prototype method>` reference:
  **0** hits after the fix, and it would have found **exactly** US-1190 before it. Precision 1.0,
  recall 1.0 on the only known instance.
- **Widened** — *any* prop name, any receiver: **95** candidates, essentially all noise. They are
  data properties whose names collide with some unrelated method elsewhere in the codebase
  (`error`, `items`, `refs`, `status`, `rows`).

**So the clause must key on the prop being callback-typed, not on the name of the referenced
method.** Name-matching across the codebase is the wrong axis and produces a 95:1 noise ratio.
The strongest available signal is the declared type of the prop being assigned — a function type
in the target's props interface — with the `on[A-Z]*` naming convention as a cheap proxy that
already achieves a clean baseline. This clause is therefore the **cheapest of the five to land**:
zero existing violations, so it can be turned on as an error with no remediation backlog.

## Implementation plan

1. Read the existing local plugin in `eslint.config.mjs` and the rule text in
   `src/renderer/uikit/CLAUDE.md`.
2. **Baseline each proposed rule before enabling it** — this is what EPIC-071 did, and it is
   what kept the four shipped clauses from landing with a backlog of violations. A rule with a
   non-zero baseline needs its violations fixed or the rule narrowed, in that order.
3. Implement in cheapest-first order: **(3) asymmetry**, then **(2) indirect subclasses**,
   then **(1) `this.listen()` outside `onMount`**.
4. Update `uikit/CLAUDE.md` so the documented rule text matches what the plugin actually
   enforces — EPIC-071's correction showed these drift apart.

## Concerns

- Clause (3) needs a definition of "claimed child" that does not fire on the benign 77 —
  collections, dividers and static-literal props must not be flagged.
- Clause (1)'s baseline is unknown; if it is large, the rule may need to allow an explicit
  opt-out marker rather than being absolute.

## Acceptance criteria

- Each new clause is enabled with a documented baseline measurement.
- `npm run lint` is clean on the tree.
- `uikit/CLAUDE.md`'s rule text matches the enforced behaviour.
