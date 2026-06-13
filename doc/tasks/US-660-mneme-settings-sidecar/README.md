# US-660 — [Phase 3] Persephone settings + Mneme sidecar auto-launch

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 3
**Status:** Implemented (unreviewed) — verified manually under `npm start`; review deferred to epic close.

## Goal

Add an **off-by-default "Mneme" settings block** to Persephone and a **main-process child-process lifecycle** that spawns `mneme.exe` (Tor-style: spawn → wait for stdout readiness line → graceful shutdown). Enabling the toggle auto-runs Mneme over loopback HTTP; Persephone assigns the port via a CLI flag. Also surface Mneme in the existing **"AI client configuration:"** JSON so external agents can connect, and show **start/fail toasts** via `app.ui.notify`. Finally, wire **dev-mode** so Mneme starts and works under `npm start`.

This task is lifecycle + settings only. It does **not** include the content-pipeline integration (`MnemeProvider`/`MnemeTreeProvider`, subscriptions) — those are US-661/662/663.

## Background

### mneme CLI contract (verified against `mneme/`)
- Invocation: `mneme.exe serve --port <N> --config <path>`.
- Readiness: prints exactly `listening on 127.0.0.1:<port>` to **stdout** once bound (`mneme/src/mcp/server.rs:286`); all logs go to **stderr**.
- Default port **7700**; `--port` is a **transient** override (never written back). Everything else (roots, model, gpu) comes from `--config`.
- Config persistence: `wiki_add_root`/`wiki_remove_root` call `persist_roots` → `config::save` (`mneme/src/mcp/mod.rs:683`, `mneme/src/config.rs:115`), so **roots added at runtime via MCP survive a restart as long as Persephone passes a stable `--config` path**.
- Model cache (independent of config-file location): `%APPDATA%/persephone/data/mneme/models/gte-multilingual-base-int8-v1/{model.onnx,tokenizer.json}` (`mneme/src/model/mod.rs:95`). **FTS works with no model**; only vector/hybrid needs it.
- Runtime DLL: `DirectML.dll` must sit beside `mneme.exe` (already produced beside it by `cargo build --release`). ONNX Runtime is statically linked (no `onnxruntime.dll`).

### Persephone patterns to mirror
- **Settings UI** — `src/renderer/editors/settings/SettingsView.tsx`, `McpSection` (lines 678–811). The "MCP Server" block: enable toggle, browser-tools toggle, Port `Input` (disabled while running), **Running indicator** (`<Dot color={running?"success":"neutral"}>` + "Running — N clients" / "Stopped"), URL + **Copy URL** `Button`, then the **"AI client configuration:"** `<Text>` label (line 799) + `<ColorizedCode language="json">` block (lines 801–803) + a Copy button. The config JSON is composed at lines 729–737.
- **Settings keys** — `src/renderer/api/settings.ts`: `AppSettingsKey` union (≈32–34) + defaults (≈91–93): `mcp.enabled:false`, `mcp.port:7865`.
- **Status flow (MCP)** — `src/main/mcp-http-server.ts` exposes `isMcpHttpServerRunning()/getMcpUrl()/getMcpClientCount()` (≈867–877) and `broadcastMcpStatus()` (≈122–128) which does `openWindows.send(EventEndpoint.eMcpStatusChanged, …)`. Renderer (`SettingsView` `McpSection`, ≈690–698) calls `api.getMcpStatus()` once and subscribes to `rendererEvents.eMcpStatusChanged`.
- **Enable wiring** — `src/renderer/api/app.ts` (≈231–257): on init if `mcp.enabled`, calls `api.setMcpEnabled(true, port)`; watches `settings.onChanged` to toggle. → `controller.setMcpEnabled` (`src/ipc/main/controller.ts:194–200`) → `start/stopMcpHttpServer`.
- **IPC types** — `src/ipc/api-types.ts`: `Endpoint.setMcpEnabled`/`getMcpStatus` (≈54–55), `McpStatus { running; url; clientCount }` (≈84), `EventEndpoint.eMcpStatusChanged` (≈182). Renderer side: `src/ipc/renderer/api.ts` (`getMcpStatus` ≈222), `src/ipc/renderer/renderer-events.ts` (`eMcpStatusChanged` ≈114).
- **Sidecar process** — `src/main/tor-service.ts`: `spawn(exe, args)` (≈95), stdout-readiness parse `text.includes("Bootstrapped 100%")` (≈120) with a timeout, `kill()` on shutdown (≈158), `shutdown()` hooked into `app.on("will-quit")`.
- **Dev-vs-packaged exe path** — `src/main/snip-service.ts:6–10`:
  ```ts
  function getSnipToolPath(): string {
      if (app.isPackaged) return path.join(path.dirname(process.execPath), "persephone-snip.exe");
      return path.join(__dirname, "../../snip-tool/target/release/persephone-snip.exe");
  }
  ```
- **Service bootstrap** — `src/main/main-setup.ts`: `init*` calls (≈42–47); shutdown block in `app.on("will-quit")` (≈126) calls `torService.shutdown(); stopPipeServer(); stopMcpHttpServer(); …`.
- **Notify** — `app.ui.notify(message, type)` → `alertsBarModel.addAlert(message, "info"|"success"|"error")` (`src/renderer/api/ui.ts:38`).
- **Build config** — `electron-builder.yml` `extraFiles` (≈21–25) places `persephone-launcher.exe` / `persephone-snip.exe` beside the app exe.

## Implementation plan

### 1. Settings keys — `src/renderer/api/settings.ts`
Add to the `AppSettingsKey` union (near the `mcp.*` keys):
```ts
| "mneme.enabled"   // boolean, default false
| "mneme.port"      // number,  default 7700
```
Add to defaults (near the `mcp.*` defaults):
```ts
"mneme.enabled": false,
"mneme.port": 7700,
```

### 2. IPC types — `src/ipc/api-types.ts`
- `Endpoint` enum (by the MCP entries): `setMnemeEnabled = "setMnemeEnabled"`, `getMnemeStatus = "getMnemeStatus"`.
- New interface (by `McpStatus`): `export interface MnemeStatus { running: boolean; url: string; error?: string; }` — **no `clientCount`** (Persephone is the spawner, not the server; it cannot see Mneme's connected clients).
- `EventEndpoint` (by `eMcpStatusChanged`): `eMnemeStatusChanged = "eMnemeStatusChanged"`.
- `setMnemeEnabled` returns `{ success: boolean; error?: string }` (so the renderer can toast a failure).

### 3. Main process — new `src/main/mneme-service.ts`
Module-level state mirroring `mcp-http-server.ts`/`tor-service.ts`:
- `getMnemeExePath()` (snip pattern): packaged → `path.join(path.dirname(process.execPath), "mneme.exe")`; dev → `path.join(__dirname, "../../mneme/target/release/mneme.exe")`.
- `getMnemeConfigPath()`: `path.join(app.getPath("userData"), "data", "mneme", "mneme.toml")` (= `%APPDATA%/persephone/data/mneme/mneme.toml`, aligned with the model cache root). Mneme creates the dir/file on first `config::save`; Persephone does not need to pre-create it.
- `startMneme(port?): Promise<{success; error?}>` — resolve a clean port (`port ?? 7700`), `spawn(exe, ["serve", "--port", String(port), "--config", cfgPath], { windowsHide: true })`. Parse **stdout** lines for `listening on ` → set `running=true`, `url = http://localhost:<port>/mcp`, resolve `{success:true}`, `broadcastMnemeStatus()`. On a readiness **timeout** (e.g. 20 s) or early `exit`/`error` before readiness → `{success:false, error}`. Pipe **stderr** to the logger.
- `exit` handler: set `running=false`, `broadcastMnemeStatus({error})` if it died unexpectedly (so the renderer can toast a crash). No auto-restart (matches Tor).
- `stopMneme()`: `child?.kill()`, clear state, `broadcastMnemeStatus()`.
- `isMnemeRunning()`, `getMnemeUrl()`, `getMnemeStatus(): MnemeStatus`.
- `broadcastMnemeStatus(extra?)`: `openWindows.send(EventEndpoint.eMnemeStatusChanged, { running, url, error })`.
- `shutdownMneme()`: `stopMneme()` — called from `will-quit`.

### 4. Controller — `src/ipc/main/controller.ts`
Mirror `setMcpEnabled`/`getMcpStatus`:
```ts
[Endpoint.setMnemeEnabled]: async (enabled, port) =>
    enabled ? startMneme(port) : (stopMneme(), { success: true }),
[Endpoint.getMnemeStatus]: () => getMnemeStatus(),
```
(Exact binding shape to match the existing `bindEndpoint` style in this file.)

### 5. Renderer IPC — `src/ipc/renderer/api.ts` + `renderer-events.ts`
- `api.ts`: `setMnemeEnabled(enabled: boolean, port?: number)` and `getMnemeStatus()` (mirror the MCP pair, ≈222).
- `renderer-events.ts`: `eMnemeStatusChanged` renderer event (mirror `eMcpStatusChanged`, ≈114).

### 6. Enable wiring + toasts — `src/renderer/api/app.ts`
Mirror the MCP block (≈231–257):
- On init: if `settings.get("mneme.enabled")` → `api.setMnemeEnabled(true, settings.get("mneme.port"))`, then toast the `{success,error}` result.
- In `settings.onChanged`: when `mneme.enabled` (or `mneme.port` while enabled) changes → toggle.
- Subscribe to `rendererEvents.eMnemeStatusChanged`: on transition to running → `app.ui.notify("Mneme started", "success")`; on `error` present → `app.ui.notify("Mneme failed to start: " + error, "error")`.

### 7. Settings UI — `src/renderer/editors/settings/SettingsView.tsx`
- Add a **`MnemeSection`** (or extend `McpSection`) rendering **after** the MCP Server controls and **before** the "AI client configuration:" label:
  - `<Text bold size="sm">Mneme</Text>` + one-line description ("Local knowledge-base / memory service").
  - **Enable Mneme** `Checkbox` → `settings.set("mneme.enabled", !mnemeEnabled)`.
  - **Port** `Input` (`width={72}`, `disabled={mnemeEnabled}`, `onBlur` validates 1024–65535 → `settings.set("mneme.port", num)`).
  - **Running indicator** (when `mnemeEnabled && status`): `<Dot color={status.running?"success":"neutral"}>` + "Running" / "Stopped" + URL `<span>` + **Copy URL** `Button` (copies `status.url`).
  - Status fetched via `api.getMnemeStatus()` + `rendererEvents.eMnemeStatusChanged` subscription (mirror the MCP `useEffect`).
- **Extend the "AI client configuration:" JSON** (lines 729–737) to add a `mneme` entry **when `mneme.enabled`**:
  ```jsonc
  { "mcpServers": {
      "persephone": { "type": "http", "url": "http://localhost:<mcpPort>/mcp" },
      "mneme":      { "type": "http", "url": "http://localhost:<mnemePort>/mcp" }
  } }
  ```
  Move/keep the label+block so it sits below the Mneme section and reflects both servers.

### 8. Shutdown wiring — `src/main/main-setup.ts`
Add `shutdownMneme();` to the `app.on("will-quit")` block (≈126).

### 9. Dev-mode prep
- **Build helper** — add npm scripts:
  ```json
  "mneme:build": "cargo build --release --manifest-path mneme/Cargo.toml",
  "mneme:model": "node scripts/dev-mneme-model.mjs"
  ```
  `cargo build --release` also drops `DirectML.dll` beside `mneme.exe`; the dev exe path already points at `mneme/target/release/mneme.exe`.
- **Model for dev (copy, do not download)** — `mneme:model` runs a node script (`scripts/dev-mneme-model.mjs`) that **copies the local dev model** into the cache layout once:
  - `temp/mneme-model/onnx/model_int8.onnx` → `%APPDATA%/persephone/data/mneme/models/gte-multilingual-base-int8-v1/model.onnx`
  - `temp/mneme-model/tokenizer.json` → `…/gte-multilingual-base-int8-v1/tokenizer.json`

  It is idempotent (skips if the target files already exist) and prints a clear message if `temp/mneme-model/` is missing. No network. FTS-only testing needs nothing.
- **Roots** — none required to launch; Mneme serves an empty wiki and roots are added later via MCP (`wiki_add_root`) or US-664. They persist to the stable `--config` path.

### 10. Packaging — deferred to US-665
No `electron-builder.yml` change in this task. Bundling `mneme.exe` + `DirectML.dll` via `extraFiles` (and the model download-on-first-enable) is owned by US-665 ("Installer + first release"). US-660 targets dev-mode + the lifecycle/settings; the dev exe path resolves to `mneme/target/release/mneme.exe` and needs no packaging.

### Files that need NO changes
- `mneme/` Rust crate — the CLI contract (`serve --port --config`, readiness line, config persistence) already satisfies this task. No Rust changes.
- `src/main/mcp-http-server.ts`, `tor-service.ts`, `snip-service.ts` — referenced as patterns only.

## Concerns / open questions

1. **Roots in US-660? — RESOLVED:** out of scope. **No root-picker UI** here — Mneme launches with empty roots; they're added via MCP (`wiki_add_root`, which persists to `--config`) and managed by the dedicated Mneme configuration editor (US-664, "roots and other stuff"), built in a later task.
2. **Model in dev — RESOLVED: copy locally, no download.** `mneme:model` runs `scripts/dev-mneme-model.mjs`, copying `temp/mneme-model/` into the cache layout once (see step 9). Offline and immediate; the `mneme model-update` download path stays the production mechanism (US-656/665), not dev.
3. **Packaging now or in US-665? — RESOLVED:** deferred to US-665. No `electron-builder.yml` change here (see step 10).
4. **Auto-restart on crash? — RESOLVED:** **no auto-restart.** On unexpected exit, set Stopped and fire an error toast (matches Tor).
5. **Status event for crash — RESOLVED:** one channel. A single `eMnemeStatusChanged { running, url, error? }` carries both readiness and crash (renderer toasts `success` when it goes running, `error` when `error` is set). Simpler — one event, one subscription, mirrors the MCP status flow.
6. **Port default 7700** (Mneme's own default) vs Persephone MCP's 7865 — distinct, no clash. Keeping 7700.

## Acceptance criteria

- [x] "Mneme (vector memory)" settings block renders between the MCP Server controls and the "AI client configuration:" label; **off by default**.
- [x] Enabling spawns `mneme.exe serve --port <port> --config <stable-path>`, waits for the `listening on …` readiness line, then flips the indicator to green; **Copy URL** copies `http://localhost:<port>/mcp`.
- [x] Port `Input` is editable only while stopped, disabled while running, and the value persists.
- [x] "AI client configuration:" JSON includes the `mneme` entry when enabled (and omits it when disabled).
- [x] `app.ui.notify` shows a **success** toast on start and an **error** toast on failed start / unexpected exit.
- [x] Disabling the toggle and quitting the app both kill the child process gracefully (no orphan `mneme.exe`).
- [x] Under `npm start` (after `npm run mneme:build` and a populated model cache), enabling Mneme starts a working server reachable at the shown URL.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/api/settings.ts` | Add `mneme.enabled` / `mneme.port` keys + defaults |
| `src/ipc/api-types.ts` | `Endpoint.setMnemeEnabled`/`getMnemeStatus`, `MnemeStatus`, `EventEndpoint.eMnemeStatusChanged` |
| `src/ipc/main/controller.ts` | Bind `setMnemeEnabled` / `getMnemeStatus` |
| `src/ipc/renderer/api.ts` | `setMnemeEnabled` / `getMnemeStatus` |
| `src/ipc/renderer/renderer-events.ts` | `eMnemeStatusChanged` renderer event |
| `src/main/mneme-service.ts` | **New** — spawn/readiness/shutdown/status + broadcast |
| `src/main/main-setup.ts` | `shutdownMneme()` in `will-quit` |
| `src/renderer/api/app.ts` | Enable wiring on init + `settings.onChanged`; start/fail/crash toasts |
| `src/renderer/editors/settings/SettingsView.tsx` | Mneme block + extend AI-client-config JSON |
| `package.json` | `mneme:build` (+ `mneme:model`) dev scripts |
| `scripts/dev-mneme-model.mjs` | **New** — copies `temp/mneme-model/` into the dev model cache (idempotent, offline) |
| `electron-builder.yml` | *(no change — packaging deferred to US-665)* |
