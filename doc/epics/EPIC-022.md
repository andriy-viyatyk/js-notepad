# EPIC-022: LinkEditor Embedded Scripts

## Status

**Status:** Backlog (recorded idea — see `../tasks/backlog.md`)
**Created:** 2026-04-10
**Updated:** 2026-04-11

## Overview

Add a scripting system to the LinkEditor that stores JavaScript/TypeScript scripts directly inside `.link.json` files. Scripts are organized by category in a collapsible "Scripts" panel and are triggered by specific events (link add/update, link open). Scripts run via the existing ScriptRunner with injected context variables so they can inspect and modify link data before operations complete. Each script can be edited in a dedicated Monaco tab backed by a virtual `IProvider` that reads/writes from the LinkViewModel's in-memory data.

## Goals

- Store scripts inside `.link.json` files alongside links, making link collections self-contained and portable
- Provide a "Scripts" panel in LinkEditor with category/subcategory tree for organizing scripts
- Execute scripts on well-defined events ("on add or update link", "before link open") with injected context
- Allow scripts to modify link data (e.g., auto-categorize new links, rewrite URLs before opening)
- Edit scripts in full Monaco editor pages with content backed by LinkViewModel (not the file system)
- Support script library imports (`require("library/...")`) via existing ScriptRunner infrastructure

## Architecture

### Data Model

Scripts are stored in the `scripts` array of the `.link.json` root object alongside `links` and `state`:

```jsonc
{
    "type": "link-editor",
    "links": [...],
    "state": {...},
    "scripts": [
        {
            "id": "a1b2c3d4-...",           // crypto.randomUUID()
            "name": "Auto-categorize GitHub links",
            "category": "Automation/Categorize",  // "/" separated path
            "language": "typescript",        // "javascript" | "typescript"
            "event": "onLinkAddOrUpdate",    // script trigger event
            "hostname": "",                  // filter: only run for this hostname (empty = all)
            "enabled": true,
            "code": "// script source code\neditedLink.category = 'GitHub';"
        }
    ]
}
```

**New types** (in `linkTypes.ts`):

```typescript
/** Script trigger events. */
export type LinkScriptEvent = "onLinkAddOrUpdate" | "beforeLinkOpen";

/** Script item stored in .link.json */
export interface LinkScriptItem {
    id: string;
    name: string;
    category: string;          // "/" separated path for tree grouping
    language: "javascript" | "typescript";
    event: LinkScriptEvent;
    hostname: string;          // filter for beforeLinkOpen (empty = match all)
    enabled: boolean;
    code: string;
}
```

**Extended `LinkEditorData`:**

```typescript
export interface LinkEditorData {
    links: LinkItem[];
    state: { /* existing */ };
    scripts?: LinkScriptItem[];  // new field
}
```

### Script Events and Context

Two initial events, each with specific context variables injected into script scope:

#### Event: `onLinkAddOrUpdate`

Fires after `addLink()` or `updateLink()` in LinkViewModel, before filters are recomputed.

| Context variable | Type | Description |
|---|---|---|
| `editedLink` | `LinkItem` (mutable) | The link being added or updated. Script can modify fields (category, tags, title, etc.) |
| `isNew` | `boolean` | `true` if this is a new link, `false` if updating |
| `linkEditor` | `LinkViewModel` | The LinkEditor model (read access to all links, categories, etc.) |

**Execution flow:**
1. `addLink()` / `updateLink()` creates/modifies the link in state
2. Collect all enabled scripts with `event === "onLinkAddOrUpdate"`
3. Execute each matching script sequentially via ScriptRunner, passing context
4. After all scripts complete, the (possibly modified) link is already in state
5. Recompute categories/tags/hostnames/filters

#### Event: `beforeLinkOpen`

Fires in `openLink()` before the URL is sent to `app.events.openRawLink`.

| Context variable | Type | Description |
|---|---|---|
| `openingLink` | `ILinkData` (mutable) | The link being opened. Script can modify `href`, `target`, `browserMode`, etc. All original ILink fields (title, category, tags) are preserved. |
| `linkEditor` | `LinkViewModel` | The LinkEditor model |

**Hostname filtering:** Only scripts where `hostname` is empty OR matches `getHostname(link.href)` are executed.

**Execution flow:**
1. `openLink()` builds the `ILinkData` object — must use `linkToLinkData(link)` for full ILink inputs to preserve all metadata (title, category, tags, etc.), or `createLinkData(href, { target })` for simple `{href, target}` inputs (see concern C9)
2. `onLinkOpen?.()` callback runs (Browser editor hook)
3. Collect all enabled scripts with `event === "beforeLinkOpen"` and matching hostname
4. Execute each matching script sequentially, passing context
5. Use the (possibly modified) `openingLink` ILinkData to fire `openRawLink`

### Custom Script Context Injection

**Problem:** `ScriptRunnerBase.SCRIPT_PREFIX` is a fixed string that only exposes `app`, `page`, `io`, `ai`, `React`, etc. We need to inject custom variables per execution.

**Solution:** Add an optional `ctx` parameter to the script execution path:

1. **Extend `ScriptContext`** with an optional `ctx: Record<string, unknown>` property.
2. **Build a dynamic prefix** in `ScriptRunnerBase.executeInternal()`:
   - Start with the existing `SCRIPT_PREFIX`
   - If `context.ctx` exists, append `var editedLink=this.ctx.editedLink,...` for each key
3. **Add a new `ScriptRunner` entry point:**
   ```typescript
   /** Execute a script with custom scope variables (no UI output handling). */
   runWithScope = async (
       script: string,
       ctx: Record<string, unknown>,
       page?: EditorModel,
       language?: string,
   ): Promise<any>
   ```

This approach keeps the existing execution paths untouched and only adds scope when explicitly provided.

### LinkEditorScriptProvider (Virtual IProvider)

A custom `IProvider` implementation that reads/writes script source code from/to the `LinkViewModel`'s in-memory script data instead of the file system.

```
link-editor-script://{pageId}/{scriptId}
```

**Key properties:**
- `type`: `"link-editor-script"`
- `restorable`: `false` (cannot be restored after app restart — the LinkEditor page must be open)
- `writable`: `true` while owner LinkEditor page is open; `false` after it closes
- `displayName`: script name (e.g., "Auto-categorize GitHub links.ts")

**Implementation (`LinkEditorScriptProvider`):**

```typescript
class LinkEditorScriptProvider implements IProvider {
    readonly type = "link-editor-script";
    readonly restorable = false;
    readonly sourceUrl: string;       // "link-editor-script://{pageId}/{scriptId}"
    
    private _writable = true;
    private vm: LinkViewModel;
    private scriptId: string;

    get writable() { return this._writable; }
    get displayName() { /* script name + extension */ }

    async readBinary(): Promise<Buffer> {
        const script = this.vm.getScriptById(this.scriptId);
        return Buffer.from(script?.code ?? "", "utf-8");
    }

    async writeBinary(data: Buffer): Promise<void> {
        if (!this._writable) throw new Error("Provider is read-only");
        this.vm.updateScriptCode(this.scriptId, data.toString("utf-8"));
    }

    /** Called by LinkViewModel.onDispose() to mark all open script pages as read-only. */
    markReadOnly() { this._writable = false; }

    toDescriptor(): IProviderDescriptor {
        return {
            type: "link-editor-script",
            config: { pageId: this.vm.pageModel.page?.id, scriptId: this.scriptId },
        };
    }
}
```

**Lifecycle:**
- LinkViewModel creates and tracks `LinkEditorScriptProvider` instances via `getOrCreateScriptProvider(scriptId)`
- When the LinkEditor page is open, providers are writable (script edits flow into LinkViewModel state -> debounced save to `.link.json`)
- When the LinkEditor page closes (`onDispose()`), all tracked providers are marked read-only
- If the user tries to save a read-only script page, the existing "Save As" dialog appears (standard behavior for read-only providers)
- Provider does NOT implement `watch()` — one-way data flow: Monaco → LinkViewModel only. Once a script is opened in Monaco, its content in Monaco does not update from LinkEditor changes. Saving from Monaco overwrites the script in LinkEditor regardless of its current state.

**Resolver registration:**
Register a new Layer 2 resolver that handles `link-editor-script://` URLs. After EPIC-023, all three link pipeline channels (`openRawLink`, `openLink`, `openContent`) carry `ILinkData` directly. The resolver subscribes to `openLink` (Layer 2) and enriches the same `ILinkData` object:

```typescript
// In resolvers.ts or a new link-editor-script-resolver.ts
app.events.openLink.subscribe(async (data) => {
    const url = data.url ?? data.href;
    if (!url.startsWith("link-editor-script://")) return;
    
    const [pageId, scriptId] = url.slice("link-editor-script://".length).split("/");
    const page = pagesModel.findPage(pageId);
    if (!page?.mainEditor) return;
    
    // TextFileModel implements IContentHost — acquireViewModelSync returns cached LinkViewModel
    const linkVm = (page.mainEditor as TextFileModel).acquireViewModelSync("link-editor") as LinkViewModel;
    if (!linkVm) return;
    
    const provider = linkVm.getOrCreateScriptProvider(scriptId);
    const script = linkVm.getScriptById(scriptId);
    const pipe = new ContentPipe(provider);
    
    // Enrich the same ILinkData object (EPIC-023 pattern)
    data.target = "monaco";
    data.title = script?.name;
    data.pipe = pipe;
    data.pipeDescriptor = pipe.toDescriptor();
    
    // Forward to Layer 3, then mark handled
    data.handled = false;
    await app.events.openContent.sendAsync(data);
    data.handled = true;
});
```

**Provider registry:**
Register a factory for descriptor restoration. Since `restorable: false`, this only serves as a fallback if a persisted pipe descriptor references this type (e.g., across restart). It returns a minimal stub:

```typescript
// In registry.ts
registerProvider("link-editor-script", (config) => {
    // Non-restorable — return a read-only stub that yields empty content.
    // No BufferProvider exists in codebase; use an inline object implementing IProvider.
    const sourceUrl = `link-editor-script://${config.pageId}/${config.scriptId}`;
    return {
        type: "link-editor-script",
        restorable: false,
        writable: false,
        sourceUrl,
        displayName: "Script (disconnected)",
        readBinary: async () => Buffer.alloc(0),
        writeBinary: async () => { throw new Error("Provider is read-only (disconnected)"); },
        toDescriptor: () => ({
            type: "link-editor-script",
            config: { pageId: config.pageId, scriptId: config.scriptId },
        }),
    } as IProvider;
});
```

### Scripts Panel UI

A new collapsible panel "Scripts" in the LinkEditor left sidebar, following the existing `CollapsiblePanelStack` pattern.

**Panel structure:**
- Header: "Scripts" with an "Add Script" (+) button
- Body: Tree view showing `category/subcategory/scriptName` hierarchy
- Each script item shows: name, event badge (small colored tag), enabled/disabled toggle
- Double-click a script item → opens it in Monaco via `link-editor-script://` URL
- Context menu on script item: Edit Details, Open in Editor, Enable/Disable, Delete

**Add/Edit Script dialog:**
A new dialog (similar to `EditLinkDialog`) with fields:
- Name (text input)
- Category (PathInput with autocomplete from existing script categories)
- Language (ComboSelect: JavaScript / TypeScript)
- Event (ComboSelect: "On Link Add/Update" / "Before Link Open")
- Hostname (text input, only visible when event = "Before Link Open")
- Enabled (checkbox)

**Panel integration:**
- Add `"scripts"` to the `ExpandedPanel` type: `"tags" | "categories" | "hostnames" | "scripts"`
- Scripts panel does NOT affect link filtering (unlike categories/tags/hostnames)
- Register as a secondary editor panel alongside the existing three

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-396 | Data model: add `LinkScriptItem` type and `scripts` field to `LinkEditorData` | Planned |
| US-397 | ScriptRunner: add `runWithScope()` for custom context variable injection | Planned |
| US-398 | LinkEditorScriptProvider: virtual IProvider reading/writing from LinkViewModel | Planned |
| US-399 | Resolver: handle `link-editor-script://` URL scheme | Planned |
| US-400 | Scripts panel UI: collapsible panel with tree view in LinkEditor | Planned |
| US-401 | Add/Edit Script dialog | Planned |
| US-402 | Script execution engine: event matching and execution in LinkViewModel | Planned |
| US-403 | Script types and facade for script API (`io.link-data.d.ts`, `link-editor.d.ts`) | Planned |

## Open Concerns (post-EPIC-023 review)

| # | Concern | Details |
|---|---------|---------|
| C9 | `openLink()` loses ILink data | Current `LinkViewModel.openLink()` (line 746) uses `createLinkData(url, { target })` — only preserves `href` and `target`, discards `title`, `category`, `tags`, `imgSrc`, etc. For `beforeLinkOpen` scripts to read link metadata, this must be changed to use `linkToLinkData(link)` when the input is a full ILink. EPIC-023 planned this change but the implementation only used `createLinkData`. **Fix in US-402.** |
| C10 | `BufferProvider` doesn't exist | EPIC-022 originally referenced `BufferProvider` for the disconnected registry stub, but no such class exists. Use an inline object implementing `IProvider` instead. Updated in doc. |
| C11 | `ILinkData.url` is optional | After EPIC-023, `ILinkData.url` is `string | undefined` (set by Layer 1 parsers). Resolver code must use `data.url ?? data.href` for null-safe access. Updated in doc. |

## Resolved Concerns

All concerns reviewed and decided on 2026-04-10:

| # | Concern | Decision |
|---|---------|----------|
| C1 | ScriptRunner scope injection approach | `ctx: Record<string, unknown>` on ScriptContext + dynamic prefix (Option A). Name: `ctx` (not `extraScope`). Generic, reusable for future contexts. |
| C2 | Script execution error handling | Show error notification via `app.notify()` and continue. Don't abort the operation. |
| C3 | Script execution order | Array order in `.link.json`. Each script should handle only its specific link and ignore others — user is responsible for avoiding overlap. |
| C4 | Scripts panel placement | 4th panel in CollapsiblePanelStack (last position). Does not affect link filtering. |
| C5 | Non-restorable provider on restart | Accept the limitation. Script pages are ephemeral editing windows. |
| C6 | Concurrent editing safety | One-way: provider does NOT implement `watch()`. Once opened in Monaco, content doesn't sync back from LinkEditor. Monaco save overwrites the script in LinkEditor regardless of LinkEditor state. |
| C7 | `page` variable in script context | Pass the actual page model — could be TextFileModel (standalone LinkEditor) or BrowserEditorModel (browser-integrated LinkEditor). |
| C8 | Dynamic prefix performance | Not a concern — scripts are small (1-2 pages of code). |

## Notes

### 2026-04-11 — Post-EPIC-023 review
- EPIC-023 (Unified ILinkData Pipeline) completed — all three link pipeline channels now carry `ILinkData` directly instead of separate event classes
- Updated resolver code example: subscriber parameter is `ILinkData` (not a wrapper event), use `data.url ?? data.href` for null-safe URL access, enrich the same ILinkData object instead of creating a new one, then forward to `openContent` with `handled` reset pattern
- Removed `BufferProvider` reference (doesn't exist) — replaced with inline `IProvider` stub for disconnected registry entry
- Discovered that `LinkViewModel.openLink()` only passes `href` + `target` to `createLinkData()`, losing ILink metadata (title, category, tags). Must fix in US-402 to use `linkToLinkData(link)` when input is a full ILink, so `beforeLinkOpen` scripts have access to all link fields
- `ILinkData.url` is optional (set by Layer 1 parsers) — all code referencing it needs null-safe access
- `ScriptContext` class (in `ScriptContext.ts`) needs a new `ctx?: Record<string, unknown>` property — architecture approach unchanged
- `ScriptRunnerBase.executeInternal()` SCRIPT_PREFIX injection approach confirmed viable — just append `var key=this.ctx.key,...` for each ctx entry
- Key files verified: `TextFileModel` (TextEditorModel.ts:45), `acquireViewModelSync` (IContentHost.ts:56), `ExpandedPanel` type (LinkViewModel.ts:21), `ContentPipe` constructor, `registerProvider` in registry.ts

### 2026-04-10
- Epic created based on user's architectural vision
- The `link-editor-script://` URL scheme + virtual provider approach mirrors how the codebase already handles virtual paths (e.g., `tree-category://`) in the content pipeline
- Script execution reuses `ScriptRunner` entirely — no new execution engine needed, just a new entry point with scope injection
- All 8 concerns reviewed and resolved — see "Resolved Concerns" table
- Key decision: scope injection property named `ctx` (not `extraScope`)
- Key decision: one-way data flow for script editing (Monaco → LinkViewModel, no watch)
- Key decision: `page` in script context is the actual page (TextFileModel or BrowserEditorModel)
- Future extension: more events (e.g., "on delete link", "on category change"), more filter parameters (e.g., tag-based filtering for onLinkAddOrUpdate)
