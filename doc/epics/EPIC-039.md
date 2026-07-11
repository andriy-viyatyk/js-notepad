# EPIC-039: Secure Peer-to-Peer Connections (Contacts, Chat, Remote Control)

## Status

**Status:** Planned
**Created:** 2026-07-09
**Completed:**

## Overview

Add a secure, end-to-end-encrypted connection between two Persephone instances running on
different machines, so that a user can chat with a peer and — on trusted peers — operate the
remote Persephone (open a remote file in Monaco that lives on the peer's disk, run a remote
command, later mirror a remote browser tab). The connection is **paired out-of-band**: each
side runs "Generate connection contact", producing a small file (display name, comment,
**public** encryption key, transport locator (broker URL + inbox topic), key fingerprint) that the users exchange through
any channel they already trust (WhatsApp, Teams, email). Importing that file on the other side
registers a **Contact** and pins the peer's public key.

Persephone's **own libsodium encryption layer** is the security boundary: every payload is
encrypted with pinned per-contact keys **before** it touches the transport, so the transport
is a dumb, untrusted pipe that only ever sees opaque, authenticated ciphertext. The first
transport backend is **MQTT over WSS** — a pure pub/sub **relay with no message persistence**
(QoS 0: the broker forwards a message to currently-connected subscribers and drops it
otherwise), chosen because it rides ordinary HTTPS/WebSocket — the one kind of traffic that
survives restrictive networks — requires **no accounts** on the default public broker, and
matches the accepted no-store-and-forward model. Default broker: `broker.emqx.io` (zero
signup, testing-grade); documented reliable path: a private **HiveMQ Cloud free-tier** broker
(one-time signup, credentials in settings). Transport pluggability is a **hard design
requirement**: all transport access goes through the `PeerTransport` interface, so any future
communication channel (direct TCP/LAN fast path, WebRTC, or anything else) is *only* another
implementation of that interface — no changes to the crypto, contacts, or feature layers.

This epic delivers the foundation (crypto + transport + pairing + contacts + secure message
channel) and the first two consumers (chat, remote file editing), plus remote command control.
The bandwidth-heavy remote-browser-tab feature is included as the final, riskiest task and may
be split further once the fast-path question is settled.

## Goals

- **Serverless-in-spirit pairing.** No key material ever crosses the wire: public keys are
  exchanged as files through the users' own out-of-band channel and pinned on import
  (trust-on-first-use), which makes the design man-in-the-middle-resistant by construction —
  a hostile broker cannot substitute keys because it never carries them.
- **Persephone owns the encryption.** libsodium primitives (X25519 key agreement +
  XChaCha20-Poly1305 authenticated encryption), keys generated and held on-device, private key
  never shared and encrypted at rest. The transport (MQTT) is demoted to a courier of opaque
  blobs. No home-rolled cipher — vetted primitives only.
- **Pluggable transport (hard requirement).** A `PeerTransport` interface with MQTT as the
  first backend. Feature layers never see MQTT types; adding a future channel (direct/LAN for
  remote tabs, WebRTC, …) means implementing `PeerTransport` and nothing else.
- **Contacts registry** mirroring the proven `board-trust.ts` pattern (dedicated data file,
  reactive, deliberately off the `app`/script surface so scripts cannot self-pair).
- **Two working consumers**: an encrypted **Chat** editor and a **`peer://` remote-file
  provider** that opens/edits/saves a file on the peer's disk through the existing content
  pipeline.
- **Remote control** by forwarding Persephone's existing MCP `handleCommand` surface to a
  trusted peer — strictly opt-in per contact, because it grants code execution on the remote.
- **Honest scope**: remote *file editing* (open/save), not keystroke-level co-editing (CRDT);
  metadata (topics, timing, sizes) is visible to the broker and accepted; offline peers
  time out rather than queueing work — the transport itself never stores messages.

## Background — existing infrastructure (verified)

### Packaging — the dependency risk is small (verified against both pipelines)
- **No native (`.node`/node-gyp) modules exist in the runtime tree today.** `forge.config.ts`
  has no `auto-unpack-natives` plugin registered, and `electron-builder.yml` has no
  `asarUnpack`. The only WASM precedent is `libarchive-wasm` (`package.json`).
- **Decision consequence:** use **`libsodium-wrappers` (WASM, base64-inlined)** and
  **`mqtt.js` (pure JS)** — both bundle cleanly through Rollup with **zero** new build
  config; `mqtt.js` is far lighter than the previously-considered `matrix-js-sdk`. `sodium-native` (a native addon) is rejected: it would force new `external` entries in
  `scripts/build-prod.mjs`, an `asarUnpack` rule in `electron-builder.yml`, and `@electron/rebuild`
  against the Castlabs Electron 39 ABI — none of which the project has ever exercised.
- **Keep the connection service in the RENDERER** (like `mneme-connection.ts`), NOT in a new
  main/preload entry point. The renderer has full Node (`nodeIntegration: true`). This avoids
  the known dual-build-pipeline hazard: the main/preload entry list is duplicated in
  `forge.config.ts` (VitePlugin `build` array) and `scripts/build-prod.mjs` (the `build()`
  calls) with no parity check, so a new entry point silently vanishes from release builds. A
  pure dependency add has no such hazard — electron-builder ships production `dependencies` and
  Rollup bundles them into the renderer.
- **No transport-level crypto stack at all.** MQTT carries our ciphertext as opaque message
  payloads; the libsodium layer is the only crypto boundary. (The earlier Matrix design would
  have required an explicit decision to disable Matrix E2E and its Olm/Rust WASM module — MQTT
  removes the question entirely.)

### Trust registry + persistence pattern (to mirror for Contacts)
- `src/renderer/api/board-trust.ts` — the canonical user-only registry: a reactive
  `TGlobalState`, lazy `load()`, mutators that `load()`-then-`saveDataFile` (last-writer-wins
  across windows, no watcher), and a singleton `export const boardTrust`. **Deliberately absent
  from `app.ts` `initServices()`** so scripts cannot mutate trust. Contacts copies this shape
  but stores **JSON** records instead of newline-delimited paths, and matches by a stable key
  (fingerprint/public key), not path containment (drop board-trust's `pathCovers` inheritance).
- `src/renderer/api/fs.ts` — data-file helpers (`prepareDataFile`/`getDataFile`/`saveDataFile`,
  lines ~506-529); files live at `<userData>/data/<name>`. Content-agnostic — `settings.ts`
  proves JSON works through the same helpers (`JSON.stringify` + `parseJSON5`).
- `src/renderer/api/shell/encryption.ts` — existing **PBKDF2 → AES-GCM** service (`ENC-v001:`
  format). The codebase's secret stance is "derive at use-time, don't persist the raw secret."
  The identity **private key** (and any private-broker credentials) must be encrypted at rest with
  this, or held in an OS secret store — never dropped in plaintext into the file-watched,
  script-exposed `appSettings.json`.

### Confirmation dialog + reactive state (to mirror)
- `src/renderer/ui/dialogs/TrustBoardDialog.tsx` + `Dialogs.tsx` (`showDialog`) — the
  `showXxxDialog(props) → Promise<boolean>` pattern for an "Import this contact?" / "Accept
  incoming connection?" confirmation. Call-site precedent: `BoardEditorView.tsx` lines ~42-46.
- `src/renderer/core/state/state.ts` / `model.ts` — `TGlobalState` (app-wide), `TComponentState`
  (per-instance), `TDialogModel<Props,Result>`. A `ContactsModel` needs only the `board-trust`
  shape (a class holding a `TGlobalState`), not the heavier `TComponentModel`.

### Editor registration (to mirror for the Chat editor)
- A **standalone** (non-file) editor = `{ hasContentHost: false, accepts: () => -1 }` registered
  in `src/renderer/editors/register-editors.ts`; simplest templates are `mneme-config` and
  `mcp-view` (`src/renderer/editors/mneme-config/`, `mcp-inspector/`). Three files: the model
  (extends `EditorModel`, `noLanguage = true`, `skipSave = true`), an `index.tsx` `EditorModule`
  (`createEditor` + `Component`), and a view `.tsx`.
- The id must be added to the **`EditorView`** union in `src/renderer/api/types/common.d.ts`
  (lines ~26-57; copied to `assets/editor-types/` for Monaco IntelliSense — never hand-edit the
  asset) and an **`EditorType`** entry in `src/shared/types.ts` line 1. `create_page` rejects
  standalone editors (`mcp-handler.ts` ~line 350), so a chat page opens via a dedicated
  lifecycle method, not MCP `create_page`.

### Content provider + custom scheme (to mirror for `peer://`)
- `MnemeProvider` (`src/renderer/content/providers/MnemeProvider.ts`) is the exact analog: a
  provider that `readBinary`/`writeBinary`/`watch` over an **async remote channel** with
  live-refresh, backed by the singleton `mnemeConnection` service
  (`src/renderer/api/mneme-connection.ts` — one auto-reconnecting client, refcounted per-URI
  `subscribe()` watchers, re-fires on reconnect). `PeerProvider` mirrors it, backed by a
  `peerConnection`-style service.
- `IProvider` interface: `src/renderer/api/types/io.provider.d.ts` (lines ~28-60) —
  `readBinary()` required; optional `writeBinary`/`watch`/`stat`/`dispose`; `toDescriptor()` for
  restore. **No `edit` on the pipe** — only read/write whole content.
- Provider registration: one line in `src/renderer/content/registry.ts`
  (`registerProvider("peer", cfg => new PeerProvider(...))`).
- Scheme wiring is two files (Layer 3 `open-handler.ts` needs no change): a **parser** in
  `src/renderer/content/parsers.ts` (`peer://` → `openLink`) and a **resolver** in
  `src/renderer/content/resolvers.ts` (build `pipeDescriptor { provider: { type: "peer",
  config } }`, pick target editor, fire `openContent`). The `mneme://` blocks (parsers
  ~73-79, resolvers ~175-187) are the templates; declare the prefix + encode/decode helpers in a
  new `peer-link.ts` mirroring `mneme-link.ts`. `restorable: true` + `toDescriptor()` makes a
  `peer://` page survive restart via `TextFileModel.applyRestoreData`.

### Remote-control surface (to forward to a peer)
- `src/renderer/api/mcp-handler.ts` `handleCommand(method, params)` (switch ~103-145) is the
  entire JSON-RPC command surface: `execute_script`, `get_pages`, `get_page_content`,
  `get_active_page`, `create_page`, `set_page_content`, `get_app_info`, `open_url`,
  `create_board`/`open_board`/`board_refresh`, the tools meta-tools, `ui_push`, and `browser_*`
  (delegated to `automation/commands.ts` `handleBrowserCommand`). "Run X on the remote
  Persephone" = forwarding a `{method, params}` envelope to the peer's `handleCommand` and
  returning the result. **This is code execution on the remote machine** (`execute_script`), so
  it is gated per-contact.

### Remote browser tab — the one real gap (screencast)
- CDP is reachable via `src/renderer/automation/CdpSession.ts` (`cdp.send(method, params)`) over
  the main-side `webContents.debugger` (`src/main/cdp-service.ts`). Single-frame capture already
  works (`browserTakeScreenshot` → `Page.captureScreenshot`).
- **Gap:** `cdp-service.ts` forwards request/response only — it does **not** forward CDP *events*
  (`wc.debugger.on("message", ...)`) back to the renderer. `Page.startScreencast` delivers frames
  as `Page.screencastFrame` events, so streaming requires a **new main→renderer event channel**
  in `cdp-service.ts` + `browser-ipc.ts`. No `startScreencast`/`screencastFrame` usage exists
  today. This is why the remote-tab task is last and largest.

## Architecture — target design

1. **Crypto + identity (US-813).** `libsodium-wrappers`. A local identity = an X25519 keypair
   generated once and persisted; the **private key encrypted at rest** (`encryption.ts`). A
   `crypto` helper module: `seal(peerPublicKey, myPrivateKey, plaintext)` /
   `open(peerPublicKey, myPrivateKey, ciphertext)` (libsodium `crypto_box`, per-message nonce,
   authenticated), plus `fingerprint(publicKey)` (short hash for manual verification). No
   transport, no MQTT — unit-testable in isolation via `execute_script`.
2. **Pluggable transport (US-814).** `interface PeerTransport { connect(); send(peerLocator,
   opaqueBlob); onMessage(cb); presence(peerLocator); dispose(); }` — the **only** surface upper
   layers may touch (hard requirement: a future channel — direct TCP/LAN, WebRTC, anything —
   is just another implementation of this interface). First backend `MqttTransport` (`mqtt.js`
   over WSS): each identity owns a random, unguessable **inbox topic**; sending = publish the
   ciphertext to the peer's inbox topic at **QoS 0** (no persistence — the broker forwards to
   connected subscribers or drops); listening = subscribe to own inbox topic. Presence via MQTT
   LWT ("online" published on connect; the broker announces "offline" on drop) plus the
   app-level ping. Broker config lives in settings: default `wss://broker.emqx.io:8084/mqtt`
   (anonymous, testing-grade), or a custom broker URL + username/password (recommended: private
   HiveMQ Cloud free-tier broker). The transport pools one connection per distinct broker URL
   across contacts (all-default = a single connection). A singleton `peerConnection` service
   (renderer, mirrors `mneme-connection.ts`) owns the transport, auto-reconnects, and
   multiplexes messages to per-contact handlers by pinned key.
3. **Contacts + pairing (US-815).** `ContactsModel` over `contacts.json` (mirrors `board-trust`;
   record = `{ id, displayName, comment, publicKey, transport: { brokerUrl, inboxTopic },
   fingerprint, capabilities, addedAt }`). "Generate connection contact" writes a contact file
   (my public key + transport locator: broker URL + my inbox topic, plus optional private-broker
   credentials + metadata; optional self-signature for integrity). "Import contact" reads it, shows
   a confirmation dialog (name + fingerprint to verify verbally), pins the key, registers the
   contact. Each contact carries a **per-capability trust config** (C18) — enforced on the
   *receiving/controlled* side, editable any time in contact settings:
   `capabilities: { messages: { enabled }, fileAccess: { mode: "deny"|"ask"|"auto",
   allowedPaths: string[] }, remoteControl: { mode: "deny"|"ask"|"auto" } }` — defaults:
   messages **on**, fileAccess **ask**, remoteControl **ask**. A Contacts sidebar panel lists
   contacts + online status. Kept off `app`/scripts.
4. **Secure message channel (US-816).** Ties 1+2+3 together: a `PeerSession` per contact that
   seals/opens envelopes (`{ kind, payload }`, kinds: `chat`, `file-op`, `command`, `control`,
   `ping`), authenticates the sender against the pinned key, and surfaces connect / "peer is
   connecting — allow?" / disconnect / timeout events. Because the transport never stores
   messages, the channel adds lightweight **ack/retry** for control messages (handshake,
   file-ops) and **chunking** for payloads above the broker's message-size limit. The channel
   is also the **capability gate** (C18): every incoming envelope is checked against the
   contact's capability config *before* dispatch to a feature handler — messages disabled →
   reply with a `control` "blocked" notice (sender UI shows "peer is not accepting messages");
   `file-op`/`command` under `"ask"` → confirmation prompt on the receiving side; `"deny"` →
   error envelope back. This is the API the feature layers call.
5. **Chat editor (US-817).** Standalone editor (mirrors `mneme-config`) over a `PeerSession`
   `chat` channel — message list, input, per-contact history. The end-to-end smoke test of the
   whole stack.
6. **`peer://` remote files (US-818).** `PeerProvider` (mirrors `MnemeProvider`) issues
   `file-op` envelopes (read/write/stat/watch) to the peer; the remote side handles them against
   its local `fs` — **only within the contact's `fileAccess.allowedPaths`** (requests are
   canonicalized to absolute paths first, so `..` traversal cannot escape the allowlist;
   outside → error envelope; `"ask"` mode prompts on the serving side, recommended granularity:
   once per contact-session per allowlist root) — and pushes change notifications. Scheme parser + resolver + `peer-link.ts` +
   registry line. Remote *editing* (open→edit→save writes to the peer's disk), not live
   co-editing.
7. **Remote command control (US-819).** Forward `{method, params}` to the peer's
   `handleCommand` over a `command` envelope; return the result. **Granted by the controlled
   side** (C9): default = accept-prompt per connection; per-contact opt-in auto-grant on the
   controlled machine's contact record for owned machines. `execute_script` is arbitrary RCE, so
   this is off by default.
8. **Remote window mirror (US-820).** *(Reframed from "remote browser tab" per the design
   discussion.)* Remote-desktop of the peer's **main window**: reuses the C11 mechanism
   (`Page.startScreencast` + CDP input-injection) but targets the whole app window via the
   existing app-window CDP target (`AppTargetModel` / `APP_WINDOW_CDP_KEY`, US-810), not a single
   browser tab. UX: registered peers appear in the App bar (near the "Open Tabs"/windows section,
   `MenuBar.tsx`) with an online indicator + Connect; connecting opens a **local window that is a
   live mirror** of the remote main window (frames rendered locally, mouse/keyboard forwarded
   with coordinate scaling). Subsumes the browser-tab case (the remote's browser tab is visible
   within its mirrored window). Highest-capability form of remote control → gated by C9 (with an
   always-visible, revocable "X is controlling this window" indicator on the controlled side).
   Missing infra: the main→renderer CDP **event**-forwarding channel (`cdp-service.ts` +
   `browser-ipc.ts`). Bandwidth-heavy — whole window > one tab — so the direct/LAN fast path
   (C14) is the *recommended* transport for this feature, with the MQTT relay as a
   works-anywhere fallback. Largest/riskiest; may split.

## Linked Tasks (in implementation order)

| # | Task | Title | Depends on | Status |
|---|------|-------|-----------|--------|
| 1 | US-813 | Crypto + identity foundation — `libsodium-wrappers` dep; identity keypair (generate + persist, private key encrypted at rest via `encryption.ts`); `crypto` helpers (`crypto_box` seal/open, per-message nonce, fingerprint); off `app`/scripts | — | Planned |
| 2 | US-814 | Pluggable transport + MQTT backend — `PeerTransport` interface (hard boundary; future channels = new implementations only); `MqttTransport` (`mqtt.js`, WSS, QoS 0 inbox topics, LWT presence, per-broker connection pool); broker settings (default `broker.emqx.io`, custom URL + credentials); singleton `peerConnection` service (renderer, auto-reconnect, message multiplex) | US-813 | Planned |
| 3 | US-815 | Contacts registry + out-of-band pairing — `ContactsModel` (`contacts.json`, board-trust-style, off `app`/scripts); "Generate connection contact" export file; "Import contact" + confirmation dialog (fingerprint verify) + key pinning; per-contact capability config (C18: messages on/off, fileAccess deny/ask/auto + path allowlist, remoteControl deny/ask/auto) editable at import + in contact settings; Contacts sidebar panel with online status | US-813 (parallel with US-814) | Planned |
| 4 | US-816 | Secure message channel — `PeerSession` per contact: seal/open envelopes over the transport, authenticate against pinned key, envelope kinds + framing, ack/retry for control messages + payload chunking, capability gate enforcing the contact config (C18) + "blocked" notice, connect/accept-incoming/disconnect/timeout lifecycle events | US-814, US-815 | Planned |
| 5 | US-817 | Chat editor — standalone editor (mirrors `mneme-config`) over the `chat` channel; message list + input + per-contact history; `EditorView`/`EditorType` + lifecycle open method | US-816 | Planned |
| 6 | US-818 | `peer://` remote-file provider — `PeerProvider` (mirrors `MnemeProvider`) + remote `file-op` handler; `peer-link.ts` scheme + parser + resolver + registry line; serving-side `fileAccess` allowlist enforcement (C18: canonical paths, ask/auto); restorable; remote editing (open/save), not co-editing | US-816 | Planned |
| 7 | US-819 | Remote command control — forward `handleCommand` envelopes to a peer; C9/C18 grant model (`remoteControl.mode`: controlled-side accept-prompt default + per-contact auto-grant + hard deny); result/error return | US-816 | Planned |
| 8 | US-820 | Remote window mirror — App bar "Remote Persephones" list (online + Connect); mirror the peer's **main window** via app-window CDP screencast (`AppTargetModel`) + input-injection; new main→renderer CDP event-forwarding channel; C9-gated with visible/revocable control indicator; fast-path recommended | US-819 | Planned |

### Order rationale
- US-813 is the pure foundation — crypto + identity with no I/O, testable alone.
- US-814 and US-815 both sit on US-813 and can run in parallel (transport vs contacts/pairing).
- US-816 is the integration milestone that makes the encrypted channel real; every feature
  above (817-820) sits on it.
- US-817 (chat) is deliberately the first feature — smallest, and the natural end-to-end test.
- US-818/819 are independent features on the channel; 819 before 820 because remote tabs build
  on the remote-control forwarding.
- US-820 last: the only task with a missing infrastructure piece (CDP event forwarding) and the
  only one whose UX really depends on the (out-of-scope) fast path.

## Concerns / Open questions (to review before implementation)

| # | Concern | Notes / recommendation |
|---|---------|------------------------|
| C1 | **Transport = MQTT** *(resolved — was "Matrix?")* | **Decision (2026-07-11):** MQTT over WSS as the first backend behind `PeerTransport` — a pure forward-only relay (QoS 0 = no server-side message history), which matches the accepted no-store-and-forward model (C8) exactly; HTTPS-friendly; tiny pure-JS client (`mqtt.js`). Matrix (offline-tolerant but account-heavy — its main advantage was unused) and Nostr ephemeral events were considered and set aside. **Hard requirement:** transport pluggability — any future channel is *only* another `PeerTransport` implementation, with zero changes above it. |
| C2 | **Broker selection** *(resolved — was "Matrix account provisioning")* | **Decision (2026-07-11):** two-tier. (1) Default out-of-the-box: public `broker.emqx.io` (`wss://broker.emqx.io:8084/mqtt`) — anonymous, zero signup, testing-grade reliability (run on EMQX's commercial cloud but officially "for testing"); acceptable because payloads are E2E ciphertext. (2) Recommended reliable path: private **HiveMQ Cloud free tier** (100 connections, 10 GB/mo, no credit card) — one-time signup; broker URL + credentials in settings, credentials encrypted at rest (C4). The contact file carries the broker URL + inbox topic (+ optional private-broker credentials), so the receiving peer needs no setup. No per-machine accounts — the biggest Matrix-era UX unknown is gone. |
| C3 | **libsodium-wrappers (WASM) vs sodium-native** *(recommend WASM)* | WASM avoids the native toolchain the project has never used (verified: no native modules today). Perf is irrelevant at chat/file volumes. |
| C4 | **Private key at rest** *(needs user input)* | Encrypt with `encryption.ts` (PBKDF2) — but that needs a **master password prompt** at startup/first use. Alternatives: OS keystore, or accept plaintext-on-disk relying on OS file perms. Recommend a master password guarding the identity + private-broker credentials; decide whether it's prompted per session or cached. |
| C5 | **Service lives in renderer** *(recommend, accepted rationale)* | Mirror `mneme-connection.ts` (renderer, full Node) → no new main/preload entry point → no dual-build-pipeline drift risk. |
| C6 | **Matrix E2E on or off** *(obsolete — Matrix dropped, see C1)* | MQTT has no transport-level E2E stack to decide about; the libsodium layer is the only crypto boundary. Kept for history. |
| C7 | **Contact-file format + integrity** | JSON: `{ displayName, comment, publicKey, transport: { brokerUrl, inboxTopic, credentials? }, fingerprint, version }`. Consider a self-signature so import can detect corruption; but the recipient trusts on first use (no prior key), so the fingerprint (compared verbally over the out-of-band channel) is the real MITM check. |
| C8 | **Offline detection + timeout** | MQTT LWT presence ("online" published on connect, broker announces "offline" on drop) plus an app-level `ping` heartbeat over the channel; connection attempts to an offline peer time out (user's accepted requirement — no store-and-forward of feature actions; QoS 0 enforces this at the transport). Because QoS 0 also drops messages during brief connection blips, `PeerSession` (US-816) acks/retries control messages. Timeout duration TBD (~15-30 s). |
| C9 | **Remote-control security** *(resolved — controlled-side grant + opt-in auto-trust)* | Forwarding `handleCommand`/mirroring the window = arbitrary code + full control of the remote machine, so control is **granted by the controlled side** and **off by default**. **Decision:** (a) default = an accept-prompt on the controlled side per connection — **no silent control**; (b) a per-contact **auto-grant** flag lives on the *controlled* machine's contact record (each side controls only what IT grants — you cannot self-assert trust from the connecting side), set at contact import or later in contact settings, so connecting to a machine you own is unattended without a per-connection click; (c) even under auto-grant, an **always-visible, instantly-revocable** "X is controlling this window" indicator on the controlled side — unattended is never invisible. Grant is stored as a `capabilities` field on the contact record (off the `app`/script surface, like the trust registry). **Accepted tradeoff:** auto-grant means the holder of that contact's pinned private key gets unattended control — acceptable because it is opt-in, per-contact, and key-pinned. Applies to both US-819 (command forwarding) and US-820 (window mirror — the highest-capability form). A narrower command allow-list vs the full surface can be a later refinement, not a v1 blocker. **Generalized by C18:** the grant decided here is now `capabilities.remoteControl.mode` — `"ask"` = the per-connection accept-prompt default, `"auto"` = the per-contact auto-grant, `"deny"` = hard off. |
| C10 | **Remote files = editing, not co-editing** *(scope)* | Open/read/save whole content through the pipe (like `MnemeProvider`). Simultaneous keystroke-level co-editing (CRDT/OT) is explicitly out of scope; concurrent-write conflicts handled by last-writer-wins + a change-notification refresh. |
| C11 | **Remote tab = screencast + CDP input-injection** *(resolved — screencast)* | **Decision:** stream frames from the source via `Page.startScreencast` and inject input into the source via CDP `Input.dispatchMouseEvent`/`dispatchKeyEvent` (the input half already works via `CdpSession`). Rendering stays on the source → pixel-faithful for any site (canvas/video/cross-origin/JS apps). **DOM-sync (rrweb-style DOM mirroring) considered and rejected**: the mirror is a "dead" DOM (no page JS), so interaction round-trips to the source anyway — giving up the fidelity gain — while breaking on cross-origin iframes, canvas/WebGL/video, and non-traveling resources. Missing infra: the main→renderer CDP **event**-forwarding channel does not exist (`cdp-service.ts` forwards request/response only) — US-820 must build it. Bandwidth-heavy; frame rate/quality throttling required. |
| C12 | **Metadata leaks to the broker** *(accepted)* | The broker sees topic IDs, timing, and message sizes — payload is opaque, and (unlike Matrix) there are no user accounts to correlate. On the public broker anyone who knows a topic can subscribe or inject — mitigated by unguessable random inbox topics, E2E encryption, and pinned-key sender authentication (forged messages fail `open()`); a private authenticated broker removes it. Hiding metadata (padding/cover traffic) is out of scope. |
| C13 | **Single-window ownership of the connection** | Like `mneme-connection`, one connection service instance; define multi-window behavior (which window holds the broker connection; how a chat page in window 2 reaches it). |
| C14 | **Direct/LAN fast-path transport** *(deferred)* | Remote tabs (US-820) really want a low-latency direct backend (laptop↔VM). Deferred beyond this epic; the `PeerTransport` hard boundary (C1) guarantees it drops in as just another implementation. Note it in US-820 as an accepted limitation over the MQTT relay. |
| C15 | **Locked-down/managed networks are out of scope** *(accepted, from design discussion)* | Heavily restricted networks (endpoint-protection software that blocks Tor and similar traffic classes, egress-only proxies) may block this traffic entirely, and operating managed hardware this way can carry policy risk. The epic targets machines the user controls (personal laptop, VM, home machine). Restricted/managed environments are best-effort/unsupported, not a design constraint. |
| C16 | **Broker message-size limits + quotas** | Brokers cap message size (public brokers typically ~1 MB; HiveMQ Cloud free = 5 MB), so `file-op` payloads (US-818) can exceed a single message → US-816 framing includes chunking + reassembly. Free-tier traffic quotas (HiveMQ 10 GB/mo) are ample for chat/file-ops but are one more reason the remote window mirror (US-820) wants the direct fast path (C14) rather than the relay. |
| C17 | **Chat history is local-only** *(consequence of C1, accepted)* | The transport stores nothing, so per-contact chat history (US-817) is persisted locally on each side; a message sent while the peer is offline is not delivered later. Consistent with the no-store-and-forward requirement. |
| C18 | **Per-contact capability config** *(resolved — user decision 2026-07-11)* | Every contact record carries a trust config, **enforced on the receiving/controlled side** (each side controls only what IT grants — same principle as C9): (1) **messages** — `enabled` boolean, default **true** (a contact exists to communicate), user can disable temporarily; a blocked sender receives a `control` "blocked" notice rather than silence (recommended — leaks nothing, the peer is already paired; a silent-ignore variant can be a later option). (2) **fileAccess** — `mode: "deny" \| "ask" \| "auto"` + `allowedPaths: string[]`; default **"ask"** with an empty list (= nothing reachable until the user adds paths); enforcement canonicalizes request paths against the allowlist on the serving side (US-818). (3) **remoteControl** — `mode: "deny" \| "ask" \| "auto"`; default **"ask"** (= C9's accept-prompt), `"auto"` = C9's auto-grant, applies to US-819 + US-820. `"deny"` is a hard off that never prompts (useful against a noisy peer). Config is editable at import time and later in contact settings; stored in `contacts.json`, off the `app`/script surface. Enforcement lives in `PeerSession` (US-816) as a single capability gate in front of all feature handlers. |

## Notes

### 2026-07-09
- Epic created from an extended design discussion. Key decisions reached with the user before
  drafting:
  - **Dropped Tor** (not a built-in dep — uses the installed Tor Browser exe — and it is fully
    blocked on some locked-down networks). Dropped raw serverless P2P (defeated by
    NAT/restrictive firewalls without a rendezvous).
  - **Transport = Matrix as an untrusted dumb pipe** over HTTPS (survives restrictive networks,
    tolerates offline), abstracted behind a pluggable `PeerTransport` for a later direct/LAN
    fast path.
  - **Persephone owns the crypto** (libsodium `crypto_box`); Matrix never sees plaintext or
    keys. Corrected the user's key-role wording: public key **encrypts**, private key
    **decrypts**; each side needs the other's public key. No home-rolled cipher.
  - **Pairing is out-of-band file exchange**, not key-over-the-wire: "Generate connection
    contact" → file (public key + Matrix locator + metadata + fingerprint) → exchanged via the
    users' own channel (WhatsApp/Teams) → imported + pinned on both sides. This is the
    MITM-resistant design and replaces the earlier "copy link → paste → Accept popup" idea (the
    mutual import is the consent on both sides).
  - The contact file needs a **network locator** (Matrix address), not just a key — a gap in the
    user's initial description, now folded into the contact-file format (C7).
- Infrastructure investigated and verified across three areas (build/packaging + native modules;
  trust registry + persistence + dialogs + state + settings; editor + content-provider + scheme
  wiring + command surface + CDP). Findings recorded in Background; all file/line references
  checked against source.
- Packaging risk assessed as **low**: no native modules exist today, so WASM/pure-JS deps
  (`libsodium-wrappers`, `matrix-js-sdk`) need no new build config, and keeping the service in
  the renderer avoids the dual-build entry-point drift hazard.
- Concerns C1-C15 are **open** except C11. C2 (Matrix account provisioning), C4
  (private-key-at-rest / master password), and C9 (remote-control security posture) need user
  input and should be dispositioned first — they shape US-814, US-813, and US-819 respectively.
  Per-task documents to be written as each task starts (US-813 first).
- **C11 resolved (screencast).** User confirmed the remote browser tab uses screencast frames +
  CDP input-injection, not DOM synchronization. DOM-mirroring (rrweb) was weighed and rejected:
  because a mirrored DOM has no page JS, interaction must round-trip to the source regardless, so
  it loses the fidelity advantage while breaking on cross-origin iframes, canvas/video, and
  non-traveling resources. Screencast keeps rendering on the source (pixel-faithful for any
  site); the CDP input-injection half already exists, only the frame-event channel is new.
- **US-820 reframed to "remote window mirror" + C9 resolved.** User proposed making remote
  control **window-based**: registered peers appear in the App bar (by the "Open Tabs"/windows
  section), and connecting opens a local window that is a live mirror of the remote **main
  window** ("this local window = that remote Persephone"). This reuses the C11 screencast+input
  mechanism against the whole app window via the existing app-window CDP target (`AppTargetModel`
  / `APP_WINDOW_CDP_KEY`, US-810) and subsumes the browser-tab case. It is the highest-capability
  form of remote control (full control of the remote Persephone), which sharpens rather than
  softens C9.
- **C9 resolved (controlled-side grant + opt-in auto-trust).** No silent control: the controlled
  side prompts to accept per connection by default. A per-contact **auto-grant** flag on the
  *controlled* machine's contact record enables unattended connection to machines the user owns
  (set at pairing/import — the controlled side decides what it grants; you cannot self-assert
  trust from the connecting side). Even under auto-grant, an always-visible, revocable
  "controlling" indicator. Accepted tradeoff: auto-grant = unattended control by the pinned-key
  holder (opt-in, per-contact, key-gated). Verified the enabler exists: `AppTargetModel` already
  CDP-targets the app's own window; only the CDP frame-event channel is new.

### 2026-07-11

- **Transport swapped: Matrix → MQTT (C1 + C2 resolved).** Design review concluded the server
  should be a pure forwarder with no message history: one side registers (subscribes) on the
  server, the other sends to its identifier; if no registered consumer is connected, the
  message is lost. That is exactly MQTT QoS 0 pub/sub semantics — and consistent with the
  already-accepted no-store-and-forward model (C8). Matrix's main advantage (offline message
  tolerance) was unused, and its main cost (account provisioning — the old C2, the "biggest UX
  unknown") is eliminated: the default broker needs no accounts at all. Alternatives weighed:
  Nostr ephemeral events (kinds 20000-29999, forward-only; keypair identity but secp256k1 ≠ our
  X25519), ntfy (rate-limited, notification-oriented), WebRTC/PeerServer (better seen as the
  future C14 fast path, not the v1 relay).
- **Broker selection (user decision):** (1) default out-of-the-box `broker.emqx.io`
  (`wss://…:8084/mqtt`, anonymous, testing-grade — backed by EMQX's commercial cloud but
  officially test-only); (2) recommended reliable path: private **HiveMQ Cloud free tier**
  (100 connections, 10 GB/mo, no credit card, authenticated WSS). Same `MqttTransport` code
  either way — only connection config differs.
- **Transport pluggability elevated to a hard requirement (user decision):** every future
  communication channel must be addable purely as another implementation of the transport
  interface (`PeerTransport` — the user's "IChannel" concept), with zero changes to the
  crypto, contacts, or feature layers. `PeerTransport` is the only transport surface upper
  layers may import.
- Ripple effects folded in: contact-file locator is now broker URL + random unguessable inbox
  topic (+ optional private-broker credentials) instead of a Matrix address; US-816 gains
  lightweight ack/retry (QoS 0 drops during blips) and chunking (broker message-size caps,
  new C16); chat history is local-only (new C17); presence via MQTT LWT + app ping (C8);
  dependency change `matrix-js-sdk` → `mqtt.js` (pure JS, far smaller — packaging story
  unchanged); C6 (Matrix E2E) obsolete.
- **Per-contact capability config added (C18, user decision).** C9's single remote-control
  grant generalized into a three-part trust config on every contact record, enforced on the
  receiving/controlled side: **messages** (on by default, temporarily disableable — blocked
  senders get a `control` "blocked" notice back), **fileAccess** (`deny|ask|auto` + a path
  allowlist, default "ask" + empty list; serving side canonicalizes request paths against the
  allowlist), **remoteControl** (`deny|ask|auto`, default "ask" = C9's accept-prompt, "auto" =
  C9's auto-grant). Three refinements proposed and **confirmed by the user**: the third
  `"deny"` hard-off mode (never prompts), the "notify sender when blocked" default (a
  silent-ignore variant may come later), and file-access "ask" granularity of once per
  contact-session per allowlist root. Enforcement is centralized as a capability gate in `PeerSession` (US-816);
  config UI at import time + contact settings (US-815).
