# US-662 — `MnemeProvider` (content-pipeline provider over MCP)

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 4 (Persephone content integration)
**Status:** Implemented — `tsc --noEmit` + `eslint` clean; manual smoke confirmed by the user.
**Spans:** Renderer (`src/renderer/`) only
**Depends on:** [US-661](../US-661-mcp-subscription-support/README.md) (client subscription wiring — landed)
and [US-670](../US-670-mneme-resource-subscription-emit/README.md) (server emit — landed). This is the
first **consumer** that exercises that subscription primitive end-to-end.

## Goal

Open, read, edit, and save Mneme wiki documents in Persephone's normal editors via a new
`MnemeProvider` content-pipeline provider (mirroring `FileProvider`), and **live-refresh** an open
document when it changes on disk — through an AI agent's `wiki_write` or any direct-disk edit caught
by Mneme's always-on watcher — using the MCP resource-subscription primitive. Reads go through
`resources/read`; writes/edits/deletes go through the `wiki_write`/`wiki_edit`/`wiki_delete` tools.
Files on disk stay the source of truth; Persephone's saves bypass nothing — Mneme writes the file and
indexes it synchronously (EPIC-032, "editing & tree via MnemeProvider" decision).

US-662 ships **no tree UI** — that is US-663. It does add the `mneme://` link parser + resolver so a
`mneme://{root}/{path}` link opens an editor backed by `MnemeProvider` (independently testable before
the tree exists).

## Background (verified)

### The provider contract — `IProvider`

Declared in `src/renderer/api/types/io.provider.d.ts`:

```typescript
export interface IProvider {
    readonly type: string;
    readonly displayName: string;
    readonly sourceUrl: string;
    readonly restorable: boolean;
    readonly writable: boolean;
    readBinary(): Promise<Buffer>;
    createReadStream?(range?: { start: number; end: number }): NodeJS.ReadableStream;
    writeBinary?(data: Buffer): Promise<void>;
    stat?(): Promise<IProviderStat>;                       // { size?, mtime?, exists }
    watch?(callback: (event: string) => void): ISubscriptionObject;
    toDescriptor(): IProviderDescriptor;                   // { type, config }
    dispose?(): void;
}
```

`createReadStream`, `writeBinary`, `stat`, `watch`, `dispose` are **optional**. `IPipeDescriptor`
(`src/renderer/api/types/io.pipe.d.ts`) = `{ provider: { type, config }, transformers: [], encoding? }`.

### Live-refresh path (mirror this exactly)

`FileProvider.watch(cb)` (`src/renderer/content/providers/FileProvider.ts:52-69`) returns an
`ISubscriptionObject`. The flow:

1. `ContentPipe.watch` getter (`src/renderer/content/ContentPipe.ts:135-138`) delegates straight to
   `provider.watch` — no transformation.
2. `TextFileIOModel.setupWatch()` (`src/renderer/editors/text/TextFileIOModel.ts:63-70`) calls
   `pipe.watch(this.onFileChanged)` and stores the subscription.
3. `TextFileIOModel.onFileChanged` (`:295-335`): on a change event it (a) calls
   `pipe.provider.stat?.()` to detect deletion, (b) **if the editor is clean** (`!modified`)
   silently re-reads via `pipe.readText()` and replaces content, (c) **if the editor has unsaved
   edits** does nothing — preserving local edits. Identical UX to `FileProvider`.

`MnemeProvider.watch(cb)` therefore needs to call `cb("change")` whenever the server emits
`notifications/resources/updated` for this document's URI — wired through the shared connection
service (below), **not** by giving each provider its own `McpConnectionManager`.

### MCP tool contracts (verified against `mneme/src/mcp/params.rs` + `server.rs`)

All path tools take a **single `path` = the full `{root}/{path}` address** (no separate `root` param):

```
wiki_read   { path, offset?, limit? } → { content, frontmatter }   // content has frontmatter STRIPPED
wiki_write  { path, content }          → "ok"                       // content = the WHOLE file (frontmatter at top)
wiki_edit   { path, old_string, new_string, replace_all? } → "ok"
wiki_delete { path }                   → "ok"
```

Resource URI is `mneme://{root}/{path}` (e.g. `mneme://personal/contacts/jane.md`). `resources/read`
returns `{ contents: [{ uri, mimeType, text?, blob? }] }`. **There is no `wiki_stat` tool.**

- **Read for the editor uses `resources/read`, not `wiki_read`** — `wiki_read` strips the YAML
  frontmatter (returns `{ content, frontmatter }` separately), but the editor must show the *whole
  file* (frontmatter included) so a round-trip save via `wiki_write` is loss-free. `resources/read`
  returns the raw document. (`wiki_read` stays an agent tool, unused here.)

### MCP call patterns (from `MnemeConfigEditorModel` / `McpInspectorEditorModel`)

```typescript
const client = connection.getClient();          // Client | null (null unless "connected")
const result = await client.callTool({ name: "wiki_write", arguments: { path, content } });
const res    = await client.readResource({ uri });   // res.contents[0].text
```
Tool-result parsing: `parseToolResult<T>(result)` (`mnemeTypes.ts:126-139`) prefers
`structuredContent`, else parses `content[].text` as JSON.

### Where the Mneme connection lives today

Two **separate** `McpConnectionManager` instances exist, and **no shared content connection**:

- `MnemeConfigEditorModel.connection` (`mneme-config/MnemeConfigEditorModel.ts:78`) — per config-editor
  tab, control-plane tools.
- `mnemeStatusModel` singleton (`src/renderer/api/mneme-status.ts`) — owns a **throwaway 30 s
  `wiki_status` health probe** connection (no `autoReconnect`; dropped + recreated on every probe
  failure). It drives the green header indicator. **Not reusable for live subscriptions** — a probe
  failure disposes the connection, killing subscriptions, and it has no `autoReconnect`.

Both derive the sidecar URL from `api.getMnemeStatus()` (IPC) + `ipcRendererEvents.eMnemeStatusChanged`
(push), gated on the `mneme.enabled` setting. `mnemeStatusModel.init()` is called once at bootstrap
(`app.ts:254-255`). Parsers/resolvers/open-handler are registered at `app.ts:186-192`.

### Link pipeline (Layers 1–3) — how a `mneme://` URL must route

- **Layer 1 parsers** (`parsers.ts`, `registerRawLinkParsers()`): each scheme parser early-returns
  unless the href matches its prefix, sets `data.url`, then `await app.events.openLink.sendAsync(data)`
  and `data.handled = true`. The **file parser is the unguarded fallback, registered FIRST → runs LAST**
  (LIFO). A scheme parser registered after it runs **before** it. The channel **halts on
  `data.handled`** (this is why `http://` links don't also hit the file parser's "Invalid file path").
- **Layer 2 resolvers** (`resolvers.ts`, `registerResolvers()`): the file resolver is the fallback
  (registered first → runs last); it builds `data.pipeDescriptor` via `resolveUrlToPipeDescriptor` and
  fires `openContent`. A `mneme://` URL would otherwise fall into its `data.url.includes("://")`
  branch and be wrongly wrapped in a **file** pipe — so a dedicated mneme resolver (registered after
  → runs first, guarded, halts on handled) is required.
- **Layer 3** open-handler consumes `data.pipe` and creates/navigates the page — **no change needed**.

### Registry

`src/renderer/content/registry.ts` — `registerProvider(type, factory)` keyed by descriptor `type`;
existing: `file`/`cache`/`http`/`data`. `createPipeFromDescriptor(descriptor)` rebuilds a pipe on
restore.

## Implementation plan

### 1. Shared connection service — `src/renderer/api/mneme-connection.ts` (NEW)

A singleton `mnemeConnection` owning **one** `McpConnectionManager` for content I/O + subscriptions.
Modeled on `mneme-status.ts`, but persistent (not a poller) and with `autoReconnect: true`.

Responsibilities:
- `init()` (called once at bootstrap): read `mneme.enabled`, subscribe to `settings.onChanged`
  (`mneme.enabled`) and `ipcRendererEvents.eMnemeStatusChanged`, and prime via `api.getMnemeStatus()`.
  When `enabled && running && url`, `connect({ name: "Mneme", transport: "http", url, autoReconnect:
  true })`; when not, `dispose()` the manager.
- Wire **once** on the manager: `manager.onResourceUpdated = (uri) => this.dispatchUpdated(uri)` and
  `manager.onResourceListChanged = () => this.listChangedWatchers.forEach((cb) => cb())`.
- `getClient(): Client | null` — passthrough to `manager?.getClient()`.
- **Refcounted per-URI subscriptions** (multiple editors may open the same doc):
  `subscribe(uri, cb): ISubscriptionObject` adds `cb` to `Map<string, Set<cb>>`; on the **0→1**
  transition for a URI, call `manager.subscribeResource(uri)`. `unsubscribe` removes `cb`; on **1→0**,
  call `manager.unsubscribeResource(uri)`. `dispatchUpdated(uri)` calls every `cb` registered for that
  URI with `"change"`.
- `onListChanged(cb): ISubscriptionObject` — register/unregister a tree-refresh listener
  (consumed by US-663; built here because it is the same fan-out).

> `McpConnectionManager` exposes a **single** `onResourceUpdated`/`onResourceListChanged` callback and
> already **replays its subscription Set on every (re)connect** (US-661). The service multiplexes that
> single callback to N watchers and relies on the manager's replay so a reconnect re-subscribes
> automatically.

Bootstrap wiring in `src/renderer/api/app.ts` — right after `mnemeStatusModel.init()` (`:254-255`):

```typescript
const { mnemeConnection } = await import("./mneme-connection");
mnemeConnection.init();
```

### 2. `MnemeProvider` — `src/renderer/content/providers/MnemeProvider.ts` (NEW)

```typescript
import { mnemeConnection } from "../../api/mneme-connection";
// implements IProvider

constructor(private readonly path: string) {}   // path = "{root}/{path}", no scheme

get type()        { return "mneme"; }
get displayName() { return this.path; }
get sourceUrl()   { return this.uri; }           // "mneme://" + this.path
get restorable()  { return true; }
get writable()    { return true; }
private get uri() { return `mneme://${this.path}`; }

async readBinary(): Promise<Buffer> {
    const client = mnemeConnection.getClient();
    if (!client) throw new Error("Mneme is not connected");
    const res = await client.readResource({ uri: this.uri });
    const text = res.contents?.[0]?.text ?? "";
    return Buffer.from(text, "utf8");
}

async writeBinary(data: Buffer): Promise<void> {
    const client = mnemeConnection.getClient();
    if (!client) throw new Error("Mneme is not connected");
    await client.callTool({ name: "wiki_write", arguments: { path: this.path, content: data.toString("utf8") } });
}

watch(callback: (event: string) => void): ISubscriptionObject {
    return mnemeConnection.subscribe(this.uri, () => callback("change"));
}

toDescriptor(): IProviderDescriptor { return { type: "mneme", config: { path: this.path } }; }
```

- **No `stat()`** (no `wiki_stat` tool). `onFileChanged` guards `stat ? !stat.exists : false`, so a
  missing `stat` simply means deletion-while-open is not flagged — acceptable (Concern 3).
- **No `createReadStream`** — documents are small text; `readBinary` suffices.
- `dispose()` not required (the watch subscription's `unsubscribe` does the teardown via the service).

### 3. Register the provider — `src/renderer/content/registry.ts`

```typescript
import { MnemeProvider } from "./providers/MnemeProvider";
registerProvider("mneme", (config) => new MnemeProvider(config.path as string));
```

### 4. `mneme://` parser — `src/renderer/content/parsers.ts` (inside `registerRawLinkParsers()`)

Add after the file parser (so it runs before it via LIFO), mirroring the `tree-category://` parser:

```typescript
// mneme:// parser — Mneme wiki documents (EPIC-032)
app.events.openRawLink.subscribe(async (data) => {
    if (!data.href.startsWith("mneme://")) return;
    data.url = data.href;
    data.handled = false;
    await app.events.openLink.sendAsync(data);
    data.handled = true;
});
```

### 5. `mneme://` resolver — `src/renderer/content/resolvers.ts` (inside `registerResolvers()`)

Add after the file resolver (runs before it via LIFO), guarded:

```typescript
// mneme:// resolver — route to MnemeProvider (EPIC-032)
app.events.openLink.subscribe(async (data) => {
    if (!data.url?.startsWith("mneme://")) return;
    const path = data.url.slice("mneme://".length);          // "{root}/{path}"
    data.target = data.target || editorRegistry.resolveId(path) || "monaco";
    data.pipeDescriptor = { provider: { type: "mneme", config: { path } }, transformers: [] };
    data.pipe = createPipeFromDescriptor(data.pipeDescriptor);
    data.handled = false;
    await app.events.openContent.sendAsync(data);
    data.handled = true;
});
```

(`editorRegistry`/`createPipeFromDescriptor` are already imported in `resolvers.ts`.)

### Files needing NO changes

- `src/renderer/content/open-handler.ts` — Layer 3 consumes `data.pipe` generically.
- `src/renderer/content/ContentPipe.ts` — `watch` delegates to the provider already.
- `src/renderer/editors/text/TextFileIOModel.ts` — the reload path is provider-agnostic.
- `src/renderer/api/mneme-status.ts` — the health prober stays a separate connection.
- `src/renderer/editors/mcp-inspector/McpConnectionManager.ts` — US-661 already added the subscription
  surface this consumes.
- All `mneme/` Rust code — US-670 already emits the notifications.

## Concerns & proposed resolutions

1. **One connection vs one-per-document.** A provider per open doc must not each open its own SSE
   session. *Resolution:* a single `mnemeConnection` singleton owns one `McpConnectionManager`;
   providers call into it. Refcounted per-URI subscribe/unsubscribe so closing one of two editors on
   the same doc doesn't unsubscribe the other.
2. **Reusing the status prober's connection.** *Resolution:* **No.** `mnemeStatusModel`'s connection is
   a throwaway poller (disposed on probe failure, no `autoReconnect`) — unsuitable for durable
   subscriptions. The content service is a separate, persistent connection with `autoReconnect: true`
   (US-671). Two loopback sessions to a 1-to-many server (D9) is fine. (A later optimization could fold
   the status probe into this connection; out of scope.)
3. **No `wiki_stat` → deletion-while-open isn't flagged.** *Resolution:* accept for v1. `stat()` is
   optional and `onFileChanged` already no-ops when it's absent (the editor retains its content —
   consistent with the epic's last-write-wins, no-locking stance). Tree-level add/remove/rename rides
   `notifications/resources/list_changed` → tree refresh in **US-663**. A reopen of a deleted doc fails
   the `resources/read` (surfaced as a load error) — acceptable.
4. **Self-echo: our own `wiki_write` triggers the watcher → `resources/updated`.** US-670's watcher
   emits `updated` for every changed path, so a Persephone save echoes back as a change and re-reads
   the just-saved (now-clean) editor. *Resolution:* **do nothing — match `FileProvider` exactly.**
   `FileProvider` does **not** suppress its own echo and neither does the editor: after `saveFile`
   sets `modified = false`, the `fs.watch` echo fires `onFileChanged`
   (`TextFileIOModel.ts:295-329`), which re-reads the file and sets `s.content` to the **identical**
   bytes — a harmless no-op (Monaco diffs identical content, no flicker). The Mneme path is the same:
   `wiki_write` writes `content` verbatim (no frontmatter normalization), so the echo's
   `resources/read` returns byte-identical content → no-op. The only cost is one extra **loopback**
   read per save — directly analogous to `FileProvider`'s extra disk read. Adding suppression would
   diverge from the established editor contract for no benefit, so we don't.
5. **Disconnected on read/write.** *Resolution:* `readBinary`/`writeBinary` throw a clear
   `"Mneme is not connected"` when `getClient()` is null; the editor surfaces it like any load/save
   error. `autoReconnect` plus the manager's subscription replay restore live-refresh once the sidecar
   is back.
6. **`restorable: true` but the sidecar may be off at restart.** *Resolution:* keep `restorable: true`
   (the URI is stable and meaningful). On restore with Mneme disabled, `readBinary` throws and the
   editor shows a load error — same failure mode as a `FileProvider` whose file is gone. When the user
   enables Mneme, a manual reload (or reopening the link) succeeds.
7. **Editor target for non-`.md` attachments.** `editorRegistry.resolveId(path)` picks the editor by
   extension (`.md`→markdown/monaco, `.png`→image-view, `.pdf`→pdf-view), falling back to `monaco`.
   Binary attachments read fine via `resources/read` (`contents[0].blob` base64) — *but* `readBinary`
   as written reads `text`. *Resolution (v1):* documents are markdown/text; if `text` is absent, fall
   back to `Buffer.from(contents[0].blob ?? "", "base64")` so image/PDF attachments also open. One
   extra line in `readBinary`; keeps the provider general without extra scope.

## Acceptance criteria

- [x] **Manual smoke:** Opening a `mneme://{root}/{path}` link opens an editor whose content is the
      **whole document including YAML frontmatter**, backed by `MnemeProvider`.
- [x] **Manual smoke:** Editing + saving the editor writes back via `wiki_write` (file on disk changes
      and the index reflects it).
- [x] **Manual smoke:** With the editor open and **clean**, an external change — an agent `wiki_write`
      **or** a direct-disk edit — silently reloads the editor content (live-refresh).
- [x] **Manual smoke:** With **unsaved local edits**, an external change does **not** clobber them.
- [x] A Persephone save's watcher echo re-reads identical content (no-op, no visible flicker) —
      matching `FileProvider`; no echo suppression is implemented (Concern 4). *(by design)*
- [x] Only one MCP session is opened for content I/O regardless of how many Mneme docs are open;
      closing all of them unsubscribes at the server. *(refcounted in `mnemeConnection`)*
- [x] `tsc --noEmit` and `eslint` are clean.

> **Renderer task** — in scope for `/review`; run `/document` only if a developer-doc pointer is
> warranted (e.g. a Key Files entry for `MnemeProvider` / `mneme-connection.ts`); `/userdoc` only if
> user-facing behavior changes (none here — no UI surface yet). **Epic task** — stays `[ ]` under
> EPIC-032 until the epic's deferred review.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/api/mneme-connection.ts` | **NEW** — `mnemeConnection` singleton: persistent `McpConnectionManager` (autoReconnect), refcounted per-URI subscribe/unsubscribe, `onResourceUpdated`/`onResourceListChanged` fan-out, `getClient()` |
| `src/renderer/content/providers/MnemeProvider.ts` | **NEW** — `IProvider` over MCP: `readBinary` (`resources/read`), `writeBinary` (`wiki_write`), `watch` (subscription), `toDescriptor` |
| `src/renderer/content/registry.ts` | register `"mneme"` provider factory |
| `src/renderer/content/parsers.ts` | add `mneme://` Layer 1 parser |
| `src/renderer/content/resolvers.ts` | add `mneme://` Layer 2 resolver |
| `src/renderer/api/app.ts` | call `mnemeConnection.init()` after `mnemeStatusModel.init()` |
