# US-652: [Phase 1] Project scaffold + config + Document Store

**Epic:** [EPIC-032 — Mneme (Wiki / Vector Memory service)](../../epics/EPIC-032.md)
**Phase:** 1 — Mneme core service (text-search, MCP-testable)
**Status:** Implemented (Phase 1) — `cargo build --release` + 13 Document-Store tests pass; awaiting epic-level review.
**Created:** 2026-06-13

## Goal

Stand up the `mneme/` Rust project (the third in-tree binary, after `launcher/` and `snip-tool/`) with its CI build, a config layer, and the **Document Store** — the filesystem abstraction over one or more wiki roots that every later component is derived from. This is pure on-disk plumbing: no SQLite index, no MCP server, no frontmatter parsing, no embeddings (those are US-653 / US-655 / US-657). At the end of this task the binary builds in CI, loads a config, and the Document Store can read/write/edit/glob/grep markdown across roots with safe path resolution and include/ignore filtering — exercised by unit tests, not yet by MCP.

## Background

### What this task realizes (from EPIC-032 / US-651)

- **US-652 scope line (EPIC-032):** "`mneme/` Cargo project + CI build; config (roots, include/ignore globs); Document Store (read/write/edit/glob/grep, root-in-path, safe path resolution, attachment serving)."
- **Document Store responsibilities** (US-651, "Core services"): FS abstraction over wiki roots; list/read/write; string-replace edits (`wiki_edit`); name-pattern match (`wiki_glob`); literal/regex content scan (`wiki_grep` — a **streaming scan**, regex-capable, **not** FTS5); safe path resolution (no traversal outside a root); serve/ignore binary attachments; apply the per-root **include allowlist** (default `*.md`) + **ignore rules** (gitignore-style defaults `.mneme/`/`.git/`/`node_modules/`/build dirs + the root's `.gitignore`/`.ignore` + a `.mneme/config` list) — a file is a document **iff** it matches include AND not ignore (D18).
- **Root-in-path addressing** (EPIC-032, revised decision): every document address is `{root}/{path}` — identical to the resource URI `mneme://{root}/{path}` — where `root` is the registered root **name** (uniqueness enforced). Path tools take the full path; scope-able tools take an optional `{root}/…` prefix. `wiki_add_root` invariants (US-651 design-review note): `folder` must already exist; `name` is unique (normalized); overlapping roots (one a path-prefix of another) are rejected at registration.
- **Config** (US-651): wiki roots, model name/path, transport (HTTP — bind default `127.0.0.1`, port, optional token for non-loopback), GPU on/off/auto; per-root include globs + ignore patterns. Sourced from a config file + CLI flags (`clap`) + env. As a Persephone sidecar, the config path **and the port** are passed via CLI flags. The full config struct is defined now (later tasks read the model/transport fields they own); US-652 only *acts on* the roots + include/ignore fields.

### Build precedent (investigated — `launcher/` + `snip-tool/`)

The repo has **no Cargo workspace** — each Rust crate is an independent project in its own top-level folder with its own `Cargo.toml` / `Cargo.lock`. `mneme/` follows that exactly.

| Concern | Established pattern | What `mneme/` does |
|---|---|---|
| Crate dir | `launcher/`, `snip-tool/` at repo root | `mneme/` at repo root, self-contained (own README/tests, buildable in isolation → extraction-ready) |
| Package / binary name | `name = "persephone-launcher"` → `persephone-launcher.exe`; `name = "persephone-snip"` → `persephone-snip.exe` | `package.name = "persephone-mneme"` (precedent + crates.io-safe), **`[[bin]] name = "mneme"` → `mneme.exe`** (matches every architecture doc + the `mneme serve` CLI) |
| Release profile | `opt-level="z"`, `lto=true`, `codegen-units=1`, `strip=true`, `panic="abort"` | same |
| `build.rs` | `winres` embeds icon (`../assets/icon.ico`) + version metadata; `FileDescription` per binary | same, `FileDescription = "Persephone Mneme (knowledge-base service)"` |
| `windows_subsystem` | launcher = `windows` (no console); snip-tool = console (uses stdout) | **console subsystem (no attribute)** — Mneme runs an HTTP server; stdout carries only a startup readiness line, stderr carries logs (Concern 5) |
| Build command | `cargo build --release` in the crate dir | same |
| Where it runs | CI only (`.github/workflows/publish.yml`, on `v*` tags / manual dispatch); **not** wired into `npm start` or `npm run dist` — `cargo` is invoked explicitly in CI before `npm run dist:publish`; devs build manually | add a `cargo build --release` step (working-directory: `mneme`) to `publish.yml` |
| `.gitignore` | `launcher/target/` ignored; **`snip-tool/target/` is missing (gap)** | add `mneme/target/` **and** fix the missing `snip-tool/target/` |
| Installer packaging | electron-builder `extraFiles` copies the exe next to `persephone.exe`; runtime locates it via `path.dirname(process.execPath)` (packaged) / `__dirname`-relative (dev) | **out of scope here** — `extraFiles` + onnxruntime DLLs = US-665; spawn/lifecycle = US-660 |
| VMP signing | `scripts/vmp-sign.mjs` auto-excludes all non-Electron `.exe` | no action — exclusion is automatic |

### Source module layout for this task (subset of US-651's full layout)

US-651 defines the full crate layout (`mcp/`, `index/`, `embed/`, `search/`, `indexer/`, `watcher/`, `provision/` …). US-652 creates only the foundation:

```
mneme/
├─ Cargo.toml
├─ Cargo.lock
├─ build.rs            winres version/icon metadata (copy launcher/build.rs, adjust strings)
├─ README.md           crate-local readme (extraction-ready: what it is, how to build/test)
├─ mneme.example.toml  sample config (documented)
├─ tests/
│  ├─ fixtures/wiki/    sample roots: markdown, nested dirs, an attachment, a node_modules/ trap
│  └─ document_store.rs integration tests (walk, glob, grep, edit, path-safety)
└─ src/
   ├─ main.rs          CLI entry (clap): `serve` (stub → US-655), `status` (prints config + roots)
   ├─ config.rs        full Config struct + load (figment: file + env + flags); RootConfig
   ├─ error.rs         error types (thiserror) + Result alias
   └─ store/
      ├─ mod.rs        DocumentStore: open(roots), read/write/edit/read_bytes, list, glob, grep
      ├─ roots.rs      RootRegistry: name→root, {root}/{path} address parse, add/remove/validate
      ├─ address.rs    WikiAddress parsing + safe resolution to an OS path (no traversal)
      ├─ walk.rs       include-allowlist + ignore-rules walker (the `ignore` crate)
      ├─ glob.rs       wiki_glob (globset over the walked set)
      ├─ grep.rs       wiki_grep streaming scan + output modes (files_with_matches/content/count)
      └─ edit.rs       string-replace edit (old_string / new_string / replace_all)
```

`tokio`, `rusqlite`/`sqlite-vec`, `ort`/`tokenizers`, `notify`, `reqwest`, `pulldown-cmark`, `serde_yaml_ng`, `rmcp` are **not** added in this task — the Document Store and config are synchronous; async + the index + MCP arrive in US-653/654/655. Keeping the dependency set minimal here keeps the scaffold reviewable.

## Implementation plan

### Step 1 — Cargo project + build wiring

1. **`mneme/Cargo.toml`** — mirror `launcher/Cargo.toml`:
   ```toml
   [package]
   name = "persephone-mneme"
   version = "0.1.0"
   edition = "2021"            # match precedent (launcher/snip-tool use 2021)

   [[bin]]
   name = "mneme"             # → mneme.exe, matching all architecture docs + CLI
   path = "src/main.rs"

   [dependencies]
   clap     = { version = "4", features = ["derive"] }
   serde    = { version = "1", features = ["derive"] }
   figment  = { version = "0.10", features = ["toml", "env"] }
   ignore   = "0.4"           # ripgrep walker — gitignore-style ignore + override allowlist
   globset  = "0.4"           # wiki_glob pattern matching
   regex    = "1"             # wiki_grep streaming scan (Concern 6 fallback — see Implementation notes)
   tracing  = "0.1"
   tracing-subscriber = { version = "0.3", features = ["env-filter"] }
   thiserror = "2"
   dirs     = "5"             # default config/cache locations for standalone runs

   [build-dependencies]
   winres = "0.1"

   [profile.release]
   opt-level = "z"
   lto = true
   codegen-units = 1
   strip = true
   panic = "abort"
   ```
   > Confirm latest minor versions on crates.io at build time; pin in `Cargo.lock`. `grep-*` crates mirror Grep's behavior precisely; if their API churns, fall back to `regex` + a manual line scanner (Concern 6).

2. **`mneme/build.rs`** — copy `launcher/build.rs`; set `FileDescription = "Persephone Mneme (knowledge-base service)"`, keep `ProductName = "Persephone"`, icon `../assets/icon.ico`.

3. **`.gitignore`** (repo root) — under the existing `launcher/target/` (line ~102) add:
   ```
   mneme/target/
   snip-tool/target/   # fix pre-existing gap — was never ignored
   ```

4. **`.github/workflows/publish.yml`** — add a Rust build step alongside the existing launcher/snip-tool steps, **before** the Node steps:
   ```yaml
   - name: Build Mneme service
     run: cargo build --release
     working-directory: mneme
   ```
   (Installer packaging of the exe — `extraFiles` + DLLs — is deferred to US-665; this step only proves `mneme/` compiles in CI from the start.)

### Step 2 — Config layer (`src/config.rs`)

Define the **full** config the service will eventually use, even though US-652 only acts on roots + include/ignore (later tasks read their own fields):

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub roots: Vec<RootConfig>,
    #[serde(default)] pub model: ModelConfig,        // name/path/precision — read by US-656/657
    #[serde(default)] pub transport: TransportConfig, // bind (default 127.0.0.1), port, optional token — read by US-655
    #[serde(default)] pub gpu: GpuMode,               // auto|on|off — read by US-657
}

#[derive(Debug, Clone, Deserialize)]
pub struct RootConfig {
    pub name: String,                 // root id used in mneme://{name}/… URIs (unique, normalized)
    pub folder: PathBuf,              // absolute OS path; must exist
    #[serde(default = "default_include")] pub include: Vec<String>, // default ["*.md"]
    #[serde(default)] pub ignore: Vec<String>,        // extra gitignore-style patterns
}
```

- **Load order (figment):** defaults → config file (TOML) → environment (`MNEME_` prefix) → CLI flags. Built-in ignore defaults (`.mneme/`, `.git/`, `node_modules/`, common build dirs) live in `walk.rs`, not the file, so an empty `ignore` list still prunes them.
- **Config path resolution:** `--config <path>` flag wins; else `$MNEME_CONFIG`; else the OS-standard `dirs::config_dir()/persephone-mneme/mneme.toml` (standalone default). Persephone (US-660) will pass `--config` pointing at its own app-data copy.
- Ship **`mneme.example.toml`** documenting every field.

### Step 3 — Address + root registry (`src/store/roots.rs`, `src/store/address.rs`)

- **`WikiAddress`** — parse `{root}/{rest}`: split on the first `/`; `root` is the registry key, `rest` is the in-root relative path. Reject empty root, absolute `rest`, and any `.`/`..` segment.
- **Safe resolution** — `root.folder.join(rest)`, then **canonicalize and assert the result is still inside `root.folder`** (defense-in-depth beyond the `..` reject — handles symlinks). Resolution that escapes the root is an error, never a read.
- **`RootRegistry`** — `name → RootConfig`; methods `resolve(&WikiAddress) -> PathBuf`, `add(folder, name?)`, `remove(name)`, `list()`. **`add` invariants:** folder exists; name normalized + unique; reject a root whose folder is a path-prefix of (or prefixed by) an existing root's folder. `name` defaults to the folder basename when omitted. (The MCP `wiki_add_root`/`wiki_remove_root` tools in US-655 call these; persistence of a dynamic add back to the config file is wired in US-655 — US-652 provides the in-memory registry + validation + a `persist()` hook.)

### Step 4 — Walker with include allowlist + ignore rules (`src/store/walk.rs`)

- Use `ignore::WalkBuilder` per root:
  - **Ignore rules:** enable `.gitignore`/`.ignore` parsing; add built-in defaults (`.mneme/`, `.git/`, `node_modules/`, `target/`, `dist/`, `build/`) and the root's per-config `ignore` patterns.
  - **Include allowlist:** build an `ignore::overrides::Override` (via `OverrideBuilder`) from the root's `include` globs (default `*.md`). With a whitelist override, only matching files are yielded — this is the **default-deny** allowlist (D18). Verify `Override` whitelist semantics during implementation (Concern 7).
- Expose `walk(root) -> impl Iterator<Item = WalkedFile>` returning files that match include AND not ignore. `DocumentStore::list`, `glob`, and `grep` all consume this single walk so the "indexed files only" rule (US-651) is enforced in one place — even though there's no index yet, the *set of indexable files* is exactly this walk.

### Step 5 — Document Store core (`src/store/mod.rs`, `edit.rs`, `glob.rs`, `grep.rs`)

- **`read(addr) -> String`** — resolve + read UTF-8 (lossy decode acceptable for v1; encoding detection is a later concern if needed). `offset?`/`limit?` line slicing to mirror Read.
- **`read_bytes(addr) -> Vec<u8>`** — raw bytes for binary attachments (consumed by `resources/read` in US-655). Optional MIME hint via extension (defer `mime_guess` to US-655 if not trivially needed).
- **`write(addr, content)`** — resolve + write the whole file (creating parent dirs); `content` is the entire file verbatim (frontmatter handling is US-653 — US-652 treats content as opaque text).
- **`edit(addr, old_string, new_string, replace_all?)`** (`edit.rs`) — read, exact string replace (error if `old_string` absent or — when `!replace_all` — non-unique, mirroring the Edit tool), write back.
- **`delete(addr)`** — resolve + remove the file.
- **`glob(pattern, path?)`** (`glob.rs`) — `globset` match over the walked set; `path?` scopes to a `{root}` or `{root}/sub` prefix; omitted = all roots. Returns `{root}/{path}` strings.
- **`grep(pattern, path?, opts)`** (`grep.rs`) — `grep-searcher` + `grep-regex` streaming scan over the walked set; output modes `files_with_matches` / `content` (with line numbers + context) / `count`, mirroring Grep. `tags`/`dateRange` filters are **deferred** (they need frontmatter/index — US-653); US-652 implements the literal/regex scan + path scoping only, and the signature reserves the filter params.

### Step 6 — CLI entry (`src/main.rs`)

- `clap` derive with subcommands:
  - **`serve`** — initialize `tracing` (to **stderr**; see Concern 5), load config, open the `DocumentStore`, then print a "MCP HTTP server not yet implemented (US-655)" notice and exit cleanly. The real serve loop (Streamable HTTP, loopback bind) lands in US-655.
  - **`status`** — load config, list registered roots + their folders + resolved file counts (drives the walk end-to-end as a smoke test). Human-readable; the MCP `wiki_status` tool is US-655.
  - `reindex` may be stubbed or omitted (US-654/658 own it).
- Global flags: `--config <path>`, `-v/--verbose`.

### Step 7 — Tests (`tests/document_store.rs` + `tests/fixtures/wiki/`)

Fixture: a small two-root wiki (e.g. `personal/`, `work/`) containing nested markdown, a binary attachment (small PNG), a `node_modules/junk.md` trap, a `.gitignore`, and a `*.txt` non-include file. Cover:
- include allowlist yields only `*.md` (the `.txt` and the attachment are excluded from the walk; the attachment is still reachable via `read_bytes`);
- ignore rules prune `node_modules/` and `.mneme/`;
- `{root}/{path}` resolution + **path-traversal rejection** (`work/../../secret`, absolute paths, symlink escape);
- `glob("work/**/*.md")` and root-scoped vs all-roots;
- `grep` across the three output modes + context lines;
- `edit` uniqueness/replace_all/missing-string error paths;
- `add` root invariants (duplicate name, missing folder, overlapping folders rejected).

## Concerns / open questions (with proposed resolutions)

**1. Binary name inconsistency (`mneme.exe` vs the `persephone-<x>.exe` precedent).** Every architecture doc and the CLI say `mneme` / `mneme.exe`, but launcher/snip-tool use `persephone-launcher.exe` / `persephone-snip.exe`.
→ **Resolution:** keep the package name conventional (`package.name = "persephone-mneme"`) but set **`[[bin]] name = "mneme"`** so the output is `mneme.exe`. This satisfies the precedent (package naming, crates.io-safety — moot since it's never published) **and** every doc / the `mneme serve` CLI. No doc changes needed.

**2. Where the US-652 ↔ US-655/660/665 line falls.** The Document Store's read/write/glob/grep are the *backends* for the MCP tools, but MCP itself is US-655; installer packaging is US-665; spawn lifecycle is US-660.
→ **Resolution (scope fence):** US-652 ships the `DocumentStore` + `RootRegistry` + config as a **synchronous library plus a thin CLI** (`status` exercises them; `serve` is a stub). No `tokio`, no `rmcp`, no `extraFiles`, no runtime-locate code. US-655 adds the async MCP server that calls these methods and wires `wiki_add_root`/`remove_root` persistence; US-665 adds `extraFiles` + DLLs; US-660 adds the Persephone child-process lifecycle. Documented in the plan's scope table.

**3. CI builds an almost-empty binary at release time.** Adding the `cargo build` step now means every `v*` release compiles a `mneme.exe` that can't yet serve.
→ **Resolution:** add it anyway — it's cheap (release runs only on tags/dispatch, not every push) and catches Rust build breakage from day one, before US-655 makes the binary do real work. The exe is not yet bundled (no `extraFiles` until US-665), so it ships nowhere; it only proves the crate compiles in CI. Low risk, high signal.

**4. `dirs`-based standalone config path vs Persephone-passed path.** Standalone `mneme serve` needs a sane default config location; as a sidecar, Persephone dictates it.
→ **Resolution:** precedence `--config` flag → `$MNEME_CONFIG` → `dirs::config_dir()/persephone-mneme/mneme.toml`. US-660 has Persephone pass `--config` at its own app-data path; no ambiguity, and standalone use "just works."

**5. Transport = a single HTTP channel (no stdio); the local port is loopback + no-auth.** Decided 2026-06-13: Mneme exposes **one** MCP transport — **Streamable HTTP** — used by both Persephone and AI agents, so a single running instance serves many clients concurrently (stdio is 1:1 and would multi-spawn Mneme → conflicting watchers/writers on the same roots). Locally it binds **`127.0.0.1` only with no auth** (relies on loopback isolation; networked/Azure adds bearer/OAuth — backlog). stdout is therefore **not** an MCP channel.
→ **Resolution (for this scaffold):** `tracing-subscriber` logs to **stderr**; **stdout carries one startup readiness line** (`listening on 127.0.0.1:<port>`) that the parent (US-660) waits for before connecting — a clean spawn handshake. Console subsystem (no `windows_subsystem = "windows"` attribute) so standalone runs show logs in a terminal; Persephone's spawn sets `CREATE_NO_WINDOW` (US-660). The actual HTTP server is US-655; US-652 only establishes the logging/stdout discipline and the `transport` config shape (bind default `127.0.0.1`, port, optional token for non-loopback). Recorded as a crate-wide invariant in the crate README.

**6. `grep-*` crate API churn / weight.** The ripgrep `grep-searcher`/`grep-regex`/`grep-matcher` libs give exact Grep parity (output modes, context, regex) but their APIs occasionally shift and add weight.
→ **Resolution:** use them as primary (parity is the whole point of the "feels like the agent's own tools" design). If their API proves unstable at build time, fall back to `regex` + a hand-rolled line scanner implementing the same three output modes — the `grep()` signature stays identical, so callers don't care. Noted as a build-time decision, not a blocker.

**7. `ignore` crate models *ignore*, but we also need a default-deny *include allowlist*.** The allowlist (default `*.md`) is the inverse of gitignore semantics.
→ **Resolution:** combine in one `WalkBuilder` — standard `.gitignore`/built-in/`config` patterns handle *ignore*; an `ignore::overrides::Override` built from the `include` globs handles the *allowlist* (a whitelist override yields only matching files). Both compose in a single walk. Verify the `Override` whitelist behavior with a fixture test (Step 7) during implementation — it's the one piece of `ignore`-crate semantics worth pinning down with a test.

**8. UTF-8 / encoding.** Some `.md` may not be clean UTF-8.
→ **Resolution:** lossy UTF-8 decode for v1 reads (the wiki is author-controlled markdown). Full encoding detection is deferred unless real files break it — out of scope for the scaffold.

**9. `wiki_grep` `tags`/`dateRange` filters need metadata that doesn't exist yet.** Those filters require parsed frontmatter materialized in the index (US-653).
→ **Resolution:** US-652 implements grep's literal/regex scan + path scoping only; the `grep()` signature **reserves** the `tags`/`dateRange` params (accepted, ignored with a `// TODO(US-653)` note) so US-653 can light them up without changing the call surface.

## Implementation notes (post-hoc — deviations from the plan above)

Implemented and verified (`cargo build --release` + `cargo test` → 13/13 pass on Windows, cargo 1.93.1). Four small, deliberate deviations:

1. **`wiki_grep` uses the `regex` crate, not the ripgrep `grep-*` libs.** This is exactly the Concern-6 fallback (same `grep()` call surface; simpler, churn-free compile; adequate for author-controlled markdown). `grep-searcher`/`grep-regex`/`grep-matcher` remain the documented alternative if true ripgrep parity (mmap, encoding handling) is ever needed.
2. **`anyhow` dropped.** The typed `MnemeError` (thiserror) covers every path; no `anyhow` needed.
3. **A `[lib]` target was added** (`src/lib.rs`, lib name `persephone_mneme`) so the integration tests can import the crate; `[[bin]] name = "mneme"` builds against it. Not in the original module sketch, but required for `tests/`.
4. **Test fixtures are generated programmatically** under `CARGO_TARGET_TMPDIR` (in `tests/document_store.rs`), **not committed** under `tests/fixtures/`. Reason: a committed `work/.gitignore` + `secret.md` would alter the Persephone repo's own git tracking. Building the fixture at runtime is hermetic and avoids that.

**Key correctness fix during implementation — include allowlist precedence.** The plan proposed the include allowlist as an `ignore`-crate Override *whitelist*. That is wrong: in the `ignore` crate a whitelist override **out-ranks `.gitignore`**, so a git-ignored `*.md` (e.g. `secret.md`) would be wrongly resurrected. Corrected so **ignore wins**: ignores prune the walk (native `.gitignore`/`.ignore` + built-in/per-root patterns as Override `!`-globs), and the include allowlist is a **gitignore-style post-filter** on the survivors (so `*.md` still matches at any depth). Covered by `ignore_rules_prune_node_modules_and_gitignore`.

## Acceptance criteria

- [ ] `mneme/` exists as a self-contained Cargo project; `cargo build --release` produces `mneme.exe`.
- [ ] `cargo test` passes (Document Store integration tests over the fixture wiki).
- [ ] `.github/workflows/publish.yml` builds Mneme (`cargo build --release`, working-directory `mneme`); `.gitignore` ignores `mneme/target/` and the previously-missing `snip-tool/target/`.
- [ ] Config loads from file + env + `--config` flag, with the documented precedence and a `dirs`-based standalone default; `mneme.example.toml` documents every field.
- [ ] `DocumentStore` supports read / read_bytes / write / edit / delete / list / glob / grep across multiple roots.
- [ ] Root-in-path `{root}/{path}` addressing resolves safely; traversal/absolute/symlink-escape attempts are rejected (covered by tests).
- [ ] Include allowlist (default `*.md`) + ignore rules (built-in + `.gitignore` + per-root config) are applied in a single walk; `node_modules/`/`.mneme/` and non-included files are excluded (covered by tests).
- [ ] `RootRegistry.add` enforces folder-exists, unique-normalized-name, and no-overlap (covered by tests).
- [ ] `mneme status` loads config and reports roots + per-root indexable file counts; `mneme serve` is a clean stub deferring to US-655.
- [ ] All logging goes to **stderr**; stdout is used only for a startup readiness line (not an MCP channel — single HTTP transport, US-655).

## Files changed (summary)

| File | Change |
|------|--------|
| `mneme/Cargo.toml` | **new** — package `persephone-mneme`, `[[bin]] mneme`, release profile, deps |
| `mneme/Cargo.lock` | **new** — pinned |
| `mneme/build.rs` | **new** — winres version/icon (copy of launcher/build.rs, adjusted strings) |
| `mneme/README.md` | **new** — crate-local readme (build/test, stdout-reserved invariant) |
| `mneme/mneme.example.toml` | **new** — documented sample config |
| `mneme/src/main.rs` | **new** — clap CLI: `serve` (stub), `status` |
| `mneme/src/config.rs` | **new** — Config + RootConfig + figment load + path precedence |
| `mneme/src/error.rs` | **new** — error types |
| `mneme/src/store/mod.rs` | **new** — DocumentStore (read/write/edit/delete/read_bytes/list) |
| `mneme/src/store/roots.rs` | **new** — RootRegistry + add/remove/validate |
| `mneme/src/store/address.rs` | **new** — WikiAddress parse + safe resolution |
| `mneme/src/store/walk.rs` | **new** — include-allowlist + ignore-rules walker |
| `mneme/src/store/glob.rs` | **new** — wiki_glob |
| `mneme/src/store/grep.rs` | **new** — wiki_grep streaming scan + output modes |
| `mneme/src/store/edit.rs` | **new** — string-replace edit |
| `mneme/tests/document_store.rs` | **new** — integration tests |
| `mneme/tests/fixtures/wiki/**` | **new** — fixture roots (markdown, attachment, node_modules trap, .gitignore) |
| `.gitignore` | edit — add `mneme/target/` + `snip-tool/target/` |
| `.github/workflows/publish.yml` | edit — add `cargo build --release` step (working-directory `mneme`) |
| `doc/active-work.md` | edit — link the US-652 entry to this doc |
| `doc/epics/EPIC-032.md` | edit — link the US-652 row in Linked Tasks |

### Files that need NO changes (don't investigate)

- `launcher/**`, `snip-tool/**` — read for the pattern only; not modified (except the `.gitignore` fix, which is repo-root).
- `electron-builder.yml`, `scripts/vmp-sign.mjs`, `src/main/**` — installer packaging + spawn lifecycle are US-665 / US-660.
- Any Persephone TypeScript — no renderer/main code in this task.
