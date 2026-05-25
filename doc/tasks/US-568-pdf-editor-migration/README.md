# US-568 — PDF editor migration

> **EPIC-028 Phase C** · walkthrough 30 closure (umbrella note — PDF deferred for first-principles investigation) · **Status:** Investigation complete 2026-05-25, ready for implementation.
>
> **Risk profile:** Medium. PDF itself is the simplest no-host editor in the codebase — 168 LOC across two files, single-purpose viewer with a cached-binary lifecycle. But US-568 **also closes two cross-cutting US-559 blockers** discovered during investigation: (a) `PagesPersistenceModel.restorePage`'s legacy fallback wraps v4-native no-host editors in `LegacyEditorAdapter` (introduced by US-558's Browser migration — first instance of v4-native-but-adapter-wrapped); (b) `PagesLifecycleModel.wrapLegacyForPage` does the same on the open-file path. Without these two fixes, US-559 cannot delete `LegacyEditorAdapter` — it would have to retroactively migrate Browser's restore path AND every no-host editor's open-file path. **Scope:** 4 source files in `editors/pdf/` (split + rewrite) + `register-editors.ts` + 2 page-lifecycle/persistence files. Two new files (`PdfEditor.ts`, `index.tsx`); one rename (`PdfViewer.tsx` → `PdfView.tsx`); `index.ts` deletes (folded into `index.tsx`). The cross-cutting fixes are surgical — small additions in `restorePage` and `wrapLegacyForPage` that benefit every subsequent no-host migration (US-569 Image, US-571 Video, US-572–US-576) without further infrastructure touches.

## Goal

Migrate the PDF viewer from a legacy `EditorModel` constructed via the legacy `EditorModule` factories to a native v4 `EditorModel` subclass registered in the v4 `editorRegistry`. Preserve PDF's cache-file lifecycle byte-for-byte (`cacheFileCreated` flag + cleanup in `dispose`), the `localPdfPath` → `safe-file://` resolution chain, and the existing `<object data="app-asset://pdfjs/...">` viewer mount. Drop the legacy `EditorModule` indirection — PDF construction flows through `editorRegistry.createEditor("pdf-view")` (the canonical v4 path) for restore and the direct registry path (resolve → `module.newEditorModel`) for file-open.

**Additionally** (broader-than-PDF scope discovered during investigation): close the two infrastructure gaps that block US-559's `LegacyEditorAdapter` deletion. Add a generic v4-native no-host restore branch in `PagesPersistenceModel.restorePage` (PD-IMPL11) and an `instanceof V4EditorModel` early-return in `PagesLifecycleModel.wrapLegacyForPage` (PD-IMPL16). The fixes are list-based and per-editor opt-in respectively — Browser (US-558) gets retroactively included; PDF (this PR) is the second consumer; subsequent no-host migrations (US-569 onward) need only register themselves in the list to participate.

## Background

### Today's surface

`src/renderer/editors/pdf/` — 2-file folder:

| File | LOC | Role |
|------|-----|------|
| `PdfViewer.tsx` | 168 | Legacy `EditorModel` subclass + view component + EditorModule factory bundle |
| `index.ts` | 4 | Re-exports |

### Today's class shape (legacy base)

```typescript
interface PdfEditorModelState extends IEditorState {
    /** Local file path to serve via safe-file:// (cache file for non-local sources). */
    localPdfPath?: string;
}

const getDefaultPdfViewerModelState = (): PdfEditorModelState => ({
    ...getDefaultEditorModelState(),
    type: "pdfFile" as const,
});

class PdfEditorModel extends EditorModel<PdfEditorModelState, void> {
    noLanguage = true;
    private cacheFileCreated = false;

    private ensurePipe(): void {
        if (this.pipe) return;
        const filePath = this.state.get().filePath;
        if (!filePath) return;
        // archive (path!entry) split → FileProvider + ArchiveTransformer
        // or plain FileProvider
    }

    async restore() {
        await super.restore();
        const filePath = this.state.get().filePath;
        if (filePath) {
            this.state.update((s) => { s.title = fpBasename(filePath); });
        }
        this.ensurePipe();
        if (this.pipe) {
            if (this.pipe.provider.type === "file" && this.pipe.transformers.length === 0) {
                // Plain FileProvider — use source path directly (efficient streaming)
                this.state.update((s) => { s.localPdfPath = this.pipe!.provider.sourceUrl; });
            } else {
                // Non-local source (HTTP, archive, etc.) — read and cache as temp file
                const buffer = await this.pipe.readBinary();
                const cachePath = appFs.resolveCachePath(this.id + ".pdf");
                await appFs.writeBinary(cachePath, buffer);
                this.cacheFileCreated = true;
                this.state.update((s) => { s.localPdfPath = cachePath; });
            }
        }
    }

    async dispose(): Promise<void> {
        if (this.cacheFileCreated) {
            const cachePath = this.state.get().localPdfPath;
            if (cachePath) {
                try { await appFs.delete(cachePath); } catch { /* ignore */ }
            }
        }
        await super.dispose();
    }

    getIcon = () => <FileIcon path={this.state.get().filePath} width={12} height={12} />;
}
```

State (2 fields):

- **`state.filePath: string | undefined`** — inherited from `IEditorState`; the source path / URL / archive-path-with-bang notation (`archive.zip!path/to.pdf`).
- **`state.localPdfPath?: string`** — resolved local path for the `safe-file://` protocol. Either the source path (plain `FileProvider`) or a cache file path (non-local: HTTP / archive entry / etc.).
- **`state.type: "pdfFile"`** — discriminator (used by `PagesLifecycleModel.newEditorModelFromState` legacy route).

### Today's view component (`PdfViewer.tsx:106–133`)

```tsx
function PdfViewer({ model }: PdfViewerProps) {
    const localPdfPath = model.state.use((s) => s.localPdfPath);
    const v4Main = pagesModel.findPage(model.id)?.mainEditorV4 ?? null;

    const fileUrl = localPdfPath ? `safe-file://${localPdfPath.replace(/\\/g, "/")}` : "";
    const viewerUrl = fileUrl
        ? `app-asset://pdfjs/web/viewer.html?file=${encodeURIComponent(fileUrl)}`
        : "";

    return (
        <>
            {v4Main ? (
                <PageToolbar name="pdf-toolbar" model={v4Main} borderBottom />
            ) : (
                <EditorToolbar borderBottom />
            )}
            <Panel name="pdf-viewer-root" direction="column" flex={1} overflow="hidden">
                {viewerUrl && (
                    <object
                        data={viewerUrl}
                        style={{ width: "100%", height: "100%", border: "none" }}
                        type="text/html"
                    />
                )}
            </Panel>
        </>
    );
}
```

The `v4Main` lookup is a strangler-fig accommodation: when PDF is wrapped in `LegacyEditorAdapter` (today's restoration path), `mainEditorV4` returns the adapter (which `PageToolbar` can consume). Post-migration `model` IS the v4 PdfEditor — the lookup retires.

### Today's registration (`register-editors.ts:223–236`)

```typescript
editorRegistry.register({
    id: "pdf-view",
    name: "PDF Viewer",
    editorType: "pdfFile",
    category: "standalone",
    acceptFile: (fileName) => {
        if (matchesExtension(fileName, [".pdf"])) return 100;
        return -1;
    },
    loadModule: async () => {
        const module = await import("./pdf/PdfViewer");
        return module.default;
    },
});
```

Legacy registry only. PDF is NOT yet in the v4 `editorRegistry` — that registration gets added by US-568. The v4 bridge loop (`register-editors.ts:804–847`) does mirror the legacy entry into the v4 registry with a throwing `createEditor` stub (for standalone editors) — that gets replaced by the real v4 module in US-568.

### Today's construction sites

PDF is constructed via three paths:

1. **`PagesLifecycleModel.openFile(filePath)` → `createEditorFromFile` → `newEditorModel(filePath)`** — `editorRegistry.resolve(filePath)` resolves `.pdf` → `pdf-view` def → `module.newEditorModel(filePath)` returns a legacy `PdfEditorModel`. Wrapped in `LegacyEditorAdapter` by `wrap(editor)` at the call site.
2. **`PagesPersistenceModel.restorePage(desc)` legacy fallback** — `desc.editors.map(d => …)` falls past the `if (d.host)` branch (PDF has no host) and the Explorer branch to `newEditorModelFromState(legacyState)` → finds the `editorType === "pdfFile"` def → `module.newEditorModelFromState(state)` returns a legacy `PdfEditorModel`. Wrapped in `LegacyEditorAdapter(legacy, "pdf-view")`.
3. **MCP `create_page` rejection** — `mcp-handler.ts:159` returns an error for the `pdf-view` editor type with a hint to use `app.pages.openFile()`. Not a real construction path.

All three sites currently produce a `LegacyEditorAdapter`-wrapped PdfEditor. After US-568:

- Site 1 (`openFile`) — the legacy registry's `newEditorModel(filePath)` returns a **v4 PdfEditor instance** (cast as legacy). `wrap(editor)` now checks `legacy instanceof V4EditorModel` and returns the editor directly when true (PD-IMPL16). **No adapter wrap.** Same fix benefits Browser retroactively.
- Site 2 (`restorePage`) — **Generic v4-native no-host branch** (PD-IMPL11) catches every editorId in the `V4_NO_HOST_EDITOR_IDS` set: constructs v4 editor via `editorRegistry.createEditor(id, d.id)` → seeds state from `d.state` → `applyRestoreData(d.state)` → `restore()`. **No adapter wrap.** Browser (`browser-view`) and PDF (`pdf-view`) populate the set in this PR; US-569+ each add one line.
- Site 3 (MCP) — unchanged.

### Why this scope expanded mid-investigation

The walkthrough 30 closure deferred PDF for first-principles investigation. During that investigation:

1. **Adapter-wrap-on-restore discovered to be a structural US-559 blocker.** US-558 (Browser) leaned on the legacy fallback in `restorePage`, producing a v4-native BrowserEditor wrapped in `LegacyEditorAdapter` on every restored page. Without a direct branch, US-559 can't delete `LegacyEditorAdapter` — Browser's restore path would break. Same blocker would apply to every subsequent no-host migration if left unaddressed.
2. **Open-file path has the same problem.** `wrapLegacyForPage` was designed for legacy editors needing adapter wrap; its text-bearing branches construct fresh v4 editors with `adoptHost`. The default `return new LegacyEditorAdapter(...)` at line 272 catches non-text editors — including v4-native PDF/Browser whose legacy module factories return v4 instances cast as legacy.

Both fixes are small (one branch each, ~15 lines combined) and pay down US-559's prep work. Scoping them into US-568 means: each future no-host migration (US-569 Image, US-571 Video, US-572–US-576) only touches its own editor folder + `register-editors.ts` + adds one line to `V4_NO_HOST_EDITOR_IDS`. The infrastructure is done.

### Walkthrough 30 closure umbrella note (2026-05-20)

The walkthrough 30 closure table (`30-no-host-group.md:1232–1247`) defers PDF for first-principles investigation:

> **PDF** — Same shape as Browser — no-host EditorModel; opens `.pdf` files via `accepts()` predicate.

Each first-principles investigation either confirms the editor's concerns mirror the standardized NH/EX set (no new walkthrough doc) or surfaces novel concerns logged in this task doc. PDF resolves entirely against the standardized NH set with PD-IMPL retrospective additions for the specifics.

### Implementation-time context (post-walkthrough)

- **US-548 (PageModel adapter layer) landed**: `page.attach(editor)`, slice-subscription lifecycle, `restorePage` skeleton with v4-with-host + Explorer branches + legacy fallback all in place.
- **US-555 (Link editor migration) landed**: First v4-native sidebar-OWNING editor pattern; not relevant to PDF.
- **US-558 (Browser editor migration) landed**: First v4-native NO-HOST page-mainEditor pattern — PDF is the closest sibling and follows the same shape. Browser's `BrowserEditor.ts` / `BrowserView.tsx` / `index.tsx` / `BrowserEditorModel.ts` file split is the reference template.
- **US-567 (Explorer editor migration) landed**: Established the precedent of adding a v4-native restore branch in `PagesPersistenceModel.restorePage` for editors NOT routed through `editorRegistry.createEditor`. PDF differs from Explorer (PDF IS in `editorRegistry`) but the direct-branch pattern still applies to skip the `LegacyEditorAdapter` wrap.
- **`deriveEditorId({ type: "pdfFile" })` returns `"pdf-view"`** — confirmed by reading `LegacyEditorAdapter.ts:339–348`: the legacy registry has `editorType: "pdfFile"` → id `"pdf-view"`, so pre-US-568 saved descriptors have `editorId: "pdf-view"` already. The new save format and old save format produce the same `editorId`.

### What does NOT exist in PDF today

PDF lacks all of the following Tier-5 capabilities:

- **No sub-models** — single class.
- **No embedded editors** — PDF is a leaf.
- **No `secondaryEditor` contributions** — PDF doesn't add panels.
- **No `beforeNavigateAway` / `onMainEditorChanged` overrides** — PDF is just a viewer.
- **No scripting facade** (`page.asPdf()` doesn't exist; PDF stays third-party-data, not script-manipulable).
- **No `CONTENT_HOST_TRAIT`** — no-host editor (NH2 / B2 default).
- **No HS1 host slot** — no `IContentHost` to ride on. Per-window UI state (today's `localPdfPath`) is a derived-from-file-path field stored on `state` directly. No per-screen UX state worth persisting separately.
- **No queue events worth typing** — base `ComponentQueueEvent` default suffices (PD-IMPL3).
- **No automation hooks** — Browser's `instanceof BrowserEditor` checks in `automation/commands.ts` don't have a PDF analogue.
- **No tree provider** — PDF isn't in the EX8 typed-`instanceof` chain.

The migration is **lifecycle-only**: rewire construction + restoration to flow through the v4 native class, preserving everything else byte-for-byte.

---

## Implementation plan

### Step 1 — Create `PdfEditor.ts` (v4 native class)

**File:** `src/renderer/editors/pdf/PdfEditor.ts` (NEW, ~180 LOC).

Contents:

```typescript
import { ReactNode } from "react";
import { TComponentState } from "../../core/state/state";
import {
    EditorModel as V4EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/v4/EditorModel";
import type { EditorDescriptor } from "../../../shared/persistence-v4";
import { FileIcon } from "../../components/icons/FileIcon";
import { fpBasename } from "../../core/utils/file-path";
import { fs as appFs } from "../../api/fs";
import { ContentPipe } from "../../content/ContentPipe";
import { FileProvider } from "../../content/providers/FileProvider";
import { ArchiveTransformer } from "../../content/transformers/ArchiveTransformer";

/**
 * EPIC-028 / US-568 — native v4 PDF editor. NO-HOST editor (no
 * `CONTENT_HOST_TRAIT`) — PDF owns its state directly and reads binary
 * content through its own `pipe` field rather than wrapping a `TextFileModel`.
 *
 * Closest sibling: BrowserEditor (US-558) — same no-host page-mainEditor
 * shape. Differences from Browser:
 *   - File-accepting (`accepts({ fileName }) → 100` for `.pdf`) vs Browser's
 *     `() => -1`.
 *   - Lifecycle is dominated by the cache-file flow for non-local PDFs
 *     (HTTP / archive entry / etc.) — `cacheFileCreated` private flag
 *     gates the `dispose()` cleanup.
 *
 * Design rationale: doc/tasks/US-568-pdf-editor-migration/README.md.
 */

export interface PdfEditorState extends EditorStateBase {
    /** Discriminator — preserved for legacy `newEditorModelFromState` routing
     *  and `EditorDescriptor.state.type` consumers. */
    type: "pdfFile";
    /** Source path / URL / archive-with-bang notation (`archive.zip!path/to.pdf`). */
    filePath?: string;
    /** Local file path to serve via safe-file://. Either the source path
     *  (plain FileProvider) or a temp cache file (non-local sources). */
    localPdfPath?: string;
}

export const defaultPdfEditorState: PdfEditorState = {
    id: "", // assigned at construct time
    title: "",
    modified: false,
    type: "pdfFile",
};

export function getDefaultPdfEditorState(): PdfEditorState {
    return {
        ...defaultPdfEditorState,
        id: crypto.randomUUID(),
    };
}

export class PdfEditor extends V4EditorModel<PdfEditorState> {
    /** v4 editor identity. Matches the legacy registry id so v4
     *  `EditorDescriptor.editorId` and pre-US-568 saved descriptors
     *  (`deriveEditorId({ type: "pdfFile" }) === "pdf-view"`) agree. */
    readonly editorId = "pdf-view";

    noLanguage = true;

    /** Tracks whether `restore()` created a temp cache file for the PDF
     *  (true only for non-local sources). Gates the `dispose()` cleanup. */
    private cacheFileCreated = false;

    constructor(state: TComponentState<PdfEditorState>) {
        super(state);
    }

    /** Reconstruct pipe from filePath if not already present. Legacy compat
     *  for restore paths that don't carry a live pipe. */
    private ensurePipe(): void {
        if (this.pipe) return;
        const filePath = this.state.get().filePath;
        if (!filePath) return;

        const bangIndex = filePath.indexOf("!");
        if (bangIndex >= 0) {
            const archivePath = filePath.slice(0, bangIndex);
            const entryPath = filePath.slice(bangIndex + 1);
            this.pipe = new ContentPipe(
                new FileProvider(archivePath),
                [new ArchiveTransformer(archivePath, entryPath)],
            );
        } else {
            this.pipe = new ContentPipe(new FileProvider(filePath));
        }
    }

    async restore(): Promise<void> {
        await super.restore();

        const filePath = this.state.get().filePath;
        if (filePath) {
            this.state.update((s) => {
                s.title = fpBasename(filePath);
            });
        }

        // Determine local path for safe-file:// protocol.
        this.ensurePipe();
        if (this.pipe) {
            if (
                this.pipe.provider.type === "file"
                && this.pipe.transformers.length === 0
            ) {
                // Plain FileProvider — use source path directly (efficient streaming).
                this.state.update((s) => {
                    s.localPdfPath = this.pipe!.provider.sourceUrl;
                });
            } else {
                // Non-local source (HTTP, archive, etc.) — read and cache as temp file.
                try {
                    const buffer = await this.pipe.readBinary();
                    const cachePath = appFs.resolveCachePath(this.id + ".pdf");
                    await appFs.writeBinary(cachePath, buffer);
                    this.cacheFileCreated = true;
                    this.state.update((s) => {
                        s.localPdfPath = cachePath;
                    });
                } catch {
                    // Pipe read failed — localPdfPath stays undefined; the view
                    // renders a blank panel rather than crashing.
                }
            }
        }
    }

    applyRestoreData(data: RestoreData<PdfEditorState>): void {
        super.applyRestoreData(data);
        // Apply filePath from descriptor; localPdfPath gets recomputed inside
        // restore() (either as the plain source path or via the cache-file
        // read path), so we don't carry it across saves. PD-IMPL8.
        if (data.filePath) {
            this.state.update((s) => { s.filePath = data.filePath; });
        }
    }

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                ...s,
                // localPdfPath stripped from descriptor — recomputed on restore.
                // Mirrors today's behavior: persisting a temp cache-file path
                // would break across restarts (the cache path includes the
                // editor id, which is reused, but the file may have been GC'd).
                localPdfPath: undefined,
            } as unknown as Record<string, unknown>,
        };
    }

    async dispose(): Promise<void> {
        // Clean up cache file for non-local sources.
        if (this.cacheFileCreated) {
            const cachePath = this.state.get().localPdfPath;
            if (cachePath) {
                try { await appFs.delete(cachePath); } catch { /* ignore */ }
            }
        }
        await super.dispose();
    }

    getIcon = (): ReactNode => {
        return (
            <FileIcon
                path={this.state.get().filePath}
                width={12}
                height={12}
            />
        );
    };
}
```

**Note on `editorId`:** PDF deliberately matches the legacy registry id (`"pdf-view"`). Pre-US-568 saved PDF descriptors carry `editorId: "pdf-view"` because `deriveEditorId({ type: "pdfFile" })` returns `"pdf-view"` via the legacy registry's `editorType: "pdfFile"` lookup (`LegacyEditorAdapter.ts:343–345`). Post-migration descriptors carry the same id. **No restore migration shim needed.**

### Step 2 — Rename `PdfViewer.tsx` → `PdfView.tsx` and reduce to a view-only component

**File:** `src/renderer/editors/pdf/PdfViewer.tsx` → `src/renderer/editors/pdf/PdfView.tsx`

Strip the legacy class + state interface + module factories. Keep only the React view + the legacy `EditorModule` export (which now constructs v4 `PdfEditor` for the LegacyEditorAdapter safety-net path, mirroring `BrowserView.tsx`).

Final contents:

```tsx
import { IEditorState, EditorType } from "../../../shared/types";
import type { EditorModel } from "../base";
import { EditorModule } from "../types";
import { PageToolbar } from "../base/v4";
import { Panel } from "../../uikit/Panel";
import { TComponentState } from "../../core/state/state";
import { PdfEditor, getDefaultPdfEditorState, type PdfEditorState } from "./PdfEditor";

interface PdfViewProps {
    model: PdfEditor;
}

export function PdfView({ model }: PdfViewProps) {
    const localPdfPath = model.state.use((s) => s.localPdfPath);

    const fileUrl = localPdfPath
        ? `safe-file://${localPdfPath.replace(/\\/g, "/")}`
        : "";
    const viewerUrl = fileUrl
        ? `app-asset://pdfjs/web/viewer.html?file=${encodeURIComponent(fileUrl)}`
        : "";

    return (
        <>
            <PageToolbar name="pdf-toolbar" model={model} borderBottom />
            <Panel name="pdf-viewer-root" direction="column" flex={1} overflow="hidden">
                {viewerUrl && (
                    <object
                        data={viewerUrl}
                        style={{ width: "100%", height: "100%", border: "none" }}
                        type="text/html"
                    />
                )}
            </Panel>
        </>
    );
}

// ============================================================================
// EditorModule
// ============================================================================
// EPIC-028 / US-568 — legacy EditorModule shape preserved for the
// LegacyEditorAdapter safety-net path used by `PagesLifecycleModel.openFile`
// (file-open flow) and the legacy fallback inside `restorePage` (US-559
// retires the legacy registry path entirely). The `as unknown as EditorModel`
// casts bridge the v4 PdfEditor class to the legacy EditorModel typing the
// legacy module factories expect; the runtime instance is the v4 class either
// way. Mirrors the US-558 Browser pattern at `browser/BrowserView.tsx:716`.

const pdfEditorModule: EditorModule = {
    Editor: PdfView as unknown as EditorModule["Editor"],
    newEditorModel: async (filePath?: string) => {
        const state: PdfEditorState = {
            ...getDefaultPdfEditorState(),
            ...(filePath ? { filePath } : {}),
        };
        return new PdfEditor(new TComponentState(state)) as unknown as EditorModel;
    },
    newEmptyEditorModel: async (
        editorType: EditorType,
    ): Promise<EditorModel | null> => {
        if (editorType !== "pdfFile") return null;
        return new PdfEditor(
            new TComponentState(getDefaultPdfEditorState()),
        ) as unknown as EditorModel;
    },
    newEditorModelFromState: async (
        state: Partial<IEditorState>,
    ): Promise<EditorModel> => {
        const initialState: PdfEditorState = {
            ...getDefaultPdfEditorState(),
            ...(state as Partial<PdfEditorState>),
        };
        return new PdfEditor(new TComponentState(initialState)) as unknown as EditorModel;
    },
};

export default pdfEditorModule;
export { PdfEditor };
export type { PdfViewProps, PdfEditorState };
```

The `mainEditorV4` lookup retires (PD-IMPL10): post-migration `model` is the v4 PdfEditor directly, so `<PageToolbar model={model} … />` works without the conditional `v4Main ?? EditorToolbar` fallback.

### Step 3 — Create `index.tsx` (v4 EditorModule + re-exports)

**File:** `src/renderer/editors/pdf/index.tsx` (NEW, ~30 LOC). Deletes the old `index.ts` (folded into the new `index.tsx`).

```tsx
import { TComponentState } from "../../core/state/state";
import { PdfEditor, getDefaultPdfEditorState } from "./PdfEditor";
import { PdfView } from "./PdfView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-568 — native PDF editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native PdfEditor instance.
 *
 * PDF is NO-HOST (no `CONTENT_HOST_TRAIT`) — `Component` is the full PDF
 * viewer (toolbar + pdf.js `<object>` mount). No `<TextChrome>` wrap
 * (text-bearing chrome is irrelevant).
 */

function PdfEditorComponent({ model }: { model: V4EditorModel }) {
    return <PdfView model={model as PdfEditor} />;
}

export const pdfModule: EditorModule = {
    createEditor: () =>
        new PdfEditor(new TComponentState(getDefaultPdfEditorState())),
    Component: PdfEditorComponent,
};

export { PdfEditor, getDefaultPdfEditorState };
export type { PdfEditorState } from "./PdfEditor";
// Compatibility alias — retire under US-559 cleanup. Keeps the
// `PdfEditorModel` / `PdfEditorModelState` names usable from legacy callsites
// that haven't been updated yet (none found at investigation time, but kept
// defensively for symmetry with US-567 Explorer migration's alias).
export { PdfEditor as PdfEditorModel } from "./PdfEditor";
export type { PdfEditorState as PdfEditorModelState } from "./PdfEditor";
// Legacy EditorModule default-export — consumed by the legacy `editorRegistry`
// `loadModule` callback (file-open + LegacyEditorAdapter safety-net path).
export { default as pdfEditorModule } from "./PdfView";
```

### Step 4 — Update `register-editors.ts` — replace legacy block + add v4 block

**File:** `src/renderer/editors/register-editors.ts`

**Edit 1 (legacy registration, line 222–236):** Change the `loadModule` callback to load from `./pdf/PdfView` (renamed file path) instead of `./pdf/PdfViewer`.

```typescript
// PDF viewer (standalone page editor)
editorRegistry.register({
    id: "pdf-view",
    name: "PDF Viewer",
    editorType: "pdfFile",
    category: "standalone",
    acceptFile: (fileName) => {
        if (matchesExtension(fileName, [".pdf"])) return 100;
        return -1;
    },
    loadModule: async () => {
        // EPIC-028 / US-568 — PDF migrated to native v4 module
        // (`pdfModule` in `./pdf/index.tsx`). Legacy `pdfEditorModule` is
        // PRESERVED in `PdfView.tsx` for the LegacyEditorAdapter safety-net
        // path; the file-open flow (`PagesLifecycleModel.openFile`) takes
        // this legacy path, which constructs v4 PdfEditor cast as legacy.
        const module = await import("./pdf/PdfView");
        return module.default;
    },
});
```

**Edit 2 (add v4 registration at the bottom of the v4 block):** After the Browser v4 registration (line ~1278), add:

```typescript
// US-568 — replace the legacy bare-adapter mirror for pdf-view with a native
// v4 module. PDF is NO-HOST (no `CONTENT_HOST_TRAIT`); the `accepts`
// predicate returns 100 for `.pdf` files so `editorRegistry.resolveForFile`
// routes pdf opens through the v4 createEditor when callers migrate to v4
// file-open. Today's `PagesLifecycleModel.openFile` still uses the LEGACY
// registry's `resolve` + `module.newEditorModel(filePath)` (which now returns
// a v4 PdfEditor cast as legacy via `PdfView.tsx`'s preserved module);
// US-559 wires file-open to v4 directly.
v4EditorRegistry.register({
    id: "pdf-view",
    name: "PDF Viewer",
    hasContentHost: false,
    accepts: (input) => {
        const legacy = editorRegistry.getById("pdf-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
    loadModule: async () => {
        const { pdfModule } = await import("./pdf");
        return pdfModule;
    },
});
```

The `accepts` delegates to the legacy registry's `acceptFile` (`.pdf` → 100) for forward compatibility with v4 file-open. `hasContentHost: false` ensures PDF is hidden from the switch widget (matches Browser).

### Step 5 — Add a generic v4-native no-host restore branch in `PagesPersistenceModel.restorePage`

**File:** `src/renderer/api/pages/PagesPersistenceModel.ts:91–143`

This step closes the **first US-559 blocker**: editorIds registered with a real v4 module but lacking a `host` field today fall through to the legacy fallback, producing `LegacyEditorAdapter` wraps of v4-native editors. Browser (US-558) is the existing victim; PDF would be the second. Solution: add one branch that catches all current and future v4-native no-host editors via a shared `Set`.

**Add a module-private set at the top of the file** (after imports, before the class):

```typescript
/**
 * EPIC-028 / US-568 / PD-IMPL11 — editorIds of v4-native NO-HOST editors that
 * restore via the canonical `editorRegistry.createEditor` path (rather than
 * the legacy fallback that wraps in `LegacyEditorAdapter`). v4-with-host
 * editors go through the `if (d.host)` branch and don't need to be listed.
 * Explorer has its own explicit branch above (not in `editorRegistry`).
 *
 * Append to this set as each no-host migration (US-569 Image, US-571 Video,
 * US-572 Settings, US-573 About, US-574 MCP Inspector, US-575 Storybook,
 * US-576 Category) lands. US-559 deletes the legacy fallback entirely and
 * folds this set into the generic restore path.
 */
const V4_NO_HOST_EDITOR_IDS = new Set([
    "browser-view", // US-558 (retroactive — see PD-IMPL11)
    "pdf-view",     // US-568 (this PR)
]);
```

**Add the generic branch inside the `restorePage` `Promise.all` map** (after the Explorer branch at line 113, before the legacy fallback at line 127):

```typescript
// EPIC-028 / US-568 / PD-IMPL11 — generic v4-native no-host restore branch.
// Closes US-558's adapter-wrap-on-restore blocker for Browser AND establishes
// the path every subsequent no-host migration (US-569+) uses by registering
// in `V4_NO_HOST_EDITOR_IDS`. v4-with-host editors took the `if (d.host)`
// branch above; this branch handles only no-host v4-native editors. Editors
// not in the set fall through to the legacy fallback (truly-legacy editors
// like Archive, Image pre-US-569, Video pre-US-571, etc.).
if (V4_NO_HOST_EDITOR_IDS.has(d.editorId)) {
    const { editorRegistry: v4Registry } = await import(
        "../../editors/base/v4"
    );
    const editor = await v4Registry.createEditor(d.editorId, d.id);
    // Seed editor state from the descriptor before applyRestoreData (mirrors
    // Explorer pattern at line 117 — the constructor-default + descriptor-spread
    // approach). For no-host editors, the persisted state lives entirely in
    // `d.state` (no host descriptor to absorb fields).
    editor.state.update((s) => {
        Object.assign(s, d.state);
        (s as { id: string }).id = d.id;
    });
    editor.applyRestoreData(
        d.state as unknown as Parameters<typeof editor.applyRestoreData>[0],
    );
    await editor.restore();
    return editor;
}
```

**Note on placement:** This branch goes AFTER the `if (d.host)` branch (v4-with-host) and AFTER the Explorer branch (secondary-only, not-in-editorRegistry). It goes BEFORE the legacy fallback so v4-native no-host editors take the v4 path even when the descriptor has no `host` field. Editor descriptors whose `editorId` is NOT in the set (truly-legacy editors with pending migrations) fall through to the legacy fallback as before — backward-compat preserved.

**Why a `Set` instead of per-editor `if` branches:** PD-IMPL11 originally proposed a PDF-specific branch (mirroring Explorer US-567). Switched to set-based after recognizing US-558's Browser would need an equivalent branch AND each future no-host migration would add one too — six to eight branches by US-559 time. The `Set` localizes the list to one place; each migration adds one line.

**Backward compat for descriptors carrying `state.type` instead of `editorId`:** Not needed for PDF/Browser — both write `editorId` via `LegacyEditorAdapter.editorId` getter (`deriveEditorId({ type })` returns the right id from the legacy registry mapping). If a future no-host editor has an editorId discriminator that drifted, the set entry handles it directly via id matching.

### Step 6 — Add `instanceof V4EditorModel` early-return in `PagesLifecycleModel.wrapLegacyForPage`

**File:** `src/renderer/api/pages/PagesLifecycleModel.ts:1–4, 66–273`

This step closes the **second US-559 blocker**: `wrapLegacyForPage` is the open-file/navigate path. Its text-bearing branches construct fresh v4 editors with `adoptHost(legacy)`. The default fall-through at line 272 (`return new LegacyEditorAdapter(legacy, targetEditorId)`) catches non-text editors — including v4-native PDF/Browser whose legacy module factories return v4 instances cast as legacy. Add an early-return at the top of the function that detects v4-native editors via `instanceof` and returns them directly.

**Edit 1 — Convert the type-only import to a value import** (line 2):

```typescript
// Before
import type { EditorModel as V4EditorModel } from "../../editors/base/v4";

// After (drop `type` modifier — needed for runtime `instanceof` check)
import { EditorModel as V4EditorModel } from "../../editors/base/v4";
```

**Edit 2 — Add the early-return at the top of `wrapLegacyForPage`** (insert at line 67, before `const targetEditorId = deriveEditorId(...)`):

```typescript
export function wrapLegacyForPage(legacy: LegacyEditorModel): V4EditorModel {
    // EPIC-028 / US-568 / PD-IMPL16 — if the "legacy" module factory returned
    // a v4-native editor (post-migration standalone editors use `as unknown
    // as EditorModel` casts in their preserved EditorModule shims —
    // `BrowserView.tsx:719`, `PdfView.tsx`, future Image/Video/etc.), return
    // it directly without adapter wrap. `createEditorFromFile` already called
    // `editor.restore()` before this function — v4 editors expose the same
    // surface as legacy editors for that call. Closes the open-file gap so
    // US-559 can delete `LegacyEditorAdapter` cleanly.
    if (legacy instanceof V4EditorModel) {
        return legacy as unknown as V4EditorModel;
    }

    const targetEditorId = deriveEditorId(legacy.state.get());
    // ... existing text-bearing branches unchanged
    // ... final `return new LegacyEditorAdapter(legacy, targetEditorId);` survives
    //     only for truly-legacy editors (Archive, Image, Video, Settings,
    //     About, MCP Inspector, Storybook, Category) until each migrates.
}
```

**Note on safety:** The text-bearing branches (Monaco, Grid, MD, SVG, HTML, Mermaid, Graph, Draw, Link, Todo, RC, Notebook) all receive a real legacy `TextFileModel` from the `textEditorModule.newEditorModel` path. `TextFileModel extends EditorModel` (legacy), NOT `V4EditorModel` — so `instanceof V4EditorModel` is FALSE for them; the existing `adoptHost` branches fire as before. Only non-text editors with v4-native module factories (Browser today, PDF/Image/Video/etc. as they migrate) trigger the early-return.

**No need to dispose the wrapped legacy** in the early-return — there's nothing to dispose; the "legacy" IS the v4 editor.

### Step 7 — Update `PagesLifecycleModel.newEditorModelFromState` PDF path verification

**File:** `src/renderer/api/pages/PagesLifecycleModel.ts:326–353`

`newEditorModelFromState` is consumed by:
1. `PagesPersistenceModel.restorePage` legacy fallback (PDF no longer hits this — Step 5's generic v4-native branch catches PDF via `V4_NO_HOST_EDITOR_IDS`).
2. `PagesPersistenceModel.restoreSidebarLegacy` (Explorer-only; PDF never reaches here).

Post-migration, the PDF branch at line ~344 (`editorDef.editorType === "pdfFile"`) calls `module.newEditorModelFromState(state)` which now returns a **v4 PdfEditor cast as legacy** (via the preserved `pdfEditorModule` in `PdfView.tsx`). The path is exercised only by `openFile`/`navigatePageTo` (open-file flow). On that path, Step 6's `wrapLegacyForPage` `instanceof V4EditorModel` early-return detects the v4 editor and skips the adapter wrap.

**No source change needed** in `newEditorModelFromState` itself. This step is verification only.

### Step 8 — Update `index.ts` → delete (folded into new `index.tsx`)

**File:** `src/renderer/editors/pdf/index.ts` (DELETE)

The new `index.tsx` (Step 3) absorbs all exports. TypeScript resolves `import "./pdf"` to `./pdf/index.tsx` automatically.

The old `index.ts`:

```typescript
// DELETED
export { default as pdfEditorModule } from './PdfViewer';
export { PdfViewer, PdfEditorModel } from './PdfViewer';
export type { PdfViewerProps, PdfEditorModelState } from './PdfViewer';
```

The new `index.tsx` re-exports the equivalent (`pdfEditorModule` from `PdfView`, `PdfEditor` + `PdfEditorModel` alias from `PdfEditor`, `PdfEditorState` + `PdfEditorModelState` alias). The `PdfViewer` named export retires — no consumer grep'd at investigation time (the legacy class was only consumed inside the same folder).

### Step 9 — Verify no external consumers of `PdfEditorModel` class name

**Grep for external consumers of the renamed class:**

- `PdfEditorModel` — only consumed inside `editors/pdf/` (PdfViewer.tsx + index.ts) at investigation time. **Confirmed by grep.**
- `PdfViewer` named export — no external consumers.
- `getDefaultPdfViewerModelState` function — no external consumers (private to PdfViewer.tsx).

If a consumer surfaces during implementation, the compatibility alias (`PdfEditor as PdfEditorModel`) in `index.tsx` covers stale TypeScript imports.

### Step 10 — Dashboard update

**File:** `doc/active-work.md`

Move US-568 entry to the linked form with the broadened-scope note (already applied during investigation — verify the current entry matches the broadened text and adjust if needed).

---

## Concerns (PD-IMPL retrospective — added 2026-05-25 during investigation)

### PD-IMPL1 — Class shape: `PdfEditor extends V4EditorModel<PdfEditorState>` (two generics, base defaults for R + E)

PDF has no queue events (no chrome-level focus restoration; no view bridge — the `<object>` mount is fire-and-forget). The third generic on v4 `EditorModel<S, R, E>` defaults to `ComponentQueueEvent`. Use the bare two-generic form.

```typescript
export class PdfEditor extends V4EditorModel<PdfEditorState> {
    // R = unknown (default); E = ComponentQueueEvent (default).
}
```

Matches Explorer (US-567 EX-IMPL3) "no third generic" pattern. Future feature additions (e.g., scriptable page-jump) can add a typed event then.

### PD-IMPL2 — `editorId = "pdf-view"` — deliberate alignment with legacy registry id

The legacy registry has `id: "pdf-view"` + `editorType: "pdfFile"`. `deriveEditorId({ type: "pdfFile" })` returns `"pdf-view"` via the registry lookup. **Pre-US-568 saves already have `editorId: "pdf-view"`** (the LegacyEditorAdapter wraps with that id), so the migration is descriptor-shape-stable. **No restore migration shim needed.**

Add a one-line comment on the `editorId` declaration:

```typescript
/** v4 editor identity. Matches the legacy registry id so v4
 *  EditorDescriptor.editorId and pre-US-568 saved descriptors
 *  (deriveEditorId({type:"pdfFile"}) === "pdf-view") agree. */
readonly editorId = "pdf-view";
```

### PD-IMPL3 — State shape: keep minimal (3 fields including discriminator)

```typescript
export interface PdfEditorState extends EditorStateBase {
    type: "pdfFile";        // discriminator (preserved per S10 carve-out)
    filePath?: string;      // inherited shape today via IEditorState — promoted
                            //   to typed field on PdfEditorState
    localPdfPath?: string;  // resolved local path (cache file OR source path)
}
```

The `type` discriminator stays on the state (mirrors Explorer's `type: "fileExplorer"`). It's consumed by:
- `findExplorer`-equivalent lookups (none exist for PDF, but defensive).
- The legacy `editorRegistry.getAll().find((e) => e.editorType === state.type)` route in `newEditorModelFromState` (Step 6 verification).
- Step 5's restore-branch `(d.state as { type?: string }).type === "pdfFile"` fallback match.

### PD-IMPL4 — Cache file management via private `cacheFileCreated` flag — preserved verbatim

The pattern is:

1. **`restore()`**: if pipe is non-local (HTTP / archive entry / etc.), read binary → write to temp cache file → set `cacheFileCreated = true` → store cache path in `state.localPdfPath`.
2. **`dispose()`**: if `cacheFileCreated`, delete the file at `state.localPdfPath`.

Carries verbatim from today's `PdfEditorModel`. The cache path includes `this.id` (e.g., `<uuid>.pdf`), which survives editor restarts because the editor id is preserved across saves (the v4 base writes id into `EditorDescriptor.id`, and Step 5's restore branch passes `d.id` to `v4Registry.createEditor("pdf-view", d.id)`).

### PD-IMPL5 — `pipe` field on the v4 base — keep `ensurePipe()` pattern

The v4 base `EditorModel.pipe: IContentPipe | null = null` is a legacy-compat field kept for the strangler period. PDF's `ensurePipe()` reconstructs the pipe from `state.filePath` lazily, supporting:

- **Open-file flow** — `PagesLifecycleModel.createEditorFromFile` assigns `editor.pipe = pipe` before `restore()`, so `ensurePipe()` is a no-op.
- **Restore flow** — `restore()` calls `ensurePipe()` because the descriptor doesn't carry a live pipe object.

Per the v4 base comment ("Host-owned in v4; … Once Monaco migrates (US-551), the pipe lives on TextFileModel"), the base `pipe` field will eventually be retired for text editors. PDF being no-host (no `TextFileModel`), the pipe stays on the editor itself. **No retirement plan for PDF's `pipe` usage** — it's the load-path source of truth.

### PD-IMPL6 — `getRestoreData()` strips `localPdfPath`

Today's legacy `getRestoreData()` is inherited from the legacy base `EditorModel` (returns `Partial<S>` via the legacy contract). The v4 override returns `EditorDescriptor` per Browser's pattern.

**Key decision:** `localPdfPath` is **stripped** from the descriptor. Reasons:

1. For plain `FileProvider` PDFs, `localPdfPath === filePath` — redundant to persist both.
2. For non-local PDFs, `localPdfPath` is a temp cache file path. Persisting it would be wrong: cache files can be GC'd; the cache path includes the editor id (which IS stable across saves), but the file's existence isn't guaranteed.
3. `restore()` recomputes `localPdfPath` from the pipe either way.

Today's behavior matches: the legacy `restore()` recomputes `localPdfPath` on every load, so persisting it adds no information. The v4 override makes this explicit.

```typescript
getRestoreData(): EditorDescriptor {
    const s = this.state.get();
    return {
        editorId: this.editorId,
        id: s.id,
        state: {
            ...s,
            localPdfPath: undefined,  // recomputed on restore
        } as unknown as Record<string, unknown>,
    };
}
```

### PD-IMPL7 — `applyRestoreData()` — minimal (filePath only)

```typescript
applyRestoreData(data: RestoreData<PdfEditorState>): void {
    super.applyRestoreData(data);
    if (data.filePath) {
        this.state.update((s) => { s.filePath = data.filePath; });
    }
}
```

`filePath` is the only meaningful incoming field. `localPdfPath` is stripped from `getRestoreData` (PD-IMPL6), so it's never in `data`. `title` is recomputed in `restore()` from `fpBasename(filePath)`. `type`, `id`, `modified` come through `super.applyRestoreData(data)` and the default-state spread in Step 5's restore branch.

### PD-IMPL8 — File split — three files (PdfEditor.ts + PdfView.tsx + index.tsx)

Mirror the Browser split (US-558 BR-IMPL26 rename `BrowserEditorView.tsx` → `BrowserView.tsx`):

- **`PdfEditor.ts`** — v4 class + state interface + defaults (~180 LOC). Self-contained model.
- **`PdfView.tsx`** — React view + legacy `EditorModule` factory (preserves the LegacyEditorAdapter safety-net path; constructs v4 PdfEditor cast as legacy, matching `BrowserView.tsx:716`).
- **`index.tsx`** — v4 EditorModule (`pdfModule`) + re-exports + compatibility aliases (~30 LOC).
- **`index.ts`** — DELETED. Folded into `index.tsx`.

Why three files instead of two:
- Mixing the v4 class + the legacy module in `PdfView.tsx` would create a circular import (the legacy module factory needs to import `PdfEditor`, and `PdfEditor` may import from the same file).
- Splitting clarifies that `PdfView.tsx` is view + bridging glue, while `PdfEditor.ts` is the pure model.
- Matches the existing Browser layout exactly (`BrowserEditor.ts` + `BrowserView.tsx` + `index.tsx` + `BrowserEditorModel.ts` for shared state types). For PDF, the state types live in `PdfEditor.ts` directly because they're small and PDF has no parallel "BrowserEditorModel.ts" need (no sub-models / no shared state file).

### PD-IMPL9 — `PdfView.tsx` view body — retire `mainEditorV4` lookup

Today's `PdfViewer.tsx:108` reads:

```typescript
const v4Main = pagesModel.findPage(model.id)?.mainEditorV4 ?? null;
// ...
{v4Main ? <PageToolbar model={v4Main} /> : <EditorToolbar />}
```

This conditional handles the case where PDF was wrapped in `LegacyEditorAdapter`: `model` was the legacy class, but `PageToolbar` needs a v4 EditorModel — so the view looked up the wrapping adapter via `mainEditorV4`. Post-migration `model` IS the v4 PdfEditor — no lookup needed.

```typescript
// After:
<PageToolbar name="pdf-toolbar" model={model} borderBottom />
```

Also drops `EditorToolbar` import (no longer referenced) and `pagesModel` import.

### PD-IMPL10 — v4 registry `accepts({ fileName })` returns the legacy priority (100 for `.pdf`)

Per Browser precedent (US-558 NH10), Browser uses `accepts: () => -1` because Browser never accepts files. PDF DOES accept files — but the open-file flow goes through the legacy registry today. Should PDF's v4 `accepts` predicate also return the file priority, or `-1`?

**Resolution:** Return the legacy priority (delegating to `legacy.acceptFile`). Three reasons:

1. **Forward compatibility** — when US-559 migrates `PagesLifecycleModel.openFile` to v4 directly (via `v4EditorRegistry.resolveForFile(fileName)`), PDF needs to be returnable from `resolveForFile`. Setting the priority now avoids touching PDF again in US-559.
2. **Symmetry with text-bearing v4 registrations** — all of US-552 / US-553 / US-554 / US-560 / US-561 / US-562 / US-555 / US-556 / US-563 / US-564 / US-565 / US-557 delegate to the legacy `acceptFile` / `switchOption`. PDF follows the same idiom.
3. **`hasContentHost: false` keeps PDF out of the switch widget** — `findEditorsAccepting` filters by `hasContentHost`, so the v4 `accepts({ fileName: "x.pdf" }) === 100` doesn't make PDF a switch target.

```typescript
v4EditorRegistry.register({
    id: "pdf-view",
    name: "PDF Viewer",
    hasContentHost: false,
    accepts: (input) => {
        const legacy = editorRegistry.getById("pdf-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
    loadModule: async () => {
        const { pdfModule } = await import("./pdf");
        return pdfModule;
    },
});
```

### PD-IMPL11 — ⚠️ Generic v4-native no-host restore branch in `restorePage` (closes US-558 retrospective)

**Original draft proposed a PDF-specific restore branch** (mirror Explorer US-567 EX-IMPL). Investigation surfaced a broader problem:

US-558 (Browser) did NOT add a Browser-specific branch. Browser's restore flows through the legacy fallback (`newEditorModelFromState` → returns v4 BrowserEditor cast as legacy → wrapped in `LegacyEditorAdapter`). This means `mainEditorV4 instanceof BrowserEditor` returns FALSE after restore — the wrapped adapter is the `editors[]` entry, not the BrowserEditor instance. Two consequences:

1. **`automation/commands.ts:36, 40` is fragile post-restore.** Today's code reads `activePage?.mainEditorV4 instanceof BrowserEditor`. For freshly-constructed Browser pages (via `showBrowserPage`) this works; for restored pages, it returns FALSE.
2. **US-559 cannot delete `LegacyEditorAdapter`.** If Browser still flows through the adapter on restore, deleting the class breaks Browser. US-559's stated scope ("delete LegacyEditorAdapter") would have to grow to include "and rewrite Browser's restore path".

**Without this fix, every no-host migration (US-569 Image, US-571 Video, US-572–US-576) would compound the same blocker.** Each migrated editor would add another consumer of the adapter-wrap-on-restore path.

**Resolution — generic Set-based branch.** Add a `V4_NO_HOST_EDITOR_IDS` set at the top of `PagesPersistenceModel.ts` listing every editorId whose restore goes through `v4Registry.createEditor`. Today the set has two entries: `browser-view` (retroactive US-558 fix) and `pdf-view` (this PR). Each subsequent migration adds one line.

The branch fires BEFORE the legacy fallback so v4-native no-host editors restore directly. Editors NOT in the set (Archive pre-US-570, Image pre-US-569, etc.) fall through to the legacy fallback as before — backward compat preserved.

**Why a `Set` instead of per-editor `if` branches** (the originally proposed Explorer US-567 pattern):

- **One place to track migration progress** — the set IS the source of truth for "which no-host editors are migrated".
- **One-line opt-in per migration** — US-569 just adds `"image-view"` to the set.
- **Smaller diff in `restorePage`** — branch body stays constant; only the set grows.
- **US-559 path is clearer** — delete the set + the branch + the legacy fallback together as one unit.

Explorer (US-567) keeps its own explicit branch because Explorer is NOT in `editorRegistry` (no `createEditor` route); the set-based approach doesn't apply.

**Implementation detail — state seeding order.** The branch:

1. Constructs the editor with default state via `createEditor(id, d.id)`.
2. Spreads `d.state` into the editor's state via `Object.assign(s, d.state)` + sets `s.id = d.id`.
3. Calls `applyRestoreData(d.state)` so subclasses can do typed extras (mirrors Explorer's pattern at PagesPersistenceModel.ts:117).
4. Calls `restore()` to run the editor's setup work (e.g., PDF's pipe + localPdfPath; Browser's title sync).

The double-write (constructor default → Object.assign → applyRestoreData) is intentional — it lets subclasses choose which path to read from. Browser's `applyRestoreData` reads `data.tabs` etc.; PDF's reads `data.filePath`. Both work.

### PD-IMPL16 — `instanceof V4EditorModel` early-return in `wrapLegacyForPage` (closes open-file gap)

PD-IMPL11 fixes the restore path. The **open-file path** (`PagesLifecycleModel.openFile` → `createEditorFromFile` → `wrapLegacyForPage`) has the same problem: v4-native module factories return v4 editors cast as legacy, then `wrapLegacyForPage` falls through `isTextFile === false` to `new LegacyEditorAdapter(legacy, targetEditorId)`.

**Resolution — add an early-return** at the top of `wrapLegacyForPage`:

```typescript
if (legacy instanceof V4EditorModel) {
    return legacy as unknown as V4EditorModel;
}
```

**Safety analysis:**

- **Text-bearing editors (Monaco / Grid / MD / SVG / HTML / Mermaid / Graph / Draw / Link / Todo / RC / Notebook):** Their `newEditorModel` returns a real legacy `TextFileModel` (not a v4 editor). `instanceof V4EditorModel` is FALSE. Existing `adoptHost` branches fire as before.
- **Truly-legacy editors (Archive / Image pre-US-569 / Video pre-US-571 / Settings / About / MCP / Storybook / Category):** Their `newEditorModel` returns a real legacy `EditorModel` subclass. `instanceof V4EditorModel` is FALSE. Existing fallback `new LegacyEditorAdapter(...)` fires as before.
- **v4-native no-host editors (Browser today, PDF this PR, Image post-US-569, etc.):** Their `newEditorModel` returns a v4 editor cast as legacy. `instanceof V4EditorModel` is TRUE. Early-return skips the adapter wrap.

The fix benefits Browser retroactively without touching US-558's files. Each future no-host migration only needs to make sure its preserved legacy module factory returns a v4 instance (which is the established pattern from US-558 → BrowserView.tsx and is what this PR does for PDF).

**Why not a registry-level fix?** Could have made the v4 `editorRegistry.createEditor` the single entry point for open-file too (replacing `wrapLegacyForPage` entirely). But that's US-559 scope — collapsing the open-file path is a bigger refactor than the closing-blockers fix US-568 sets out to do. The `instanceof` early-return is one line that lets US-559 do the bigger collapse cleanly.

### PD-IMPL12 — Compatibility aliases for `PdfEditorModel` / `PdfEditorModelState` / `PdfEditorView` name

Per Explorer (US-567 EX-IMPL8) and Browser (US-558) precedent, ship compatibility aliases in `index.tsx` so any stale TypeScript imports keep compiling:

```typescript
export { PdfEditor as PdfEditorModel } from "./PdfEditor";
export type { PdfEditorState as PdfEditorModelState } from "./PdfEditor";
```

The `PdfViewer` value export retires (no external consumers grep'd). If a stale import surfaces during implementation, expose a `PdfView as PdfViewer` alias in `index.tsx`.

### PD-IMPL13 — `localPdfPath` shape conflict between save formats

Today's saved PDF descriptors carry `localPdfPath` in the descriptor.state (because the legacy `getRestoreData()` returns `Partial<S>` which includes everything in state). After migration, `getRestoreData()` strips `localPdfPath` (PD-IMPL6). Old saves with `localPdfPath` populated would restore it briefly, then `restore()` overwrites it with the recomputed value.

**No risk** — the value is recomputed correctly on every restore from `pipe.provider.sourceUrl` (plain file) or from the cache-file write (non-local). The brief population doesn't affect behavior; `restore()` always overwrites it.

### PD-IMPL14 — `editor.id` preservation across restore is essential for cache-file continuity

The cache file path is `appFs.resolveCachePath(this.id + ".pdf")`. If `this.id` differs between the save and restore (because the new editor was constructed with a fresh UUID), the cache file would orphan and the new PDF would create a duplicate.

Step 5's restore branch passes `d.id` to `v4Registry.createEditor("pdf-view", d.id)` — the v4 registry's `createEditor` ASSIGNS this id into the editor's state (`editorRegistry.ts:138–141`). So id continuity is preserved.

**Verified:** the cache-file flow works across restarts. The non-local PDF's temp file persists from save → restore → next save, then `dispose()` cleans it up on close.

### PD-IMPL15 — MCP `create_page` rejection unchanged

`mcp-handler.ts:159` returns an error for PDF type with a hint:

```typescript
"pdf-view": 'Use execute_script with: await app.pages.openFile("/path/to/file.pdf")',
```

The MCP create_page flow rejects all standalone editors. Post-migration, the legacy registry's `category: "standalone"` is still consulted by `mcp-handler.ts`. **No source change needed for MCP.** The user-facing error message stays accurate (PDF still opens via `app.pages.openFile`).

---

## Acceptance criteria

### Phase 1 — Static verification (read code; check 22 points)

**PDF editor (16 points):**

1. `PdfEditor` class extends `V4EditorModel<PdfEditorState>` from `editors/base/v4/EditorModel`.
2. `PdfEditor.editorId === "pdf-view"` is declared.
3. `PdfEditor` constructor signature is `(state: TComponentState<PdfEditorState>)`.
4. `PdfEditorState` extends `EditorStateBase` and has `type: "pdfFile"` + optional `filePath` + optional `localPdfPath`.
5. `PdfEditor.getRestoreData()` returns `EditorDescriptor` (NOT `Partial<S>`).
6. `PdfEditor.getRestoreData()` strips `localPdfPath` (sets to `undefined` in the returned state).
7. `PdfEditor.applyRestoreData()` reads `filePath` from the typed `data.filePath` (NOT from state.localPdfPath which is undefined in descriptors).
8. `PdfEditor.restore()` calls `ensurePipe()` then computes `localPdfPath` (plain-file branch OR cache-file branch).
9. `PdfEditor.dispose()` cleans up cache file if `cacheFileCreated`, then calls `super.dispose()`.
10. `PdfView.tsx` renders `<PageToolbar model={model}>` directly (NO `mainEditorV4` lookup).
11. `PdfView.tsx` exports `pdfEditorModule` (legacy EditorModule) as default; factories construct v4 `PdfEditor` cast as legacy.
12. `pdf/index.tsx` exports `pdfModule` (v4 EditorModule) with `createEditor` returning `new PdfEditor(...)`.
13. `register-editors.ts` legacy block loads from `"./pdf/PdfView"` (renamed file path).
14. `register-editors.ts` has a v4 registration for `pdf-view` with `hasContentHost: false` + `accepts` delegating to legacy + `loadModule` returning `pdfModule`.
15. `pdf/index.ts` is deleted (replaced by `pdf/index.tsx`).
16. No remaining import in the codebase references `editors/pdf/PdfViewer` (file removed).

**Cross-cutting infrastructure (6 points — close US-559 blockers):**

17. `PagesPersistenceModel.ts` declares `V4_NO_HOST_EDITOR_IDS = new Set(["browser-view", "pdf-view"])` at module scope.
18. `restorePage` has the generic branch matching `V4_NO_HOST_EDITOR_IDS.has(d.editorId)` AFTER the Explorer branch and BEFORE the legacy fallback. Branch constructs via `v4Registry.createEditor(d.editorId, d.id)`, seeds state from `d.state`, calls `applyRestoreData(d.state)` then `await editor.restore()`.
19. `PagesLifecycleModel.ts` line 2 import changes from `import type { EditorModel as V4EditorModel }` to `import { EditorModel as V4EditorModel }` (value import).
20. `wrapLegacyForPage` has the `if (legacy instanceof V4EditorModel) return legacy as unknown as V4EditorModel;` early-return at the top of the function (BEFORE `const targetEditorId = deriveEditorId(...)`).
21. No other test/build artifact regresses (`npm run typecheck` + `npm run lint` clean against the baseline established by US-567's commit `2fee1ef`).
22. After this PR, the only remaining producers of `LegacyEditorAdapter` instances are: (a) `restorePage`'s legacy fallback for truly-legacy editorIds (Archive, Image pre-US-569, Video pre-US-571, Settings, About, MCP, Storybook, Category), (b) `wrapLegacyForPage`'s final fallback for truly-legacy editors, (c) `restoreSidebarLegacy` for legacy secondary editors, (d) `BrowserWebviewModel.ts` (5 sites for `pagesModel.addPage(new LegacyEditorAdapter(...))` for legacy editors received via browser navigation). US-559 deletes all of these together with `LegacyEditorAdapter` itself.

### Phase 2 — Smoke tests (user runs in a dev build)

**PDF golden paths (8 tests):**

1. **Open a local PDF (plain file):** menu → "Open File" → select `.pdf` → new page opens; PDF renders via pdf.js viewer. Title is the PDF's filename. `localPdfPath === filePath`. **After open: `page.mainEditorV4 instanceof PdfEditor === true`** (verifies the `wrapLegacyForPage` early-return — PD-IMPL16).
2. **Open a PDF from a ZIP archive:** open `archive.zip` → drill into a `.pdf` entry → PDF renders. `localPdfPath` is a cache file path. `cacheFileCreated === true`.
3. **Open a remote PDF via HTTP:** `https://example.com/document.pdf` → PDF downloads, caches as temp file, renders.
4. **Close PDF tab — cache cleanup:** open a non-local PDF; verify cache file exists in cache dir; close the tab; verify cache file is gone.
5. **Survive app restart:** open a local PDF; close the app; relaunch. PDF reopens with the same file; viewer renders correctly. **After restart: `page.mainEditorV4 instanceof PdfEditor === true`** (verifies the generic restore branch — PD-IMPL11).
6. **Survive app restart for non-local PDF:** open a PDF inside a ZIP archive; close the app; relaunch. PDF reopens; archive is re-read; new cache file is created.
7. **Open multiple PDFs simultaneously:** open 3 distinct PDFs (1 local, 1 archived, 1 HTTP). All render; close in any order; no orphaned cache files.
8. **PDF restored from old (pre-US-568) session:** if the user has an existing `openFiles0.json` with PDF descriptors saved via the LegacyEditorAdapter path, confirm: post-update, PDF restores as v4 PdfEditor (the editorId is already `"pdf-view"` because `deriveEditorId({type:"pdfFile"})` returns it).

**Cross-cutting fix verification (3 tests — Browser retroactive):**

9. **Browser restored from session — `instanceof BrowserEditor` works.** Open a Browser page via menu, navigate to a site, close the app, relaunch. After restart: `pagesModel.activePage?.mainEditorV4 instanceof BrowserEditor` returns **TRUE** (today it returns FALSE because Browser is wrapped in LegacyEditorAdapter on restore — this test exercises PD-IMPL11's retroactive fix for Browser).
10. **Automation continues to work after Browser restart.** Open a Browser page → restart app → run an MCP `browser_snapshot` call against the restored Browser page. The automation `instanceof BrowserEditor` gate at `commands.ts:36` succeeds and the snapshot returns.
11. **Open-file path for Browser-like scenarios.** Not applicable for Browser directly (Browser doesn't open via files), but the same path applies to PDF: opening a PDF via the file picker should NOT wrap in adapter (smoke test #1 above already covers this).

**Backwards-compat verification (2 tests):**

12. **Open a truly-legacy editor still works.** Open an `.archive` file (Archive editor is pre-US-570) → archive view loads → after open, `page.mainEditorV4 instanceof LegacyEditorAdapter === true` (Archive is still legacy; existing adapter wrap fires). Restore after app restart: still goes through legacy fallback, still wraps in adapter. **No regression.**
13. **Text editor open via file picker still adopts host correctly.** Open a `.json` file → opens in Grid editor → grid renders rows. After open, `page.mainEditorV4 instanceof GridEditor === true` (the `adoptHost` branch in `wrapLegacyForPage` fires; the early-return is FALSE because `legacy` is a real `TextFileModel`).

### Phase 3 — Dashboard update

Mark US-568 with the verified note pattern in `doc/active-work.md`. Task stays unchecked (`[ ]`) per epic-task deferred-review model — `/review`, `/document`, `/userdoc` runs at EPIC-028 close.

---

## Files Changed

| File | Action | Why |
|------|--------|-----|
| `src/renderer/editors/pdf/PdfEditor.ts` | Create | v4 native class + state interface + defaults |
| `src/renderer/editors/pdf/PdfView.tsx` | Create (rename from `PdfViewer.tsx`) | View component + preserved legacy `pdfEditorModule` for the LegacyEditorAdapter safety-net path |
| `src/renderer/editors/pdf/index.tsx` | Create | v4 `pdfModule` EditorModule + compatibility aliases |
| `src/renderer/editors/pdf/PdfViewer.tsx` | Delete (renamed to `PdfView.tsx`) | Class extracted to `PdfEditor.ts`; module extracted to `index.tsx`; view stays under new filename |
| `src/renderer/editors/pdf/index.ts` | Delete | Folded into `index.tsx` |
| `src/renderer/editors/register-editors.ts` | Modify | Legacy block: `loadModule` loads `./pdf/PdfView` (renamed). New v4 block: registers `pdf-view` in v4 registry with `pdfModule`. |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Modify | **(cross-cutting)** Add `V4_NO_HOST_EDITOR_IDS` set at module scope + generic restore branch in `restorePage` Promise.all map (PD-IMPL11). Set includes `"browser-view"` (retroactive US-558 fix) + `"pdf-view"` (this PR). |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Modify | **(cross-cutting)** Convert `import type { EditorModel as V4EditorModel }` to value import. Add `if (legacy instanceof V4EditorModel) return legacy;` early-return at the top of `wrapLegacyForPage` (PD-IMPL16). Closes the open-file gap; benefits Browser retroactively. |
| `doc/active-work.md` | Modify | Update US-568 entry with linked task + broadened-scope note |
| `doc/tasks/US-568-pdf-editor-migration/README.md` | Create | This task document |

**Total:** 4 created, 4 modified, 2 deleted. **Two new source files** (`PdfEditor.ts` + `index.tsx`); one rename (`PdfViewer.tsx` → `PdfView.tsx`); one delete (`index.ts`). **Two cross-cutting infrastructure files modified** (`PagesPersistenceModel.ts` + `PagesLifecycleModel.ts`) to close US-559 blockers for ALL no-host editors.

## Files NOT changing

- `src/renderer/editors/pdf/` — no other files exist in this folder.
- `src/renderer/editors/base/v4/EditorModel.ts` — base class unchanged.
- `src/renderer/api/mcp-handler.ts:159` — MCP `create_page` rejection message unchanged (PD-IMPL15).
- `src/renderer/api/pages/PagesLifecycleModel.ts` — PDF-specific routing unchanged. The `openFile` flow still goes through the legacy registry's `pdfEditorModule.newEditorModel(filePath)` (which now returns a v4 PdfEditor cast as legacy). The cross-cutting `wrapLegacyForPage` `instanceof V4EditorModel` early-return (Step 6) is the ONLY change to this file — and it benefits Browser, PDF, and every future no-host migration uniformly without per-editor edits.
- `src/renderer/automation/commands.ts` — no PDF automation hooks.
- `src/renderer/scripting/api-wrapper/PageWrapper.ts` — no `page.asPdf()` facade (PDF is not in the scripting API).
- `src/main/*` — PDF is a renderer-only concern; main-process `safe-file://` protocol handler unchanged.
- `assets/pdfjs/web/viewer.html` — pdf.js shipped asset, unchanged.
- `src/shared/types.ts` — `EditorType` / `EditorView` unions still include `pdfFile` / `pdf-view` (per S10 carve-out — type discriminators retained during the strangler period).
- `doc/architecture/editors.md` — references `pdf-view`, unchanged at code level. Document update deferred to EPIC-028 `/document` pass at close.
- `doc/tasks/completed.md` — task moves here only when EPIC-028 closes (deferred-review model).

---

## Cross-task notes

- **No walkthrough amendment required.** Walkthrough 30 closure (`30-no-host-group.md:1232–1247`) explicitly defers PDF for first-principles investigation — this task's PD-IMPL concerns ARE the investigation. No mockup change.
- **US-568 retroactively fixes US-558.** PD-IMPL11's generic restore branch includes `"browser-view"` in `V4_NO_HOST_EDITOR_IDS`, closing US-558's adapter-wrap-on-restore limitation. PD-IMPL16's `wrapLegacyForPage` early-return is no-op for Browser (Browser doesn't open via files) but covers the symmetric concern. Browser's `automation/commands.ts:36, 40` `instanceof BrowserEditor` checks now work consistently across direct construction AND restore.
- **PD-IMPL11 + PD-IMPL16 establish the infrastructure pattern for all remaining no-host migrations.** US-569 (Image), US-571 (Video), US-572 (Settings), US-573 (About), US-574 (MCP Inspector), US-575 (Storybook), US-576 (Category) each only need to:
  1. Build their own `XEditor.ts` + `XView.tsx` + `index.tsx` files (mirror PDF's pattern).
  2. Register in `register-editors.ts` (legacy block updated to load renamed view file; new v4 block with `hasContentHost: false`).
  3. Add ONE line: `"x-view"` to `V4_NO_HOST_EDITOR_IDS` in `PagesPersistenceModel.ts`.

  No `restorePage` or `wrapLegacyForPage` touches per editor. The infrastructure work is done.
- **US-559 path clarified.** Post-US-568, the only producers of `LegacyEditorAdapter` instances are:
  1. `restorePage` legacy fallback for truly-legacy editorIds (Archive, Image pre-US-569, …).
  2. `wrapLegacyForPage` final fallback for truly-legacy editors (file-open).
  3. `restoreSidebarLegacy` for v3 sidebar restore.
  4. `BrowserWebviewModel.ts` (5 sites — wrap legacy editors received via browser navigation events).

  US-559 deletes (1), (2), and (3) as one unit alongside `LegacyEditorAdapter` itself once US-570–US-576 (and the eight no-host migrations they cover) land. (4) deletes naturally as part of US-570 (Archive) — Browser receives Archive pages via navigation and those become v4-native when Archive migrates.
- **Future-proofing for `V4_NO_HOST_EDITOR_IDS` accidentally getting out of sync.** If a future migration forgets to add its editorId to the set, the consequence is: the editor restores via the legacy fallback path → wrapped in `LegacyEditorAdapter`. This is the SAME behavior as before US-568 — no functional regression, just suboptimal `instanceof` semantics. Each migration's acceptance criteria should include "verify `mainEditorV4 instanceof XEditor === true` after restart" — same check this PR adds for PDF and Browser.
- **`/review` / `/document` / `/userdoc` deferred** to EPIC-028 close per epic-task workflow.
- **No `/review` until EPIC-028 close** — `[ ]` checkbox stays unchecked even after implementation + smoke testing.
- **No follow-up task spawned by US-568** — all PDF concerns AND the cross-cutting US-559 prep work resolve in-task.
