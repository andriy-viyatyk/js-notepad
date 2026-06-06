# US-610: Git service + IPC + "Git integration" setting + host detection

**Epic:** [EPIC-030 — Git Integration](../../epics/EPIC-030.md)
**Status:** Implemented (2026-06-06) — typecheck + lint clean; **awaiting manual testing**
**Sequence:** Foundation task. US-611 (Git Tree component), US-612 (Git Tree editor), US-613 (File Diff editor) all build on what this lands.

## Goal

Lay the foundation for Git in Persephone: a main-process git wrapper (`simple-git`), the request/response IPC to reach it from the renderer, an off-by-default **"Git integration"** setting that gates all git behavior, and **detect-once git-repo membership on the shared text-file host** (`TextFileModel.state.gitRepo`) so later tasks can offer the File Diff switch for free. No git *editor* and no user-visible git UI ship in this task (those are US-612/US-613) — this is plumbing plus the settings toggle.

## Background — patterns this task reuses

### Request/response IPC (the `controller` mechanism — NOT the streaming search one)

Persephone has **two** IPC styles:

- **Streaming** (`src/main/search-service.ts` + `src/ipc/search-ipc.ts`): raw `ipcMain.on` + `event.sender.send`, many messages per request. Used by file-content search. **Not what git detection needs.**
- **Request/response** (the `controller`): promise-based, one reply per call. This is the right fit for git probe + repo detection.

The request/response path, end to end:

- **`src/ipc/api-types.ts`** — `enum Endpoint` (channel names) + `type Api` (renderer-side signatures). Example: `[Endpoint.getAppVersion]: () => Promise<string>;` (`api-types.ts:102`).
- **`src/ipc/main/controller.ts`** — a `Controller` class whose methods take `(event: IpcMainEvent, ...args)` and return a promise; each is wired in `init()` via `bindEndpoint(Endpoint.X, controllerInstance.X)` (`controller.ts:246-308`). Handlers commonly **lazy-import** their implementing module, e.g. `openInVlc` does `const { openInVlc } = await import("../../main/vlc-launcher")` (`controller.ts:238-241`). `bindEndpoint` wraps the handler in try/catch and replies with the result or an `Error` (`controller.ts:246-257`).
- **`src/ipc/renderer/api.ts`** — `ApiCalls` class; each method calls `executeOnce<T>(Endpoint.X, ...args)`. Exported singleton `api`. Renderer calls `await api.X(...)`.

Adding an endpoint = 4 edits: `Endpoint` enum + `Api` type (api-types.ts), handler method + `bindEndpoint` (controller.ts), client method (renderer/api.ts).

### The shared text-file host — where `gitRepo` lives (D4 / Concern 2A)

`src/renderer/editors/text/TextEditorModel.ts` — `class TextFileModel extends TDialogModel implements IContentHost`. Every text editor (Monaco, Markdown, Grid, …) wraps the **same** `TextFileModel` as its host, inherited across editor switches via `adoptHost`, so detection runs **once** and survives switches.

- State type: `TextFileEditorModelState extends IEditorState` (`TextEditorModel.ts:18-35`). This is where `gitRepo` is added.
- `filePath` is resolved during `restore()` → `io.restore()` reads through the pipe (`TextFileIOModel.ts:203-280`) and sets `s.filePath`/`s.title`. After that point the file path is known.
- `restore()` on the model (`TextEditorModel.ts:348-355`) is the natural place to kick off detection (after `io.restore()`).
- `filePath` can also change later via `saveFile` (Save As) and `applyRenamedPath` (`TextFileIOModel.ts:80-201`).

### The editor switch widget — reactivity wrinkle (Concern 2A)

`SwitchWidget` in `src/renderer/editors/base/PageToolbar.tsx:60-84` renders the `Text Editor / Preview / …` `SegmentedControl` from `model.findCompatibleEditors()`. It currently subscribes only to `model.state` (`PageToolbar.tsx:64-68`). Because `gitRepo` will live on **host** state (not the editor's own state), the widget needs an extra subscription to `model.contentHost?.state` so it re-renders when async detection lands. `EditorModel` exposes `get contentHost(): IContentHost | null` (`EditorModel.ts:211`), so `model.contentHost?.state.use(...)` is valid here.

> Note: the *visible* File Diff switch and `file-diff.accepts({host})` register with the **editor**, which is US-613. This task adds the host-state subscription as inert plumbing (it changes nothing visible until US-613 registers `file-diff`). See Concern C.

### The Settings page — toggle + inline async probe (Concern 4)

`src/renderer/editors/settings/SettingsView.tsx` is composed of hand-written section components, each rendered between `<Divider />`s in the `SettingsView` return (`SettingsView.tsx:1091-1177`). The closest pattern to copy is **`McpSection`** (`SettingsView.tsx:677-810`):

- reactive read `const mcpEnabled = settings.use("mcp.enabled")` (`:678`),
- toggle `settings.set("mcp.enabled", !mcpEnabled)` (`:699-701`),
- an `useEffect` that fetches live status via `api.getMcpStatus()` and renders an inline `<Dot>` + `<Text>` (`:689-697`, `:777-795`).

The git section copies this shape: a `Checkbox` bound to `git.enabled`, plus an inline probe via a new `api.gitProbe()` showing "Git X.Y detected" / "git not found on PATH".

### Settings storage

`src/renderer/api/settings.ts`: keys are a `AppSettingsKey` union (`:22-44`), with defaults in `defaultAppSettingsState.settings` (`:78-102`) and human comments in `settingsComments` (`:52-76`). The script-facing `ISettings` type (`src/renderer/api/types/settings.d.ts`) uses a generic `get<T>(key: string)` — **no key enum to sync there**. Adding `"git.enabled"` touches `settings.ts` only.

## Implementation plan

### Step 1 — Add the `simple-git` dependency

- `npm install simple-git` (pure-JS CLI wrapper — no native module, so no rebuild against the Castlabs Electron fork; this is exactly why it was chosen, D1).
- Pin the resolved version in `package.json` `dependencies`. Record the exact version in the Files Changed table on completion.
- It runs **only in the main process** (`src/main/git-service.ts`). Never import it in renderer code.

### Step 2 — `src/main/git-service.ts` (new) — the simple-git wrapper

Owns all `simple-git` usage, lazy-imported by the controller. v1 exposes exactly two operations (log/show/diff come in US-611/US-613):

```ts
import simpleGit from "simple-git";

export interface GitProbeResult {
    installed: boolean;
    version?: string;   // e.g. "2.43.0"
}

export interface GitRepoInfo {
    root: string;       // absolute repo top-level (forward-slashed by git)
    branch: string;     // current branch, or "HEAD" when detached
}

/** `git --version` availability probe for the settings page. Never throws. */
export async function probeGit(): Promise<GitProbeResult> {
    try {
        const v = await simpleGit().raw(["--version"]); // "git version 2.43.0"
        const m = v.match(/(\d+\.\d+\.\d+)/);
        return { installed: true, version: m?.[1] };
    } catch {
        return { installed: false };
    }
}

/** Resolve the repo root + branch for a directory. Returns null when `dir`
 *  is not in a git repo, or git is unavailable. Never throws.
 *  Uses `rev-parse --show-toplevel` — correct for submodules / worktrees /
 *  bare repos where `.git` is a FILE, not a folder (so NOT a `.git` walk). */
export async function detectRepo(dir: string): Promise<GitRepoInfo | null> {
    try {
        const git = simpleGit(dir);
        const root = (await git.revparse(["--show-toplevel"])).trim();
        if (!root) return null;
        let branch = "HEAD";
        try {
            branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim() || "HEAD";
        } catch { /* detached/empty repo — keep "HEAD" */ }
        return { root, branch };
    } catch {
        return null; // not a repo, or git missing → graceful (Concern 4)
    }
}
```

Notes:
- `detectRepo` takes the **file's directory** as cwd (the renderer passes `dirname(filePath)`).
- All failures resolve to `null`/`{installed:false}` — no errors propagate (graceful degradation, Concern 4).

### Step 3 — Wire the two endpoints through the controller

**`src/ipc/api-types.ts`:**
- Add to `enum Endpoint`: `gitProbe = "gitProbe"`, `gitDetectRepo = "gitDetectRepo"`.
- Add to `type Api`:
  ```ts
  [Endpoint.gitProbe]: () => Promise<GitProbeResult>;
  [Endpoint.gitDetectRepo]: (dir: string) => Promise<GitRepoInfo | null>;
  ```
- Import the `GitProbeResult` / `GitRepoInfo` types. **Decision needed (Concern A):** either import them from `../main/git-service` or declare them in a new `src/ipc/git-ipc.ts` and have the service import from there. Recommended: declare the DTOs in **`src/ipc/git-ipc.ts`** (shared, no main-only deps) and have `git-service.ts` import them — keeps `api-types.ts` free of a `src/main` import.

**`src/ipc/main/controller.ts`:**
- Add two handler methods on `Controller` (lazy-importing the service, mirroring `openInVlc`):
  ```ts
  gitProbe = async (): Promise<GitProbeResult> => {
      const { probeGit } = await import("../../main/git-service");
      return probeGit();
  };
  gitDetectRepo = async (_event: IpcMainEvent, dir: string): Promise<GitRepoInfo | null> => {
      const { detectRepo } = await import("../../main/git-service");
      return detectRepo(dir);
  };
  ```
- Register both in `init()`: `bindEndpoint(Endpoint.gitProbe, controllerInstance.gitProbe);` and `bindEndpoint(Endpoint.gitDetectRepo, controllerInstance.gitDetectRepo);`.

**`src/ipc/renderer/api.ts`:**
- Add client methods:
  ```ts
  gitProbe = async () => executeOnce<GitProbeResult>(Endpoint.gitProbe);
  gitDetectRepo = async (dir: string) => executeOnce<GitRepoInfo | null>(Endpoint.gitDetectRepo, dir);
  ```

> No new `initGitHandlers()` in `main-setup.ts` — the controller is already initialized via `controller.init()` (`main-setup.ts:42`). This is the divergence from the epic's "git-ipc.ts + git-service.ts streaming" sketch; see Concern A.

### Step 4 — `src/renderer/api/git.ts` (new) — renderer git API + directory-keyed cache

Thin wrapper the host calls; owns the **per-directory detection cache** (Concern 2A) so the first file in a folder spawns git and every sibling is a cache hit. Caches negative results too (so non-repo files don't re-spawn).

```ts
import { fpDirname } from "../core/utils/file-path";
import { api } from "../../ipc/renderer/api";
import { settings } from "./settings";
import type { GitRepoInfo, GitProbeResult } from "../../ipc/git-ipc";

// dir → resolved repo info (or null). Shared promise so concurrent opens in
// the same dir collapse to one spawn. Lives for the process lifetime (v1 —
// no invalidation; see Concern E).
const repoCache = new Map<string, Promise<GitRepoInfo | null>>();

export const git = {
    /** Detect repo membership for a file path. Honors the "git.enabled"
     *  setting — returns null (no spawn) when off or for untitled buffers. */
    detectRepoForFile(filePath: string | undefined): Promise<GitRepoInfo | null> {
        if (!settings.get("git.enabled") || !filePath) return Promise.resolve(null);
        const dir = fpDirname(filePath);
        if (!dir) return Promise.resolve(null);
        let p = repoCache.get(dir);
        if (!p) {
            p = api.gitDetectRepo(dir).catch(() => null);
            repoCache.set(dir, p);
        }
        return p;
    },

    /** Settings-page availability probe (not cached). */
    probe(): Promise<GitProbeResult> {
        return api.gitProbe();
    },
};
```

### Step 5 — `gitRepo` on the host + detection trigger (D4 / Concern 2A)

**`src/renderer/editors/text/TextEditorModel.ts`:**

- Add to `TextFileEditorModelState` (`:18-35`):
  ```ts
  /** Git repo membership, detected once on filePath resolve when the
   *  "Git integration" setting is on. `undefined` = not yet checked;
   *  `null` = checked, not a repo (or git unavailable). */
  gitRepo?: { root: string; branch: string } | null;
  ```
  Do **not** add it to `getDefaultTextFileEditorModelState()` (leave `undefined`). Do **not** persist it in `getDescriptor()`/`getRestoreData()` — it's re-detected on restore, like `detectedContentEditor`.

- Add a detection method and call it after restore + after path changes:
  ```ts
  /** Detect git repo membership for the current filePath (gated by the
   *  "Git integration" setting). Fire-and-forget; writes host state. */
  detectGitRepo = async () => {
      const { git } = await import("../../api/git");
      const filePath = this.state.get().filePath;
      const info = await git.detectRepoForFile(filePath);
      const next = info ?? null;
      const cur = this.state.get().gitRepo;
      if (cur?.root !== next?.root || cur?.branch !== next?.branch) {
          this.state.update((s) => { s.gitRepo = next; });
      }
  };
  ```
  - In `restore()` (`:348-355`), after `await this.io.restore();`, add `void this.detectGitRepo();` (non-blocking).
  - **Path-change hooks:** re-run after Save As / rename. Simplest: call `void this.model.detectGitRepo()` at the end of `TextFileIOModel.saveFile` (after the state update, `:135-147`) and `applyRenamedPath` (`:193-201`). (Untitled→saved transitions a buffer into a repo; rename can move it across repo boundaries.)

### Step 6 — SwitchWidget host-state subscription (Concern 2A, inert until US-613)

**`src/renderer/editors/base/PageToolbar.tsx`** — in `SwitchWidget` (`:60-68`), add a host-state subscription so the widget re-renders when async git detection updates `host.state.gitRepo`:

```ts
function SwitchWidget({ model }: { model: EditorModel }) {
    model.state.use((s) => ({
        language: (s as { language?: string }).language,
        filePath: (s as { filePath?: string }).filePath,
        editor: (s as { editor?: string }).editor,
    }));
    // Re-render when async git detection lands on the shared host (EPIC-030).
    model.contentHost?.state.use((s) => (s as { gitRepo?: unknown }).gitRepo);
    const options = model.findCompatibleEditors();
    ...
}
```

This is harmless before US-613 (no `file-diff` editor is registered yet, so `findCompatibleEditors()` is unchanged). See Concern C.

### Step 7 — "Git integration" setting + Settings UI

**`src/renderer/api/settings.ts`:**
- Add `"git.enabled"` to the `AppSettingsKey` union (`:22-44`).
- Add default `"git.enabled": false` to `defaultAppSettingsState.settings` (`:78-102`).
- Add a comment to `settingsComments` (`:52-76`):
  ```ts
  "git.enabled": "Enable Git integration (Git Tree + File Diff editors).\nOff by default. Requires git installed and on PATH.",
  ```
- **Do not** add a persisted "probe result" key — the probe is live, rendered from component state (like MCP status).

**`src/renderer/editors/settings/SettingsView.tsx`:**
- Add a `GitIntegrationSection()` mirroring `McpSection` (toggle + inline probe). Skeleton:
  ```tsx
  function GitIntegrationSection() {
      const gitEnabled = settings.use("git.enabled");
      const [probe, setProbe] = useState<{ installed: boolean; version?: string } | null>(null);
      useEffect(() => {
          if (!gitEnabled) { setProbe(null); return; }
          let alive = true;
          import("../../api/git").then(({ git }) => git.probe())
              .then((r) => { if (alive) setProbe(r); })
              .catch(() => { if (alive) setProbe({ installed: false }); });
          return () => { alive = false; };
      }, [gitEnabled]);
      return (
          <>
              <Panel paddingBottom="lg"><Text bold size="sm">Git Integration</Text></Panel>
              <Panel paddingBottom="md">
                  <Text color="light" size="xs">
                      Enable Git Tree and File Diff editors. Off by default — requires git installed and on PATH.
                  </Text>
              </Panel>
              <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                  <Checkbox checked={gitEnabled} onChange={() => settings.set("git.enabled", !gitEnabled)}>
                      Enable Git integration
                  </Checkbox>
              </Panel>
              {gitEnabled && probe && (
                  <Panel direction="row" align="center" gap="md" paddingBottom="lg">
                      <Dot size="sm" color={probe.installed ? "success" : "neutral"} />
                      <Text size="sm" color="light">
                          {probe.installed
                              ? `Git ${probe.version ?? ""} detected`.trim()
                              : "git not found on PATH — install git or fix PATH"}
                      </Text>
                  </Panel>
              )}
          </>
      );
  }
  ```
- Render it in `SettingsView`'s return between two `<Divider />`s (e.g. right after `<McpSection />`, `SettingsView.tsx:1156-1158`):
  ```tsx
  <Panel paddingY="xl"><Divider /></Panel>
  <GitIntegrationSection />
  ```
  Confirm `Checkbox`, `Dot`, `Panel`, `Text` are already imported in this file (they are — used by `McpSection`).

## Concerns / open questions (need user input before implementing)

### A. IPC mechanism — controller endpoints vs. a bespoke `git-ipc.ts` streaming channel set — ✅ RESOLVED (2026-06-06)
The epic's "Proposed shape" sketched `git-service.ts` + `git-ipc.ts` "following the search-service pattern." But the search-service pattern is **streaming** (multi-message), and git detection is **request/response** (one reply).

**Decision (user-approved):** keep a dedicated `src/main/git-service.ts` (isolates `simple-git`, lazy-loaded) and expose it via **two controller endpoints** (`gitProbe`, `gitDetectRepo`) — reusing the proven promise-based plumbing, matching how `openInVlc`/`createVideoStreamSession` lazy-import their services. `src/ipc/git-ipc.ts` exists **only as the shared DTO module** (`GitProbeResult`, `GitRepoInfo`), not a channel set. US-611/US-613 add their git operations (log/show/diff) as further controller endpoints. If US-611's history load later needs streaming for large repos, that single operation can become a streaming channel then — detection/probe stay request/response regardless.

### B. No user-visible result from US-610 alone — ✅ RESOLVED (2026-06-06)
This task ships **no visible git UI**: the File Diff switch needs the `file-diff` editor (US-613) and the `.git` Explorer icon needs US-612. The only visible surface is the **Settings toggle + probe**. Repo detection is verifiable via DevTools (open a file in a repo with the setting on → `host.state.gitRepo` populates) but there's nothing to click.

**Decision (user-approved):** accepted. The task's "done" state is the **Settings toggle + probe** working, with detection verified via DevTools. **No throwaway UI** added.

### C. Does the SwitchWidget subscription (Step 6) belong in US-610 or US-613? — ✅ RESOLVED (2026-06-06)
It's inert until `file-diff` is registered (US-613). **Decision (user-approved):** include it now in US-610 (one harmless line, keeps the detection plumbing cohesive in the foundation task).

### D. Re-detection when the setting is toggled ON while files are open — ✅ RESOLVED (2026-06-06)
v1 runs detection on file open/restore and on save/rename. **Decision (user-approved):** accept for v1 — files already open when the setting is enabled won't show as in-repo until reopened. (A `settings.onChanged` re-detect of open hosts is a possible post-v1 refinement.)

### E. Detection cache invalidation — ✅ RESOLVED (2026-06-06)
The per-directory cache lives for the process lifetime with no invalidation. **Decision (user-approved):** accept for v1 (matches the "manual/on-open refresh" stance in Concern 7). Edge cases — `git init` in an already-open folder, or deleting a repo — are not reflected until restart.

### F. Branch label for detached HEAD / empty repo — ✅ ACK (2026-06-06)
`rev-parse --abbrev-ref HEAD` returns `"HEAD"` when detached and errors on a fresh repo with no commits. Handled by defaulting `branch = "HEAD"`. The `branch` field is informational in v1 (no consumer renders it yet). Acceptable — acknowledged by user.

### G. `simple-git` packaging — ✅ ACK (2026-06-06)
`simple-git` is pure JS (no native bindings) so it needs no electron-builder unpack/rebuild. It does shell out to the `git` binary at runtime (the user's installed git, by design — Concern 4). No bundling of a git binary (explicitly out of scope). No action needed beyond the dependency add — acknowledged by user.

## Acceptance criteria

- [ ] `simple-git` added to `dependencies`; app builds and runs (`npm start`) with the setting **off** behaving exactly as today (zero git spawns — verify no `git` child processes on file open).
- [ ] `src/main/git-service.ts` exposes `probeGit()` and `detectRepo(dir)`, both never-throwing (return `{installed:false}` / `null` on failure).
- [ ] `gitProbe` and `gitDetectRepo` endpoints wired through `api-types.ts` → `controller.ts` → `renderer/api.ts`; `await api.gitProbe()` and `await api.gitDetectRepo(dir)` work from the renderer.
- [ ] Settings page shows a **"Git Integration"** section: an off-by-default toggle; enabling it runs the probe and shows "Git X.Y detected" (git installed) or "git not found on PATH…" (git missing) inline.
- [ ] With the setting **on**, opening a file inside a git repo populates `host.state.gitRepo = { root, branch }`; opening a file outside any repo (or an untitled buffer) leaves it `null`. Verified via DevTools.
- [ ] Opening multiple files from the **same directory** spawns git at most once (per-directory cache hit — verify via a single `git` invocation).
- [ ] With the setting **on** but git uninstalled/removed from PATH, detection returns `null` and nothing errors at the user (graceful degradation).
- [ ] `SwitchWidget` gains the `contentHost.state` subscription (Step 6) and the existing switch (Text Editor / Preview / …) behaves unchanged.
- [ ] Typecheck (`npm run typecheck`) and lint (`npm run lint`) pass.

## Files changed (to fill in on completion)

| File | Change |
|------|--------|
| `package.json` | Add `simple-git` dependency (`^3.36.0`) |
| `src/main/git-service.ts` | **New** — `probeGit()`, `detectRepo(dir)` (simple-git) |
| `src/ipc/git-ipc.ts` | **New** — shared DTOs `GitProbeResult`, `GitRepoInfo` |
| `src/ipc/api-types.ts` | Add `gitProbe`, `gitDetectRepo` to `Endpoint` + `Api` |
| `src/ipc/main/controller.ts` | Add two handlers + `bindEndpoint` registrations |
| `src/ipc/renderer/api.ts` | Add `gitProbe`, `gitDetectRepo` client methods |
| `src/renderer/api/git.ts` | **New** — renderer git API + per-directory detection cache |
| `src/renderer/editors/text/TextEditorModel.ts` | Add `gitRepo` to state + `detectGitRepo()`; call in `restore()` |
| `src/renderer/editors/text/TextFileIOModel.ts` | Re-detect after `saveFile` / `applyRenamedPath` |
| `src/renderer/editors/base/PageToolbar.tsx` | `SwitchWidget` host-state subscription (Step 6) |
| `src/renderer/api/settings.ts` | Add `"git.enabled"` key + default + comment |
| `src/renderer/editors/settings/SettingsView.tsx` | Add `GitIntegrationSection` (toggle + probe) |

### Files that need NO changes (so implementation doesn't waste time investigating)

- `src/renderer/api/types/settings.d.ts` — script-facing `ISettings` uses generic `get<T>(key)`; no key enum to sync.
- `src/main/main-setup.ts` — controller is already initialized (`controller.init()`); no `initGitHandlers()` needed (per Concern A's recommended approach).
- `src/renderer/editors/register-editors.ts` — `file-diff` registration is **US-613**, not here.
- `src/renderer/editors/compare/CompareEditor.tsx` — untouched (D2).
- `src/renderer/content/tree-providers/FileTreeProvider.ts` — the `.git` Explorer icon/redirect is **US-612**.
