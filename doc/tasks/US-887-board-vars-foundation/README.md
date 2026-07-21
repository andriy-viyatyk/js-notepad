# US-887: Board vars store foundation — settings path + `.env.json` schema + `BoardEnvStore`

**Epic:** [EPIC-046 — Board Environment Variables](../../epics/EPIC-046.md)
**Status:** Implemented — unreviewed (epic deferred-review model). `tsc` + `eslint` clean; live-verified via the app's real `app.settings` (not-configured / load / get / list / set→disk / encrypted-silent-locked / namespace author-name + path-fallback all pass).

## Goal

Build the non-UI foundation for board environment variables: a Persephone setting for the global
`.env.json` path, the file schema, a `author/name`→path namespace resolver, and a session-singleton
`BoardEnvStore` that loads/parses the file, transparently handles optional password encryption
(reusing the existing mechanism), and exposes `get` / `set` / `list` / `getAll` over a board's
namespace. No bridge API, no editor, no dialogs — those are US-888 / US-889 / US-890.

## Background

### Reuse target — the `BrowserBookmarks` encrypted-file pattern

`src/renderer/editors/browser/BrowserBookmarks.ts` already solves "load a standalone file that may be
encrypted-but-not-yet-unlocked" using a `TextFileModel`:

```ts
this.textFileHost = new TextFileModel(new TComponentState({
    ...getDefaultTextFileEditorModelState(), filePath, language: "json", editor: "link-view",
}));
this.textFileHost.skipSave = true;              // we manage saves ourselves
await this.textFileHost.restore();              // reads the file (auto-builds a FileProvider pipe)
if (shell.encryption.isEncrypted(this.textFileHost.state.get().content || "")) {
    if (options?.silent) return false;          // headless — don't prompt
    const password = await ui.password({ mode: "decrypt" });   // Promise<string | null>
    if (!password) return false;                // user cancelled
    const ok = await this.textFileHost.decrypt(password);       // Promise<boolean>
    if (!ok) return false;                       // wrong password (decrypt() already toasts)
}
```

`BoardEnvStore` follows this exactly. Key facts verified in the code:

- **`TextFileModel` works standalone** (no `page`): `restore()` → `io.ensurePipe()` auto-creates a
  `FileProvider` pipe from `filePath` and reads it (`TextFileIOModel.restore`,
  `TextEditorModel.ts:374`). `saveFile()` with an existing `filePath` + writable pipe writes
  directly, no dialog (`TextFileIOModel.saveFile`, `:80`).
- **Decryption installs a `DecryptTransformer`** on the pipe (`TextFileEncryptionModel.decrypt`,
  `:104`), so a later `saveFile()` **re-encrypts automatically** with the same password — no
  password handling in our code. `decrypt()` returns `boolean` and already `ui.notify`s on wrong
  password.
- **`shell.encryption.isEncrypted(text)`** (`api/shell/encryption.ts:133`) — synchronous check for
  the `ENC-v001:` prefix; the store never needs to know the password to detect a locked file.
- **`ui.password(options?)`** (`api/ui.ts:32`) → `Promise<string | null>` (`null` = cancel).
- **`changeContent(newContent)`** (`TextEditorModel.ts:249`) sets `content` + `modified=true`;
  `state.get().content` is the current (decrypted) content.

### Settings mechanism (`src/renderer/api/settings.ts`)

Add a key in three places: the `AppSettingsKey` union (`:22`), `settingsComments` (`:56`), and
`defaultAppSettingsState.settings` (`:86`). Read with `settings.get(key)`, write with
`settings.set(key, value)`, subscribe with `settings.onChanged.subscribe(({key,value}) => …)`.

### Namespace source (`src/renderer/editors/board/board-manifest.ts`)

`readBoardManifest(boardRoot): Promise<BoardManifest | null>` (`:123`) returns the parsed manifest
with optional `author?: string` and `name?: string` fields (`:36`). **No new manifest field is
added** (EPIC-046 decision). Importing this module from `api/` is established precedent
(`api/published-boards.ts`, `api/board-install.ts`, `api/board-install-registry.ts` already do).

## Implementation plan

### Step 1 — Add the setting (`src/renderer/api/settings.ts`)

Add `"board-vars.file"` in all three spots:

- `AppSettingsKey` union — add `| "board-vars.file"`.
- `settingsComments` — add:
  ```ts
  "board-vars.file": "Path to the board environment-variables file (.env.json).\nStores per-board variables/secrets outside board folders. May be encrypted with a password via the file's encryption menu.",
  ```
- `defaultAppSettingsState.settings` — add `"board-vars.file": "",`.

Empty string = not configured (US-888's create dialog fills it in).

### Step 2 — Schema + result types (`src/renderer/api/board-vars/types.ts`, new)

```ts
/** One profile's flat key→value map (values are strings — connection strings, keys, passwords). */
export type BoardVarsProfile = Record<string, string>;
/** A namespace's profiles. The "default" profile is used when `env` is omitted. */
export type BoardVarsNamespace = Record<string, BoardVarsProfile>;
/** The whole `.env.json`: namespace ("author/name" or a board root path) → profiles. */
export type BoardVarsFile = Record<string, BoardVarsNamespace>;

export const DEFAULT_PROFILE = "default";

/** Outcome of loading the store. */
export type BoardVarsLoadStatus = "ok" | "not-configured" | "locked" | "error";
export interface BoardVarsLoadResult {
    status: BoardVarsLoadStatus;
    /** Present when status === "error" (parse/read failure) — for logging, not the user. */
    message?: string;
}
```

- `not-configured` — setting empty **or** the configured file does not exist (US-888 shows the
  create dialog for both).
- `locked` — file encrypted and the user cancelled / entered the wrong password.
- `error` — read or `JSON.parse` failure of a decrypted file.

### Step 3 — Namespace resolver (`src/renderer/api/board-vars/namespace.ts`, new)

```ts
import { readBoardManifest } from "../../editors/board/board-manifest";

/**
 * The per-board vars namespace: the manifest's `author/name` when BOTH are explicitly set
 * (trimmed, non-empty), otherwise the board root path (unique — collision-free but not portable
 * across locations). The namespace is a plain JSON object key, so spaces / "/" inside the display
 * strings are fine ("Persephone/Excel Viewer"); we do NOT slug or charset-restrict it.
 */
export async function resolveBoardNamespace(boardRoot: string): Promise<string> {
    const m = await readBoardManifest(boardRoot);
    const author = typeof m?.author === "string" ? m.author.trim() : "";
    const name = typeof m?.name === "string" ? m.name.trim() : "";
    if (author && name) return `${author}/${name}`;
    return boardRoot;
}
```

### Step 4 — `BoardEnvStore` (`src/renderer/api/board-vars/BoardEnvStore.ts`, new)

A module-level singleton. Holds a lazily-created standalone `TextFileModel` for the configured
path, keeps it alive for the session (so an unlocked encrypted file stays unlocked), and re-parses
`model.state.get().content` on every `ensureLoaded()` (the file is small — no parse cache to
invalidate). Reloads when the `board-vars.file` setting changes.

Sketch (behavior is normative; exact wiring is the implementer's):

```ts
class BoardEnvStore {
    private model: TextFileModel | null = null;
    private loadedPath: string | null = null;   // path the current model was built for
    private parsed: BoardVarsFile = {};

    constructor() {
        // Drop the model when the configured path changes so the next call reloads.
        settings.onChanged.subscribe(({ key }) => {
            if (key === "board-vars.file") this.reset();
        });
    }

    private reset() {
        void this.model?.dispose();
        this.model = null;
        this.loadedPath = null;
        this.parsed = {};
    }

    /** Idempotent: build/restore the model, prompt-and-decrypt if locked, parse. */
    async ensureLoaded(opts?: { silent?: boolean }): Promise<BoardVarsLoadResult> {
        const path = (settings.get("board-vars.file") || "").trim();
        if (!path) return { status: "not-configured" };
        if (!(await fs.exists(path))) return { status: "not-configured" };

        if (this.loadedPath !== path) {         // (re)build for this path
            this.reset();
            this.model = new TextFileModel(new TComponentState({
                ...getDefaultTextFileEditorModelState(), filePath: path, language: "json",
            }));
            this.model.skipSave = true;
            await this.model.restore();
            this.loadedPath = path;
        }
        const model = this.model!;

        if (shell.encryption.isEncrypted(model.state.get().content || "")) {
            if (!model.decrypted) {              // not yet unlocked this session
                if (opts?.silent) return { status: "locked" };
                const password = await ui.password({ mode: "decrypt" });
                if (!password) return { status: "locked" };
                const ok = await model.decrypt(password);   // toasts on wrong password
                if (!ok) return { status: "locked" };
            }
        }

        try {
            const text = model.state.get().content || "";
            this.parsed = text.trim() ? (JSON.parse(text) as BoardVarsFile) : {};
            if (!this.parsed || typeof this.parsed !== "object") this.parsed = {};
        } catch (e) {
            return { status: "error", message: (e as Error).message };
        }
        return { status: "ok" };
    }

    // Sync accessors — callers run ensureLoaded() (status "ok") first.
    get(namespace: string, name: string, env?: string): string | undefined {
        const v = this.parsed[namespace]?.[env || DEFAULT_PROFILE]?.[name];
        return typeof v === "string" ? v : undefined;
    }
    list(namespace: string, env?: string): string[] {
        return Object.keys(this.parsed[namespace]?.[env || DEFAULT_PROFILE] ?? {});
    }
    /** Whole file, for the editor (US-889). */
    getAll(): BoardVarsFile { return this.parsed; }

    /** Mutate one value, serialize, write back (re-encrypts if the file is encrypted). */
    async set(namespace: string, name: string, value: string, env?: string): Promise<void> {
        const profile = env || DEFAULT_PROFILE;
        const next: BoardVarsFile = structuredCloneOrJson(this.parsed);
        (next[namespace] ??= {});
        (next[namespace][profile] ??= {});
        next[namespace][profile][name] = value;
        this.parsed = next;
        const model = this.model!;
        model.changeContent(JSON.stringify(next, null, 4));
        await model.saveFile();                 // writes through the pipe → re-encrypts if locked-file
    }
}

export const boardVars = new BoardEnvStore();
```

Notes for the implementer:
- Imports: `TextFileModel` + `getDefaultTextFileEditorModelState` from
  `../../editors/text/TextEditorModel`; `TComponentState` from `../../core/state/state`; `shell`
  from `../shell`; `ui` from `../ui`; `fs` from `../fs`; `settings` from `../settings`; types +
  `resolveBoardNamespace` from `./`.
- `set()` must operate on the **decrypted** content (guaranteed: it runs after `ensureLoaded()`
  returned `ok`, which decrypts). Because the model's pipe holds the `DecryptTransformer`,
  `saveFile()` re-encrypts on disk automatically — do not call `encript()` manually.
- `structuredCloneOrJson` = `JSON.parse(JSON.stringify(this.parsed))` (avoid mutating the object we
  hand out via `getAll()`); a plain deep clone is fine for this small structure.
- Do **not** register the model with any page or the pages model — it is an internal service model.

### Step 5 — Barrel (`src/renderer/api/board-vars/index.ts`, new)

Re-export `boardVars`, `resolveBoardNamespace`, and the types so US-888/US-889 import from
`api/board-vars`.

### Not in scope (deferred)

- `persephone.var.*` shim + renderer routing, and the "Create environment variables storage"
  dialog → **US-888**.
- `*.env.json` built-in editor + `persephone.var.show()` → **US-889**.
- Collision warning at registration → **US-890**.

## Files that need NO changes

- `src/renderer/editors/text/TextEditorModel.ts`, `TextFileEncryptionModel.ts`, `TextFileIOModel.ts`
  — reused as-is (standalone-model + decrypt-on-save behaviors already exist).
- `src/renderer/api/shell/encryption.ts`, `src/renderer/ui/dialogs/PasswordDialog.tsx`,
  `src/renderer/api/ui.ts` — reused as-is.
- `src/renderer/editors/board/board-manifest.ts` — read-only; **no new field** (`author`/`name`
  already exist).

## Concerns / Open questions

1. **No independent UI surface — RESOLVED (accepted).** US-887 wires nothing to the UI, so there is
   nothing to click. Verification is `tsc --noEmit` + `npm run lint` clean, plus a dev-console smoke
   test (below). Full end-to-end verification arrives with US-888. Left `[ ]` on the dashboard per
   the epic deferred-review model.
2. **Values are strings only — RESOLVED.** Connection strings / keys / passwords are strings;
   `get()` returns `string | undefined` and ignores non-string values defensively. A richer value
   type is unnecessary.
3. **Parse-cache invalidation — RESOLVED: none.** `ensureLoaded()` re-parses `model.state.get()
   .content` every call (files are tiny), and the model's own pipe watch keeps `content` fresh on
   external edits (decrypting via the retained `DecryptTransformer`). No separate cache to
   invalidate.
4. **`not-configured` vs missing file — RESOLVED:** both map to `not-configured` so US-888's create
   dialog can offer to create the file (at the configured path if set, else the default).
5. **Concurrent `ensureLoaded()` prompts — ACCEPTED for v1.** Two near-simultaneous board calls on a
   locked file could each open a password dialog. Acceptable at this layer; US-888 (the single
   bridge entry point) can serialize calls (a shared in-flight promise) if it proves annoying.

## Acceptance criteria

- `tsc --noEmit` and `npm run lint` are clean.
- The `board-vars.file` setting appears in `appSettings.json` (with its comment) and defaults to `""`.
- Dev-console smoke test (dev build, DevTools console):
  - With `board-vars.file` unset → `await boardVars.ensureLoaded()` returns `{status:"not-configured"}`.
  - Point the setting at a hand-written plain-JSON `.env.json`
    (`{"Acme/Demo":{"default":{"K":"V"}}}`) → `ensureLoaded()` returns `{status:"ok"}`,
    `boardVars.get("Acme/Demo","K") === "V"`, `boardVars.list("Acme/Demo")` includes `"K"`.
  - `await boardVars.set("Acme/Demo","K2","V2","dev")` writes the file; re-reading from disk shows
    the new `dev` profile value.
  - Encrypt that file via the editor's encryption menu, restart, and repeat: the first
    `ensureLoaded()` prompts once for the password; after unlock, `get`/`set` work and `set`
    re-writes the file **still encrypted** (`shell.encryption.isEncrypted` of the on-disk bytes is
    true). Wrong password / cancel → `{status:"locked"}`.
  - `resolveBoardNamespace(root)` returns `"<author>/<name>"` for a manifest with both fields set,
    and the board root path when either is missing.

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/api/settings.ts` | Add `board-vars.file` key (union + comment + default `""`) |
| `src/renderer/api/board-vars/types.ts` | **New** — `BoardVarsFile`/`BoardVarsNamespace`/`BoardVarsProfile`, `DEFAULT_PROFILE`, load-result types |
| `src/renderer/api/board-vars/namespace.ts` | **New** — `resolveBoardNamespace(boardRoot)` |
| `src/renderer/api/board-vars/BoardEnvStore.ts` | **New** — `BoardEnvStore` class + `boardVars` singleton |
| `src/renderer/api/board-vars/index.ts` | **New** — barrel re-export |
