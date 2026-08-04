# Content Delivery Pipeline

## Overview

The content delivery pipeline (`/src/renderer/content/`) is a unified I/O layer that decouples editors from data sources. Instead of editors reading files directly, all content flows through composable pipes that combine a data source (provider) with data effects (transformers). This makes it possible to open a file inside a ZIP archive, decrypt it on the fly, and save it back -- all transparent to the editor.

The pipeline was introduced in EPIC-012 to replace scattered file I/O calls across the codebase. It handles encoding detection, file watching, caching, and serialization for session restore.

## 3-Layer Pipeline

Opening content flows through three event-driven layers. Each layer is registered as an `EventChannel` subscriber during bootstrap. Subscribers execute in LIFO order, so later registrations act as higher-priority interceptors.

```
  Caller creates ILinkData via createLinkData(href, options?)
         │
  ┌──────▼──────────────────────────────────────────────┐
  │  Layer 1 — Parsers (parsers.ts)                     │
  │  openRawLink → openLink                             │
  │  Parse href, enrich ILinkData (set url, target, etc)│
  └──────┬──────────────────────────────────────────────┘
         │  ILinkData { href, url, target?, ...fields }
  ┌──────▼──────────────────────────────────────────────┐
  │  Layer 2 — Resolvers (resolvers.ts)                 │
  │  openLink → openContent                             │
  │  Build pipe, enrich ILinkData (set pipe, pipeDesc.) │
  └──────┬──────────────────────────────────────────────┘
         │  ILinkData { url, pipe, pipeDescriptor, target, ... }
  ┌──────▼──────────────────────────────────────────────┐
  │  Layer 3 — Open Handler (open-handler.ts)           │
  │  openContent → page creation                        │
  │  Pass pipe to PagesModel.lifecycle.openFile()       │
  └─────────────────────────────────────────────────────┘
```

### Layer 1 — Parsers

Registered in `parsers.ts` via `registerRawLinkParsers()`. Each parser receives an `ILinkData` object, reads `data.href`, enriches the object (sets `data.url`, HTTP fields, etc.), and forwards the same object on `app.events.openLink`. Registration order (LIFO):

| Parser | Detects | Example input |
|--------|---------|---------------|
| cURL/fetch | `curl ` or `fetch(` prefix | `curl -H "Auth: x" https://api.com/data.json` |
| tree-category | `tree-category://` prefix | `tree-category://base64...` (folder navigation) |
| data: URL | `data:` prefix | `data:text/javascript;base64,Y29uc3Q...` (inline content) |
| HTTP | `http://` or `https://` prefix | `https://example.com/file.json` |
| Archive | `!` separator (via `isArchivePath`) | `C:\docs.zip!data/report.json` |
| File | Everything else (fallback) | `C:\Users\file.txt`, `file:///path` |

**Fragment extraction.** A trailing `#fragment` on an incoming href is an in-document anchor, not part of the path, so the file, archive and `mneme://` parsers split it off into the ephemeral `data.fragment` hint (URL-decoded, without the `#`) before resolving. This is done **only for real URLs** (`file://`, `mneme://`), never for a bare filesystem path: in a URL a literal `#` must be percent-encoded as `%23`, which makes the split unambiguous, whereas `#` is a legal character in Windows file and folder names (`C:\notes\C#\readme.md`). The HTTP parser leaves fragments in the URL, where the browser handles them.

### Layer 2 — Resolvers

Registered in `resolvers.ts` via `registerResolvers()`. Each resolver uses `resolveUrlToPipeDescriptor()` (from `link-utils.ts`) to create a pipe descriptor, then `createPipeFromDescriptor()` (from `registry.ts`) to instantiate the pipe. Enriches the `ILinkData` object (sets `data.pipe`, `data.pipeDescriptor`, `data.target`) and forwards the same object on `app.events.openContent`.

- **File resolver** (fallback) -- resolves file paths and archive paths (with "!") to pipe descriptors. Resolves target editor via `editorRegistry.resolveId()`. Two short-circuits run before pipe resolution: (1) explicit **browser intent** (`data.target === "browser"` or a `browserMode` is set) normalizes the path to a `file://` URL via `toFileUrl()` and opens it in a browser through the shared `openLinkInBrowser()` helper, bypassing Layer 3; (2) a plain (non-virtual, non-archive) path is `stat`-ed via `app.fs.stat()` and, if it is a **directory**, opens an empty page (no main editor) with the Explorer panel rooted at the folder via `pagesModel.addEmptyPageWithNavPanel()` and marks `data.handled`. Directories never produce a content pipe.
- **HTTP resolver** -- resolves HTTP/HTTPS URLs to pipe descriptors. Maps file extensions to editors via a built-in extension table. URLs without recognized extensions (or explicit browser intent) open in the browser via `openLinkInBrowser()`, short-circuiting Layer 3 the same way. cURL/fetch requests with `Accept` headers use header-based editor resolution.
- **Drawing-image resolver** -- when `data.target === "draw-view"` and `data.url` is a `data:image/*` URL, imports the image as a **new untitled Excalidraw drawing** via `pagesModel.addDrawPage()` (which embeds it in a fresh scene) and marks `data.handled`, short-circuiting Layer 3. Registered last so it runs first (LIFO), intercepting before the file resolver would build a pipe. Import-only: the drawing is a new page, never bound to (so never overwriting) the image source. Accepts only data URLs -- a caller with an http/file image converts it to a data URL first.

`openLinkInBrowser()` is the single browser-routing path shared by both resolvers, so `target: "browser"` / `browserMode` works identically for local files and remote URLs. It honors `browserPageId` (route to a specific browser page), `browserMode` (`os-default` → `shell.openExternal`; `internal` / `profile:<name>` / `incognito` → `pagesModel.lifecycle.openUrlInBrowserTab()`), and otherwise the `link-open-behavior` setting.

The `resolveUrlToPipeDescriptor()` utility is also used by tree providers to create pipes from URLs without going through the event channel system.

### Layer 3 — Open Handler

Registered in `open-handler.ts` via `registerOpenHandler()`. Reconstructs the full file path from the pipe (combining provider `sourceUrl` + ArchiveTransformer `entryPath` for archive files). Cleans the `ILinkData` via `cleanForStorage()` (strips ephemeral fields like `handled`, `pipe`, `pageId`, `revealLine`, `highlightText`, `fragment`, `diffFrom`, `diffTo`) and stores the result as `IEditorState.sourceLink`. Then either:
- Opens a new page via `pagesModel.lifecycle.openFile(filePath, pipe, { sourceLink })` -- the page owns the pipe.
- Navigates an existing page via `pagesModel.lifecycle.navigatePageTo()` (when `data.pageId` is set) -- disposes the pipe since navigation creates its own.

Both paths forward the ephemeral **navigation hints** to the editor: `revealLine`/`highlightText` scroll/highlight a text editor, `diffFrom`/`diffTo` (each an `ILinkDiffRevision` — `unstaged` / `staged` / `head` / `commit`, where a `commit` with an empty hash denotes the empty tree) preselect the two sides of a File Diff comparison, and `fragment` scrolls to an in-document anchor.

Most hints are consumed only on a **fresh editor build**, never on a reuse/activate path, so they cannot perturb an already-open page. `fragment` is the deliberate exception: an anchor link into a document that happens to be open already is still a jump request, so it is applied on every exit of both open paths — including the editor-reuse early returns and `openFile`'s existing-page dedupe — through the optional `EditorModel.revealFragment?(fragment)` hook (same opt-in shape as `onNavigationReuse?()`; editors without in-document anchors simply don't implement it). A fragment also does **not** join `revealLine`/`highlightText` in forcing the Monaco text editor: those hints address lines and therefore need Monaco, whereas an anchor must keep the language preview editor (e.g. the Markdown view) that renders the headings it points at.

The `sourceLink` (`ILinkData` with ephemeral fields removed) is stored in `IEditorState.sourceLink` and persisted across app restarts. It records the page's origin (URL, target editor, title, ILink metadata, HTTP fields, etc.) but is informational only — it does not affect page content or I/O.

## Content Pipe

`IContentPipe` is the central abstraction. It composes one `IProvider` with zero or more `ITransformer` instances.

### Read flow

```
provider.readBinary() → transformer[0].read() → transformer[1].read() → ... → result
```

`readText()` adds encoding detection after the binary chain: `readBinary() → decodeBuffer()`.

### Write flow

```
result → ... → transformer[1].write(data, orig) → transformer[0].write(data, orig) → provider.writeBinary()
```

Transformers are walked in reverse order. Each receives the new data and the original data at that stage (needed by `ZipTransformer` to rebuild the archive around the modified entry). If the provider has no existing content, empty buffers are passed as originals.

`writeText()` encodes the string first: `encodeString() → writeBinary()`.

### Conditional capabilities

- `writable` -- true only if the provider is writable AND all transformers implement `write`.
- `watch` -- delegates to `provider.watch()` if supported. Returns a `SubscriptionObject`.

## Built-in Providers

| Provider | Type | Writable | Watch | Description |
|----------|------|----------|-------|-------------|
| `FileProvider` | `file` | Yes | Yes | Local file read/write via `fs`. Debounced watch (300ms). |
| `HttpProvider` | `http` | No | No | HTTP/HTTPS fetch via `nodeFetch`. Supports method, headers, body. Re-fetches on each read (no internal caching). |
| `CacheFileProvider` | `cache` | Yes | No | Cache directory file (`{userData}/cache/{pageId}.txt`). Used as provider for cache pipes. |

All providers implement `toDescriptor()` for serialization and `sourceUrl` for display/identity.

## Built-in Transformers

| Transformer | Type | Persistent | Description |
|-------------|------|------------|-------------|
| `ZipTransformer` | `zip` | Yes | Extract/replace a single entry in a ZIP archive via jszip (dynamic import). Write rebuilds the archive with the modified entry. |
| `DecryptTransformer` | `decrypt` | No | AES-GCM encrypt/decrypt via `shell.encryption`. Non-persistent -- password must never be serialized to disk. |

The `persistent` flag controls whether the transformer appears in `toDescriptor()` output. Non-persistent transformers are excluded from serialization but still participate in `clone()` (in-memory only).

## Dual-Pipe Model

`TextFileIOModel` maintains two pipes for each text page:

```
Primary pipe:  FileProvider("report.json") → [ZipTransformer, DecryptTransformer]
               ↕ read/write source file

Cache pipe:    CacheFileProvider(pageId) → [ZipTransformer, DecryptTransformer]
               ↕ auto-save unsaved changes
```

The cache pipe is created via `primaryPipe.cloneWithProvider(new CacheFileProvider(id))`. This ensures the cache pipe shares the same transformer chain -- encrypted files stay encrypted in cache, archive entries stay in ZIP format.

When the primary pipe changes (e.g., after decryption adds a `DecryptTransformer`), `recreateCachePipe()` rebuilds the cache pipe to stay in sync.

## Encoding Detection

`decodeBuffer()` in `encoding.ts` detects text encoding with this priority:

1. **BOM detection** (O(1)) -- UTF-8-BOM (`EF BB BF`), UTF-16LE (`FF FE`), UTF-16BE (`FE FF`)
2. **Large file skip** -- files >20MB default to UTF-8 (skip detection)
3. **Explicit override** -- if encoding was previously detected and passed in
4. **jschardet** -- statistical detection with >70% confidence threshold
5. **UTF-8 probe** -- decode as UTF-8 and check for replacement characters (`U+FFFD`)
6. **Fallback** -- Windows-1251

The detected encoding is stored on the pipe (`pipe.encoding`) and persisted in `IPipeDescriptor` so that write-back uses the same encoding. `encodeString()` handles the reverse, including BOM insertion for UTF-8-BOM and UTF-16 variants.

## Clone-and-Try Pattern

Pipes are immutable-by-convention. When a transformation needs to be tested before committing (e.g., decryption with a user-provided password), use the clone-and-try pattern:

1. `clone()` the active pipe (deep copies provider and all transformers via descriptors)
2. `addTransformer()` or `removeTransformer()` on the clone
3. Attempt `readText()` on the clone
4. **Success** -- dispose the original pipe, swap in the clone, recreate cache pipe
5. **Failure** -- dispose the clone, keep the original pipe unchanged

Example from `TextFileEncryptionModel.decript()`:

```typescript
const candidate = pipe.clone();
candidate.addTransformer(new DecryptTransformer(password));
try {
    const plaintext = await candidate.readText();
    pipe.dispose();
    this.model.pipe = candidate;       // swap
    this.model.io.recreateCachePipe(); // sync cache
} catch {
    candidate.dispose();               // discard on failure
}
```

The same pattern is used for locking (removing `DecryptTransformer`) and removing encryption entirely.

## Pipe Serialization

Pipes serialize to `IPipeDescriptor` for session persistence (stored in `IEditorState.pipe`):

```typescript
interface IPipeDescriptor {
    provider: IProviderDescriptor;       // { type, config }
    transformers: ITransformerDescriptor[]; // [{ type, config }, ...]
    encoding?: string;                   // detected encoding
}
```

Key rules:
- Only transformers with `persistent === true` are included. `DecryptTransformer` (password) is excluded.
- `createPipeFromDescriptor()` in `registry.ts` reconstructs a pipe from its descriptor using registered factories.
- Provider and transformer types are registered at module load time in `registry.ts` (e.g., `registerProvider("file", ...)`, `registerTransformer("zip", ...)`).

## Key Files

| File | Purpose |
|------|---------|
| `/src/renderer/content/ContentPipe.ts` | `ContentPipe` class -- pipe implementation |
| `/src/renderer/content/registry.ts` | Provider/transformer factory registry, `createPipeFromDescriptor()` |
| `/src/renderer/content/parsers.ts` | Layer 1 -- raw link parsers |
| `/src/renderer/content/resolvers.ts` | Layer 2 -- link resolvers, editor mapping |
| `/src/renderer/content/link-utils.ts` | URL → pipe descriptor resolution (reusable by tree providers) |
| `/src/renderer/content/open-handler.ts` | Layer 3 -- page creation from pipe |
| `/src/renderer/content/encoding.ts` | Encoding detection (`decodeBuffer`) and encoding (`encodeString`) |
| `/src/renderer/content/providers/FileProvider.ts` | Local file provider |
| `/src/renderer/content/providers/HttpProvider.ts` | HTTP/HTTPS provider |
| `/src/renderer/content/providers/CacheFileProvider.ts` | Cache file provider |
| `/src/renderer/content/transformers/ZipTransformer.ts` | ZIP archive entry transformer |
| `/src/renderer/content/transformers/DecryptTransformer.ts` | AES-GCM encryption transformer |
| `/src/renderer/api/types/io.pipe.d.ts` | `IContentPipe`, `IPipeDescriptor` type definitions |
| `/src/renderer/api/types/io.provider.d.ts` | `IProvider`, `IProviderDescriptor` type definitions |
| `/src/renderer/api/types/io.transformer.d.ts` | `ITransformer`, `ITransformerDescriptor` type definitions |
| `/src/renderer/editors/text/TextFileIOModel.ts` | Dual-pipe model (primary + cache) |
| `/src/renderer/editors/text/TextFileEncryptionModel.ts` | Clone-and-try encryption operations |
| `/src/renderer/scripting/api-wrapper/IoNamespace.ts` | Script `io` namespace exposing pipe APIs |

## Related Documentation

- [Architecture Overview](./overview.md) -- Section 5 covers the pipeline at a high level
- [Editors](./editors.md) -- Editor system that consumes pipes
- [Scripting](./scripting.md) -- Script `io` namespace for pipe access
- [Pages Architecture](./pages-architecture.md) -- Page lifecycle and pipe ownership
