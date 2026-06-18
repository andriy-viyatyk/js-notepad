# US-721: Project trust gate + dialog

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · Foundation #3 (build order)
**Status:** Investigated — doc ready. Not started.

## Goal

Add the **per-project trust gate** that EPIC-034 makes mandatory before any board renders or runs code: a small reactive service that remembers which `.persephone` projects the user has trusted (persisted across sessions in `<userData>/persephone/data/trustedProjects.txt`), plus an **RCE-explicit "Trust project" confirmation dialog**. A `.persephone` project is trusted **iff** its absolute path is listed; trusting appends after explicit confirmation.

This is the **load-bearing security control** of the epic (Concern C4): a board's UI is web content and `execute()` is arbitrary RCE, so nothing may render or spawn until the project is trusted. This task ships the **engine** (service + dialog); the **consumer** — the board editor that renders the webview when trusted and a placeholder when not — is **US-722** (see *Scope boundary* below).

## Background

### What the epic specifies (EPIC-034 → "Project trust gate & dialog", C4)

- **Per `.persephone` project**, not per board; remembered across sessions.
- **Untrusted:** boards do not render; the board editor shows *"Boards are not supported in untrusted projects"* + a **"Trust project"** button → confirmation dialog. No `execute()`/script runs.
- **Trusted:** boards render; `execute()` works.
- **Persistence:** line-delimited absolute `.persephone` folder paths in **`<userData>/persephone/data/trustedProjects.txt`**, via the `fs` data-file helpers (`prepareDataFile` / `saveDataFile`), exactly as `settings.ts` does. "Trust project" **appends** after confirmation.
- **C4 action item (mandatory wording):** the dialog must state plainly that **trusting a project ≡ allowing it to run local programs with your full user privileges** — not a soft "do you trust this folder?".

### Precedents to copy (verified in the codebase)

**1. Line-delimited data file — `src/renderer/api/recent.ts`** is the exact template. It uses a `TGlobalState`, lazy `load()`, and `fs` data-file helpers:

```typescript
// recent.ts — the pattern to mirror
async load(): Promise<void> {
    const data = await fs.getDataFile(recentFileName);
    const files = (data ?? "").split("\n").map((f) => f.trim()).filter((f) => f);
    this.state.update((s) => { s.files = files; });
}
// write:
await fs.saveDataFile(recentFileName, newFiles.join("\n"));
```

`src/renderer/editors/browser/browser-search-history.ts` is a second precedent (it also `prepareDataFile(fileName, "")` on init).

**2. `fs` data-file helpers — `src/renderer/api/fs.ts`** (all async; resolve under `<userData>/data/`; a bare filename is all you pass):

| Helper | Signature | Behavior |
|--------|-----------|----------|
| `fs.prepareDataFile` | `(fileName, defaultContent) => Promise<void>` | Create file with default if absent (creates parent dirs). |
| `fs.getDataFile` | `(fileName) => Promise<string \| undefined>` | Read content; `undefined` if file missing (no throw). |
| `fs.saveDataFile` | `(fileName, content) => Promise<void>` | Overwrite (creates dirs). |

> Resolved location: `C:\Users\<user>\AppData\Roaming\persephone\data\trustedProjects.txt`. **No `require("fs")`/`require("path")`** — use these helpers and `file-path` utilities (CLAUDE.md rules).

**3. Reactive state — `TGlobalState`** (`src/renderer/core/state/state`): `.get()`, `.use(selector)` (React hook), `.update(mutator)`. Used app-wide; `recent.ts` shows the idiom. Reactive trust state lets US-722's editor re-render the moment the user clicks **Trust** (no reopen).

**4. Confirmation dialog — `src/renderer/ui/dialogs/ConfirmationDialog.tsx`** is the precise template for a `showXxxDialog` that returns a `Promise`. Structure: `TDialogModel<Props, Result>` + `Views.registerView(symbolId, Component)` + `showDialog({ viewId, model })`. A generic `showConfirmationDialog({ title, message, buttons }): Promise<string>` already exists and is reused across the app (e.g. `GitChangesSecondaryView.tsx`).

**5. Icons — `src/renderer/theme/icons.tsx`** exports `WarningIcon` and `LockIcon` (both 24px), suitable for the dialog header.

### Why no central app-init wiring

`recent.load()` is **consumer-driven** (called by `RecentFileList.tsx` on mount; `recent.add()` re-`load()`s before mutating). There is **no central startup that loads it**. The trust service follows the same lazy pattern: US-722's board editor calls `load()` on mount and reads the reactive state. So US-721 adds **no** startup/init touchpoint.

## Implementation plan

### Step 1 — Path-comparison helper in `src/renderer/core/utils/file-path.ts`

`.persephone` paths must match canonically (separator + Windows case-insensitivity), so trusting `D:\Proj\.persephone` matches a stored `D:/Proj/.persephone`. `file-path.ts` has no normalizer today — add one (this file is the only sanctioned `require("path")` site).

Append after `fpResolve` (uses the module's existing `path` + `process.platform`, matching `command-runner.ts`'s platform check):

```typescript
/**
 * Normalize an absolute path for *identity comparison* — resolves to absolute,
 * unifies separators to "/", strips a trailing slash, and lowercases on Windows
 * (a case-insensitive filesystem). Use only for equality checks, never for display.
 */
export function fpNormalizeForCompare(filePath: string): string {
    const resolved = path.resolve(filePath).replace(/\\/g, "/").replace(/\/+$/, "");
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
```

### Step 2 — Trust service `src/renderer/api/project-trust.ts` (new)

Mirror `recent.ts`. Store **raw** paths in the file (human-readable, original case); compare via `fpNormalizeForCompare`.

```typescript
import { TGlobalState } from "../core/state/state";
import { fs } from "./fs";
import { fpNormalizeForCompare } from "../core/utils/file-path";

const trustedProjectsFileName = "trustedProjects.txt";

interface ProjectTrustState {
    paths: string[]; // absolute .persephone folder paths, original case
}

class ProjectTrust {
    private readonly state = new TGlobalState<ProjectTrustState>({ paths: [] });

    /** Load the trusted list from disk into reactive state. Lazy, like recent.load(). */
    async load(): Promise<void> {
        await fs.prepareDataFile(trustedProjectsFileName, "");
        const data = await fs.getDataFile(trustedProjectsFileName);
        const paths = (data ?? "").split("\n").map((p) => p.trim()).filter((p) => p);
        this.state.update((s) => { s.paths = paths; });
    }

    /** Sync check against currently-loaded state (call load() first on mount). */
    isTrusted(persephonePath: string): boolean {
        const key = fpNormalizeForCompare(persephonePath);
        return this.state.get().paths.some((p) => fpNormalizeForCompare(p) === key);
    }

    /** Reactive hook for views — re-renders when the project's trust flips. */
    useIsTrusted(persephonePath: string): boolean {
        const key = fpNormalizeForCompare(persephonePath);
        return this.state.use((s) => s.paths.some((p) => fpNormalizeForCompare(p) === key));
    }

    /** Append a project to the trusted list (idempotent). Caller confirms first. */
    async trust(persephonePath: string): Promise<void> {
        await this.load(); // re-read so we don't clobber a concurrent write
        if (this.isTrusted(persephonePath)) return;
        const paths = [...this.state.get().paths, persephonePath];
        this.state.update((s) => { s.paths = paths; });
        await fs.saveDataFile(trustedProjectsFileName, paths.join("\n"));
    }
}

export const projectTrust = new ProjectTrust();
```

- **Not exposed on `app`** and not in any script `.d.ts` — this is internal security infra consumed only by the board editor (US-722), not scriptable in v1.

### Step 3 — Trust dialog `src/renderer/ui/dialogs/TrustProjectDialog.tsx` (new)

Mirror `ConfirmationDialog.tsx` exactly, but with a warning-styled body that satisfies the C4 wording action item and shows the project path. Return `Promise<boolean>` (`true` ⇒ user trusted).

```typescript
import { showDialog } from "./Dialogs";
import { Dialog, DialogContent, Panel, Text, Button } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { WarningIcon } from "../../theme/icons";
import { TComponentState } from "../../core/state/state";

const trustProjectDialogId = Symbol("trustProjectDialog");

interface TrustProjectDialogProps {
    projectPath: string; // absolute .persephone (or project root) path, for display
}

class TrustProjectDialogModel extends TDialogModel<TrustProjectDialogProps, boolean> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") { e.preventDefault(); this.close(false); }
    };
}

function TrustProjectDialog({ model }: ViewPropsRO<TrustProjectDialogModel>) {
    const state = model.state.use();
    return (
        <Dialog name="trust-project-dialog" onKeyDown={model.handleKeyDown}>
            <DialogContent
                title="Trust this project?"
                icon={<WarningIcon />}
                onClose={() => model.close(false)}
                minWidth={420}
                maxWidth={640}
            >
                <Panel direction="column" gap="md" paddingX="xxl" paddingY="xl">
                    <Text>
                        Trusting this project lets its boards run programs on your computer
                        with your full user privileges — including reading and changing your
                        files and using any signed-in command-line tools (cloud CLIs, git, etc.).
                    </Text>
                    <Text>Only trust projects you created or fully understand.</Text>
                    <Text color="light">{state.projectPath}</Text>
                </Panel>
                <Panel direction="row" justify="end" gap="sm" padding="md">
                    <Button onClick={() => model.close(false)}>Cancel</Button>
                    <Button onClick={() => model.close(true)}>Trust Project</Button>
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(trustProjectDialogId, TrustProjectDialog as DefaultView);

export function showTrustProjectDialog(projectPath: string) {
    const model = new TrustProjectDialogModel(new TComponentState({ projectPath }));
    return showDialog({ viewId: trustProjectDialogId, model }) as Promise<boolean>;
}
```

- Render **"Trust Project"** as the primary/emphasis action if the `Button` API exposes a variant prop; otherwise plain `Button` is fine (wording carries the weight). Confirm `Button`'s variant prop at implementation time — do **not** invent one.
- If `src/renderer/ui/dialogs/index.ts` re-exports the other dialogs, add `export * from "./TrustProjectDialog";` there too.

### Step 4 — Consumption snippet (for US-722, **not** built here)

The board editor will gate rendering like this (documented here so US-722 has the contract):

```typescript
// US-722 board editor (illustrative — not part of US-721)
useEffect(() => { projectTrust.load(); }, []);
const trusted = projectTrust.useIsTrusted(persephonePath);
// trusted ? <BoardWebview/> : <UntrustedProjectView path={persephonePath} onTrust={async () => {
//     if (await showTrustProjectDialog(persephonePath)) await projectTrust.trust(persephonePath);
// }} />
```

## Scope boundary (what US-721 does NOT build)

The epic's one-line "**untrusted UX** + Trust confirmation" spans two tasks. US-721 ships the **service + dialog** (the testable, reusable, load-bearing core). The **in-editor untrusted placeholder** — the centered *"Boards are not supported in untrusted projects"* panel with the **Trust project** button — is built in **US-722**, because:

- It replaces the board **webview region**, which does not exist until US-722's board editor.
- It cannot be tested end-to-end without that host.
- Its only logic is the Step-4 snippet (call the dialog, then `projectTrust.trust`), which is trivial to wire where the webview would mount.

This mirrors the US-719 (engine) / US-720 (lifecycle) carving. *(If you'd rather the placeholder live in US-721 — see Concern C2.)*

## Concerns / open questions

- **C1 — Dedicated dialog vs reuse `showConfirmationDialog`. ✅ decided (user, 2026-06-18): dedicated.** Build the dedicated `TrustProjectDialog` (Step 3) rather than reusing the generic `showConfirmationDialog` (which renders `message` as one `<Text>`). C4 makes the wording/visual weight load-bearing, so the dialog carries a warning icon, multi-paragraph RCE text, and the **project path** — closer to VS Code's workspace-trust prompt. Cost is ~50 lines mirroring `ConfirmationDialog.tsx`.

- **C2 — Where the untrusted placeholder lives. ✅ decided (user, 2026-06-18): defer to US-722.** The epic lists "untrusted UX" under US-721, but the `UntrustedProjectView` panel replaces the board webview region that does not exist until US-722, so it ships with its host (testable in context). US-721 stays the service + dialog; US-722 builds the panel and wires it per the Step-4 snippet. Mirrors the US-719 (engine) / US-720 (consumer) carving.

- **C3 — Windows path casing / separators. ✅ resolved.** Stored paths keep original case (human-readable file); matching uses `fpNormalizeForCompare` (resolve + `/`-separators + lowercase on win32). Prevents `D:\Proj` ≠ `d:/proj` false negatives.

- **C4 — Concurrent append clobbering the file. ✅ resolved.** `trust()` calls `load()` first (re-reads disk into state) before appending, mirroring `recent.add()`. The file is tiny and writes are rare (a user clicking Trust), so last-writer-wins is acceptable; the pre-read avoids dropping an entry added by another window.

- **C5 — No script/`app` exposure. ✅ resolved.** Trust is internal security infra; exposing `trust()`/`isTrusted()` to user scripts would let a script silently self-trust. Keep `projectTrust` a plain module singleton, out of every `.d.ts`.

- **C6 — Revoking trust (untrust) — deferred.** v1 only appends (per the epic). No remove/untrust API or UI; a user can hand-edit `trustedProjects.txt`. Add a managed "untrust" later if a use case appears (Future directions).

- **C7 — Which path is the trust key. ✅ resolved.** The **`.persephone` folder absolute path** (per the epic: "a board is trusted iff its `.persephone` path is listed"). US-722 supplies it from the folder-click route. The dialog may *display* the project root for friendliness, but the stored/compared key is the `.persephone` path.

## Acceptance criteria

1. `<userData>/persephone/data/trustedProjects.txt` is created (empty) on first `projectTrust.load()` and never throws when absent.
2. `projectTrust.trust(p)` appends `p` as a new line; calling it again with the same path (any case/separator variant on Windows) is a **no-op** (no duplicate line).
3. After `trust(p)`, `isTrusted(p)` returns `true` for `p` and for case/separator variants on Windows; `isTrusted(other)` returns `false`.
4. The list survives an app restart (reloaded from the file).
5. `showTrustProjectDialog(path)` resolves `true` only when **Trust Project** is clicked; `false` on **Cancel**, the **X**, or **Escape**. The body text plainly states the RCE/full-privilege implication and shows the path.
6. `useIsTrusted` re-renders a subscribed component when the project's trust flips (verified in US-722; in US-721 verify the reactive state updates).
7. `npm run lint` clean; no `require("fs")`/`require("path")` introduced; no hardcoded colors.

### How to verify via MCP (no board editor needed)

`execute_script` exercises the data layer + consent flow directly (remember to `return`):

```javascript
const { projectTrust } = await import("@/api/project-trust"); // adjust to actual import path
const p = "D:/__trust_test__/.persephone";
await projectTrust.load();
const before = projectTrust.isTrusted(p);
await projectTrust.trust(p);
await projectTrust.trust(p); // idempotent
await projectTrust.load();    // re-read from disk
return JSON.stringify({ before, after: projectTrust.isTrusted(p),
    variant: projectTrust.isTrusted("d:\\__TRUST_TEST__\\.persephone") });
// expect { before:false, after:true, variant:true }
```

The dialog can be shown with `showTrustProjectDialog("D:/Proj/.persephone")` and the returned promise inspected. Clean up the test entry from `trustedProjects.txt` afterward.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/core/utils/file-path.ts` | **Edit** — add `fpNormalizeForCompare`. |
| `src/renderer/api/project-trust.ts` | **New** — `projectTrust` service (load / isTrusted / useIsTrusted / trust). |
| `src/renderer/ui/dialogs/TrustProjectDialog.tsx` | **New** — `showTrustProjectDialog`, RCE-explicit confirmation. |
| `src/renderer/ui/dialogs/index.ts` | **Edit (if it re-exports dialogs)** — export `TrustProjectDialog`. |

### Files needing NO changes

- `src/renderer/api/fs.ts` — data-file helpers used as-is.
- `src/renderer/api/recent.ts`, `ConfirmationDialog.tsx` — read-only templates.
- No app-startup/init file — trust loads lazily (consumer-driven), like `recent`.
- `src/main/*` — trust persistence is renderer-side via `fs` data-file helpers; no new IPC.
- `src/renderer/api/app.ts` — trust is intentionally not on the `app` object model.
