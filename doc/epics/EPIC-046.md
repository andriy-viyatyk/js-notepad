# EPIC-046: Board Environment Variables — secure, out-of-board secret storage

## Status

**Status:** Planned
**Created:** 2026-07-21

## Overview

Boards today have no first-class way to store secrets (connection strings, API keys, passwords).
The only option is a `.env`-style file **inside the board folder** — which leaks the moment the
board is copied, shared over a messenger, or forgotten in `.gitignore`. This epic gives boards a
secret store that lives **outside** the board: a single, user-configured `.env.json` file whose
location is set in Persephone settings, optionally password-encrypted with Persephone's existing
file-encryption mechanism. A board reads and writes only its **own** namespace via a new
`persephone.var.*` bridge API; a built-in editor lets the user review the file; and when a board
requests an encrypted-but-locked file, Persephone prompts for the password and either serves the
values or rejects the request.

## Goals

- A board (e.g. the Snowflake viewer) stores its connection string in a file the user keeps in a
  safe location — never in the shareable/committable board folder.
- Encryption is **optional** and reuses the existing mechanism (`shell.encryption` /
  `ui.password` / `TextFileModel.decrypt`) — no new crypto, no new encryption UI.
- Password-based encryption only (portable across machines) — deliberately **not** OS-bound
  (`safeStorage`/DPAPI), which breaks on non-persistent/pooled VMs where the physical host changes.
- Per-board isolation by a **stable, human-readable** namespace (`author/name`) so the same board
  keeps one namespace across its dev-repo copy and its installed copy.
- The board expects and handles rejection (locked-and-cancelled, not-configured, user-declined).

## Design

### Threat model (what this does and does not protect)

Boards are RCE-capable — a trusted board runs arbitrary Node via `executeNode` and could read any
file on disk directly. So `persephone.var.*` per-board isolation is **accident-prevention + a clean
per-board UX**, not a hard sandbox against a malicious board. The real security wins are:
**(1) secrets stored outside the shareable board folder** (solves the copy/share/commit-leak
problem) and **(2) optional password encryption at rest** (protects the file if the file/machine is
stolen). The board-trust dialog remains the actual security gate. The API and docs must frame it
this way — namespacing is convenience, not a boundary a malicious board can't cross.

### Storage file & settings

- A single global `.env.json` file; its **path is a Persephone setting** (`settings.ts`). Default
  location offered when creating it: the Persephone data folder (user-changeable).
- Encryption is optional and reuses the existing mechanism. The file's content is either plain
  JSON or an `ENC-v001:`-prefixed encrypted string (`shell.encryption.isEncrypted`). The user
  encrypts/decrypts it with the **existing** file menu functionality — no new encryption UI.
- **Password-only, never OS-bound.** We deliberately do not use Electron `safeStorage`/DPAPI: it
  is machine/OS-account-bound and fails on non-persistent pooled VMs (the same failure mode as
  `az login` losing its DPAPI-encrypted token when the VM lands on a different physical host).
  Password-based AES-GCM (the existing `shell.encryption`) is portable and host-independent.

### Schema

`namespace → profile → key → value`, with a `default` profile used when `env` is omitted:

```json
{
  "Persephone/Excel Viewer": {
    "default": { "SNOWFLAKE_SERVER": "…", "SNOWFLAKE_USER": "…" },
    "dev":     { "SNOWFLAKE_SERVER": "…" },
    "qa":      { "…": "…" }
  }
}
```

### Namespace — `author/name` with path fallback

- The per-board key is the board manifest's **`author/name`** (e.g. `Persephone/Excel Viewer`) —
  reusing the existing `author` + `name` manifest fields; **no new manifest field**.
- Used only when **both** `author` and `name` are explicitly set in the manifest (ignore the
  folder-name fallback for identity purposes). If either is missing → fall back to the board's
  **root path** (unique, so collision-free but not portable across locations).
- Rationale: a stable, readable namespace shared by a board's dev-repo copy and its installed copy
  (both carry the same manifest), so secrets survive the develop→publish→install→verify loop.
  Path fallback keeps ad-hoc local boards working without ceremony.
- **Caveat (document it):** `name`/`author` are display/metadata fields — changing them
  re-namespaces the board and orphans its old vars. Authors keep them fixed as their identity.

### Locked-file access flow (reuse of the bookmark pattern)

Modeled directly on `BrowserBookmarks.init()` (`editors/browser/BrowserBookmarks.ts`), which
already solves "encrypted file requested but not yet unlocked":

1. Resolve the `.env.json` path from settings. Not configured → show the "Create environment
   variables storage" dialog, or reject to the board.
2. Load via a session-singleton `TextFileModel`-backed store (`BoardEnvStore`).
3. `shell.encryption.isEncrypted(content)`? If yes and not yet unlocked this session →
   `ui.password({ mode: "decrypt" })` → `TextFileModel.decrypt(password)`. Cancel / wrong password
   → reject to the board. A `silent` option skips the prompt (headless/autoload) and rejects.
4. `JSON.parse` → return the calling board's namespaced slice.

**Session unlock** = keep the `BoardEnvStore` (holding the unlocked `TextFileModel`) alive as a
per-path singleton. Because `decrypt()` installs the non-persistent `DecryptTransformer` (password
in a `#private` field), a later `set()` → `saveFile()` **re-encrypts automatically** — no
password caching in our code, no re-prompt.

### Board API — `persephone.var.*`

Added to the board bridge shim (`src/board-shim.ts`) and routed to the **renderer** (where
settings, the encryption service, and the password dialog live — like `openRawLink`/`notify`, not
the main-side `readFile`):

- `persephone.var.get(name, env?)` — returns a value, or rejects.
- `persephone.var.set(name, value, env?)` — writes to the board's namespace; re-encrypts on save if
  the file is encrypted.
- `persephone.var.list(env?)` — returns the board's key names (+ available profiles); not values.
- `persephone.var.show()` — opens the `.env.json` editor scoped to the calling board (a
  user-triggered "review my configured variables" affordance).

All async; all can reject (not configured / locked-and-cancelled / user-declined). Boards must
handle rejection.

### `.env.json` built-in editor

A built-in editor associated with the `*.env.json` file mask: a reviewable, per-board / per-profile
view (masked values with reveal, sections per namespace, profile tabs). Detects an encrypted file
(`isEncrypted`) and prompts before showing. This is the target of `persephone.var.show()`.

### Namespace collision warning at registration

When a board is registered (the trust flow) and its computed `author/name` namespace matches an
**already-registered** board, show a **non-blocking** advisory warning naming the colliding board:
**Register anyway** (accept a shared namespace — a legitimate case) / **Cancel** (edit
`board-manifest.json`, then re-register). Only runs for `author/name` namespaces (path-fallback
namespaces are unique, so no collision is possible). The develop→publish loop won't false-alarm:
the dev board is unregistered before the installed copy is registered, so they're never registered
simultaneously.

## Linked Tasks

Implementation order: US-887 → US-888 → US-889 → US-890.

| Task | Title | Status |
|------|-------|--------|
| [US-887](../tasks/US-887-board-vars-foundation/README.md) | Vars store foundation: settings path + `.env.json` schema + `BoardEnvStore` model (encryption reuse, session unlock, `author/name`→path namespace) | Implemented (unreviewed) |
| US-888 | Board API `persephone.var.get/set/list` (shim + renderer routing) + "Create environment variables storage" dialog | Planned |
| US-889 | `*.env.json` built-in editor (per-board/profile review view) + `persephone.var.show()` | Planned |
| US-890 | Namespace collision warning at board registration | Planned |

_Task placeholders — each gets a full `doc/tasks/US-XXX-*/README.md` (Goal → Background →
Implementation Plan → Concerns → Acceptance Criteria) when work on it begins._

## Concerns / Open questions

1. **Encryption granularity — RESOLVED:** whole-file, single password (the existing mechanism).
   No per-board or per-key encryption. Once unlocked in a session, all namespaces are readable in
   memory; the per-board API slice is a convenience boundary, not a cryptographic one.
2. **OS-bound encryption (`safeStorage`) — RESOLVED: rejected.** Machine/OS-account-bound; breaks
   on non-persistent pooled VMs (documented `az login`/DPAPI failure). Password-only.
3. **Namespace key — RESOLVED:** `author/name` (both explicit) → board root path fallback. No new
   manifest field. Renaming re-namespaces (documented caveat).
4. **Special encryption UI — RESOLVED: none.** Reuse the existing encrypt/decrypt file menu.
5. **`set()` from a board — RESOLVED: allowed.** A trusted board may write its own namespace (its
   own settings form). Given trust, silent overwrite is acceptable; noted, not gated.
6. **Auto-injecting a profile into `executeNode` env — DEFERRED (future enhancement).** Flowing a
   secret main-store → child-process `env` (never through the renderer/iframe) is the most secure
   path for DB connections. Out of scope for this epic's initial API; revisit after `var.get`.

## Acceptance criteria

- A board calls `persephone.var.get("SNOWFLAKE_SERVER")` and receives the value from the configured
  `.env.json` — the file lives outside the board folder, so copying/sharing the board leaks nothing.
- With no `.env.json` configured, the first `var.*` call shows the "Create environment variables
  storage" dialog (default path = data folder, editable); declining rejects the call and the board
  handles it gracefully.
- An encrypted `.env.json` that is not yet unlocked prompts once per session via the existing
  password dialog; correct password serves the values, cancel/wrong-password rejects; `set()`
  re-encrypts on save with no re-prompt.
- Two boards with `author`+`name` `Persephone/Excel Viewer` share one namespace; a board missing
  either field uses its root path. Registering a second board with a colliding `author/name` shows
  the advisory warning with Register-anyway / Cancel.
- Opening the `.env.json` in its built-in editor shows values grouped by board namespace and
  profile, masked by default; `persephone.var.show()` opens it scoped to the calling board.
- Encryption is optional: a plain-JSON `.env.json` works with no prompt; the user encrypts it via
  the existing file menu and subsequent board access prompts for the password.

## Notes

### 2026-07-21
- Epic created from a design conversation. Key decisions captured in Design / Concerns:
  password-only encryption (no `safeStorage`), `author/name` namespace with path fallback (no new
  manifest field), reuse of the `BrowserBookmarks` encrypted-file pattern and a session-singleton
  `TextFileModel`-backed store, and a non-blocking collision warning at registration. Task READMEs
  to be authored per task at implementation time.
