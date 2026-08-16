# Editor Creation Guide

> Read this before creating a new editor type.

## Prerequisites

Read these first:
- [Architecture Overview](../architecture/overview.md)
- [Editor System](../architecture/editors.md)

## Decision Tree

Three questions decide the shape of your editor:

1. **Does it work on editable text content?** (e.g. JSON, CSV, Markdown — yes; PDF, Image, Browser — no)
   - **Yes** → extend `TextHostEditorModel` (`editors/base/TextHostEditorModel.ts`). It composes
     the `TextFileModel` host, registers `CONTENT_HOST_TRAIT` (so the editor participates in
     switching automatically), and owns the whole host lifecycle. Skip to step 2.
   - **No** → extend `EditorModel` directly; your editor stores its own state. Skip to "Step 1:
     Folder structure" below.

2. **Does the editor write content back into the host?** (e.g. Grid edits — yes; Markdown
   preview — no)
   - **Yes** → route every write through `this.writeToHost(content, true)` and read external
     changes via `this.subscribeHostContent(handler)` — the pair forms the echo guard.
   - **No** → the body can read `host.state.use((s) => s.content)` directly; no subscription
     needed.

3. **Should the editor have its own sidebar panel(s)?** (e.g. Link Editor's Categories panel)
   - **Yes** → set `this.secondaryView = ["my-panel"]` in `setPage()` or `restore()`. See [Secondary Editors](../architecture/secondary-views.md).
   - **No** → skip.

## Step 1: Folder Structure

```
/src/renderer/editors/myeditor/
├── index.tsx                # EditorModule registration
├── MyEditor.ts              # EditorModel subclass
├── MyEditorBody.tsx         # React component for text-bearing editors
│                            # (or MyEditorView.tsx for non-text editors)
└── components/              # (optional) Editor-specific components
```

## Step 2: Implement the EditorModel Subclass

### Non-text editor (no `IContentHost`)

```typescript
// MyEditor.ts
import { TOneState } from "../../core/state/state";
import { EditorModel } from "../base/EditorModel";
import { IEditorState } from "../../../shared/types";

export interface MyEditorState extends IEditorState {
    customData: string;
    isLoading: boolean;
}

export class MyEditor extends EditorModel<MyEditorState> {
    readonly editorId = "my-editor";

    constructor() {
        super(new TOneState<MyEditorState>({
            id: crypto.randomUUID(),
            type: "myType",
            title: "untitled",
            modified: false,
            language: undefined,
            filePath: undefined,
            editor: "my-editor",
            customData: "",
            isLoading: false,
        }));
    }

    async restore(): Promise<void> {
        const { filePath } = this.state.get();
        if (!filePath) return;
        this.state.update((s) => { s.isLoading = true; });
        // const content = await loadContent(filePath);
        this.state.update((s) => {
            s.isLoading = false;
            // s.customData = content;
        });
    }

    getDescriptor(): HostDescriptor {
        const { customData, isLoading, ...persisted } = this.state.get();
        return { kind: "myType", state: persisted };
    }
}
```

### Text-bearing editor (extends `TextHostEditorModel`)

The base owns the entire host lifecycle (trait, `switchFrom`, `restore`, `adoptHost`,
persistence, `confirmRelease`/`saveState`/`dispose`) — a subclass supplies only its domain:

```typescript
// MyEditor.ts
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { TextFileModel } from "../text/TextEditorModel";

export class MyEditor extends TextHostEditorModel<MyEditorState> {
    readonly editorId = "my-view";
    protected readonly displayName = "My Editor";   // error/notify strings

    adoptHost(host: TextFileModel): void {
        super.adoptHost(host);

        // React to external content changes (echo-guarded against writeToHost):
        this.subscribeHostContent((content) => this.parse(content));

        // Persist a view setting in the host's per-editor slot (survives
        // editor switches AND app restarts):
        this.mirrorHostSettings<{ compact?: boolean }>(
            (saved) => { if (saved.compact !== undefined) /* seed state */; },
            (s) => ({ compact: s.compact }),
            (s) => s.compact,                        // slice-bound mirror
        );

        this.parse(host.state.get().content ?? "");   // initial parse
    }

    private serializeBack(): void {
        this.writeToHost(JSON.stringify(this.buildData(), null, 4), true);
    }
}
```

Editors whose initial load must not run inside `adoptHost` itself (the Grid/Link/Notebook
pattern) put it in `protected onHostAttached(host)` instead. The base runs that hook on all
three construction paths — editor switch (`switchFrom`), session restore (`restore` success),
and open-file (`attachEditorToPage` via the public `bootstrapFromHost()` bridge) — but never
on a bare `adoptHost` and never on `restore`'s error-fallback path. Editors that parse during
adoption (the Mermaid/EnvVars pattern) need no hook. Clean up domain refs on switch-away in
`protected onHostExtracted()`. Custom subscriptions registered via
`this.registerHostSubscription(unsub)` are torn down automatically on re-adopt, switch-away,
and dispose.

The lifecycle hook order during a switch is:

1. Owner (`PageModel.switchMainEditor`) creates the new editor via `editorRegistry.createEditor(newId)`
2. Owner calls `newEditor.switchFrom(oldEditor)` — the base extracts the host through the old
   editor's `CONTENT_HOST_TRAIT` (`extractContentHost()`, no dispose), preserves the old
   editor's `id` for cache-file continuity, `adoptHost()`s the host, then calls
   `onHostAttached(host)`
3. Owner installs newEditor (e.g., `page.setMainEditor(newEditor)`)

## Step 3: Implement the React Component

```typescript
// MyEditorBody.tsx (or MyEditorView.tsx for non-text editors)
import { MyEditor } from "./MyEditor";
import { Panel } from "../../uikit/Panel/Panel";
import { Spinner } from "../../uikit/Spinner/Spinner";

interface Props {
    model: MyEditor;
}

export function MyEditorBody({ model }: Props) {
    const { customData, isLoading } = model.state.use((s) => ({
        customData: s.customData,
        isLoading: s.isLoading,
    }));

    if (isLoading) {
        return (
            <Panel flex direction="column" overflow="hidden" align="center" justify="center">
                <Spinner size={24} />
            </Panel>
        );
    }

    return <Panel flex direction="column" overflow="hidden">Your editor content: {customData}</Panel>;
}
```

For generated-content renderers or third-party/native hosts, import a stylesheet beside the
editor and scope its selectors below a semantic editor root. Do not add a general-purpose
`className` or `style` escape hatch to UIKit to carry those rules.

For text-bearing editors, compose the shared chrome:

```typescript
import { TextChrome } from "../base/TextChrome";

export function MyEditorBody({ model }: Props) {
    return (
        <TextChrome model={model} host={model.contentHost!}>
            {/* your editor-specific body */}
        </TextChrome>
    );
}
```

## Step 4: Export the EditorModule

```typescript
// index.tsx
import { TComponentState } from "../../core/state/state";
import { MyEditor, defaultMyEditorState } from "./MyEditor";
import { MyEditorView } from "./MyEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function MyEditorComponent({ model }: { model: EditorModel }) {
    return <MyEditorView model={model as MyEditor} />;
}

export const myEditorModule: EditorModule = {
    createEditor: () =>
        new MyEditor(new TComponentState({ ...defaultMyEditorState })),
    Component: MyEditorComponent,
    // Only for standalone (no-host) editors that open FROM a file path
    // (link decode / path-derived state) — text-bearing editors never need it:
    // newEditorModel: async (filePath?: string) => { ... },
    // Only for embeddable editors (rendered inside Notebook notes):
    // Body: MyEditorEmbeddedBody,
};
```

Default states carry `id: ""` — never generate an id in the module; the registry stamps a
real `instanceId` when one exists (host id, restore descriptor, switch source).

## Step 5: Register the Editor

Registration is a **table** in `/src/renderer/editors/register-editors.ts` — add one row to
`EDITORS`:

```typescript
{ id: "my-editor", name: "My Editor", hasContentHost: true, load: async () => (await import("./myeditor")).myEditorModule },
```

The `load` closure MUST keep a literal `import("./…")` so Vite code splitting is preserved.
The loop derives the rest: `match` comes from `EDITOR_MATCHERS["my-editor"]` (add your
matcher in `/src/renderer/editors/base/editor-matchers.ts`), and `accepts` defaults to
`makeAccepts(match)` — or `() => -1` when there is no matcher (standalone editors that never
match a file). Only editors with special acceptance semantics (monaco, file-diff) set an
explicit `accepts` on their row. Row order matters — it breaks priority ties in
`resolveForFile` — so append unless you have a reason not to.

### Row / Matcher Options

| Property | Where | Description |
|----------|-------|-------------|
| `id` | row | Unique editor ID (must be in `EditorView` type) |
| `name` | row | Display name shown in UI |
| `hasContentHost` | row | `true` for text-bearing editors (extend `TextHostEditorModel`) |
| `accepts(input)` | row (override) | Returns priority ≥ 0 if this editor accepts the input, -1 otherwise; default derived from the matcher |
| `load()` | row | Module importer (literal dynamic `import`) |
| `acceptFile(fileName)` | matcher | Returns priority ≥ 0 if this editor should **open** the file by default, -1 otherwise. File **name** only — no language, no content |
| `validForLanguage(lang)` | matcher | Returns `true` if the editor is valid for the language |
| `switchOption(lang, filePath?)` | matcher | Returns priority ≥ 0 to show in the switch dropdown, -1 to hide |
| `detectsContent(lang, content)` | matcher | Returns `true` if content matches this editor (regex-based, no JSON parsing) |

`acceptFile` and `switchOption` answer different questions and are independently optional. `acceptFile` decides which editor a file *opens* in (`editorRegistry.resolve` / `resolveId` consult nothing else); `switchOption` decides which editors appear in the switch widget for a *language*. An editor may declare either or both — `md-view` declares both (so Markdown opens in Preview *and* is switchable), while `html-view` and `mermaid-view` declare only `switchOption` (so they are reachable by switching but never claim a file on open).

### Priority Guidelines

The `acceptFile` ladder as actually registered — highest wins, and ties go to whichever editor the registry iterates first, so avoid ties:

- `0` — Fallback: monaco, the floor that guarantees every file resolves
- `10` — Rendered view preferred over source: markdown preview
- `20` — Compound file names: `*.grid.json`, `*.note.json`, `*.rest.json`, `*.link.json`, `*.fg.json`, `*.log.jsonl`, `*.env.json`, `*.grid.csv`
- `50` — Dedicated format editors: `.excalidraw` → drawing
- `100` — Exclusive viewers with no text view: image, archive, video
- `200` — Pseudo-paths: `tree-category://` links

Content-based detection is **not** on this ladder — it scores `60` inside `accepts()` and never reaches `acceptFile`, so it influences the switch widget and `detectContentEditor`, not which editor opens a file.

A trusted board declaring `editorPriority` in its `board-manifest.json` competes on this same ladder and must **strictly** exceed the best built-in claimant to become the default. See [Custom-Editor Boards](../architecture/editors.md#custom-editor-boards).

## Step 6: Update Shared Types (if introducing new IDs)

Two unions live in the shared/public type surface; update both as applicable when adding a new editor:

- **`EditorView`** (the editor ID union — required for any new editor with a new ID). Canonical site: `/src/renderer/api/types/common.d.ts`. Add the new ID to the union there. `/src/shared/types.ts` re-exports `EditorView` from this file, so internal code keeps working transparently. The Vite `editorTypesPlugin` (configured in `/vite.renderer.config.ts`) auto-copies `.d.ts` files from `src/renderer/api/types/` to `assets/editor-types/` on `npm start` / `npm run dist` — never hand-edit `assets/editor-types/`. Adding the ID gives TypeScript-typed scripts autocomplete + typo detection for the new editor on `page.editor =`, `app.editors.getById()`, `app.pages.addEditorPage()`, and `ISwitchOptions.options`.

- **`EditorType`** (the page-kind union — rare; only when a brand-new page type is added, e.g. a "Settings" page). Defined in `/src/shared/types.ts`.

## Step 7: Optional — Add a Scripting Facade

If users should script your editor via `page.asMyEditor()`:

1. Add the facade class to `/src/renderer/scripting/api-wrapper/MyEditorFacade.ts` — wraps the `EditorModel` subclass directly.
2. Add the type declaration to `/src/renderer/api/types/my-editor.d.ts`.
3. Wire the facade in `PageWrapper.ts` (add `asMyEditor()` method).
4. Re-export the type from `/src/renderer/api/types/index.d.ts`.

See `/src/renderer/scripting/api-wrapper/GridEditorFacade.ts` for a complete example.

## Step 8: Optional — Add Sidebar Panels

If your editor needs sidebar panel(s), see [Secondary Editors](../architecture/secondary-views.md) for the full lifecycle. Quick version:

```typescript
class MyEditor extends EditorModel<MyEditorState> {
    setPage(page: IPageHost | null): void {
        super.setPage(page);
        if (page) {
            this.secondaryView = ["my-panel"];  // setter manages registration
        }
    }
}
```

Register the panel React component in `/src/renderer/ui/secondary-views/secondary-view-registry.ts`.

## Testing Your Editor

1. **Open by file extension:** create a file with your extension and verify it opens correctly
2. **Session restore:** close and reopen the app — the page should restore with content + state intact
3. **Editor switch (text-bearing only):** open the file in Monaco, switch to your editor via the toolbar dropdown, then back — verify content + modifications survive
4. **Multiple instances:** open multiple files of your type in different tabs
5. **Edge cases:** empty file, large file, file with parse errors

## Checklist

- [ ] `MyEditor` extends `TextHostEditorModel<MyEditorState>` (text-bearing) or `EditorModel<MyEditorState>` (no host) with a unique `editorId`
- [ ] Constructor calls `super()` with a `TOneState` seeded from `IEditorState` fields
- [ ] Non-host editors: `restore()` handles the initial async load; text-bearing editors inherit `restore()` and wire domain logic in the `adoptHost` override (calling `super.adoptHost(host)` first)
- [ ] `getRestoreData()` returns persisted state (stripped of runtime-only fields) — text-bearing editors inherit the identity-only base and extend it only for extra durable fields
- [ ] `dispose()` calls `super.dispose()` and cleans up domain-only resources (host subscriptions registered via `registerHostSubscription` are torn down by the base)
- [ ] For text-bearing editors: `displayName` set; host content writes go through `writeToHost`; view settings ride `mirrorHostSettings`
- [ ] `EditorModule` exports `createEditor` + `Component` (plus `newEditorModel` for standalone file-open editors, `Body` for embeddable ones)
- [ ] Row added to the `EDITORS` table in `register-editors.ts`; matcher added to `EDITOR_MATCHERS` in `editor-matchers.ts` if the editor matches files/languages
- [ ] The row's `load` keeps a literal `import("./…")` — preserves code splitting
- [ ] Error states and loading states are handled in the React component
- [ ] (Optional) Scripting facade added with type declaration

## Examples

- **Simple viewer:** `/src/renderer/editors/image/` — read-only image viewer, no content host
- **Text-bearing minimal:** `/src/renderer/editors/svg/` — read-only preview over the host, no domain subscriptions (`/src/renderer/editors/html/` adds an image-export capability)
- **Text-bearing complex:** `/src/renderer/editors/grid/` — JSON/CSV grid editor with full edit/save flow, custom write-guard, and host-slot settings
- **Per-note embedding:** `/src/renderer/editors/notebook/note-editor/` — Notebook embeds text-bearing editors per-note via `NoteItemEditModel` (a non-file IContentHost)
- **No-host with sidebar:** `/src/renderer/editors/explorer/` — Explorer sidebar editor with no main content area
- **Multi-process editor:** `/src/renderer/editors/browser/` — webview-based browser spanning three processes ([architecture doc](../architecture/browser-editor.md))
