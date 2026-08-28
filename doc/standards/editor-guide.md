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
├── index.ts / index.tsx     # EditorModule registration
├── MyEditor.ts              # EditorModel subclass
├── MyEditorBody.tsx         # React body, or MyEditorBodyView.ts for a vanilla body
│                            # (MyEditorView.ts / .tsx for a standalone main view)
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

### Editor icons

The only custom editor-icon contract is `getIconElement?: () => Element | undefined`. A
`noLanguage` editor that owns a glyph should return a fresh DOM node, using
`createIconElement("name", props)` for registry icons or
`createIconComponentElement(icon, props)` for an icon component without a registry name. Do not
return a React element or use the removed `getIcon` contract. The node is single-use: appending it
to another host moves it, so build it at the point of use and never cache, memoise, hoist, or share
one node across tabs, panels, buttons, or menus. For a registry name that is wrong,
`createIconElement` produces an empty `<svg>`; inspect for that symptom when a migrated glyph is
missing.

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

## Step 3: Choose and implement the view shape

Choose the page chrome before writing the view:

- **Chrome-free** — use a plain root for standalone content that needs no shared toolbar, or
  expose `BodyView` for an editor embedded inside another editor (for example notebook notes).
  An embedded body must not add `PageToolbarView` or `TextChromeView`.
- **`PageToolbarView`** — use for a non-text editor that needs the standard page toolbar but does not
  need text-host actions, script panel, footer, or editor overlay. The Image editor is the native
  toolbar example. The page toolbar's native view is the canonical implementation for converted
  non-text editors.
- **`TextChromeView`** — use for a text-host editor. It supplies the native host-aware toolbar,
  script panel, content-host footer, focus/key handling, and overlay slot. The editor's `View`
  composes it directly; a React body may remain a bounded island in its `children` slot.

Every editor module now requires a native `View` arm. A converted or new DOM-heavy view should use
`VanillaView` and export it as `View` (or `BodyView` when embeddable). Keep the root stable.
If a body still needs React, wrap it in `EditorErrorBoundary` and pass the resulting element as
`TextChromeView.children`; the native chrome owns the slot and the body remains one bounded React
island. `EditorToolbar` and `ContentHostFooter` are compatibility faces for React callers, not the
native implementation path.

If a third-party editor widget requires React, keep the React code in a named, minimal island and
let the native view own its host element, surrounding chrome, model bindings, and disposal. Give
the host explicit size styles when the widget does not establish its own geometry; do not hide the
island in a `.ts` file merely to satisfy an extension count.

### Size editor bodies to their container

An editor body is often a flex child of the shared chrome. Set `minHeight: 0` on the flex panel
that must shrink when the body or a nested widget writes measured height into its own subtree. This
applies to av-grid/DataGrid hosts and to any other imperative or virtualized component that stores
its measured height in the DOM. Without the override, the flex item's default content-based minimum
can preserve the last measured size even after the container becomes smaller, causing the body to
overflow and cover sibling controls such as the script-panel splitter.

### Using the shared Monaco hosts

Use the shared hosts in `/src/renderer/editors/shared/` for Monaco widgets. The single-editor host
(`MonacoEditorHostView` / `MonacoEditorHost`) creates `monaco.editor.create`; the diff host
(`MonacoDiffEditorHostView` / `MonacoDiffEditorHost`) creates `createDiffEditor`. The React faces are
only `mountVanilla` adapters. A native consumer may instantiate the view directly; a React consumer
should keep the host view from `onMount` in a ref.

These widgets are intentionally uncontrolled. `initialValue` or `initialOriginal` /
`initialModified` is consumed once at mount; later prop changes do not reconcile content. When model
state changes outside Monaco, call `host.setValue(next)` or `host.setDiffValues(original, modified)`.
Do not compare or write through `host.getEditor()` yourself: the host compares with the current
model, returns when the value is already equal, suppresses its own change callback during the write,
uses Monaco `setValue` for read-only editors, and uses `executeEdits` plus `pushUndoStop` for editable
editors so external updates preserve the undo stack and cursor behavior.

`onMount` returns the host view, not the raw editor. Use `host.getEditor()` only for widget-specific
operations that the host does not expose. There is no `theme` prop because Monaco themes are global;
`api/setup/configure-monaco.ts` owns the application theme. There is no `height` prop either: the
host root is sized by CSS, and the single and diff hosts deliberately use separate root classes
with their own flex-child width rules.

Model ownership is explicit. `createModel` creates a model owned by the host. `setModel(model,
"owned" | "borrowed")` releases an owned model it displaces; borrowed models remain the caller's
responsibility and are never disposed by the host. The host detaches the widget before disposing
owned models and defers disposal to a macrotask. For a diff editor, apply the same rule to the
original and modified model pair.

### React view example

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

For a text-bearing native editor, compose the shared chrome directly:

```typescript
import { createElement } from "react";
import { EditorErrorBoundary } from "../../ui/app/EditorErrorBoundary";
import { TextChromeView } from "../base/TextChromeView";
import { VanillaView } from "../../uikit/shared/vanilla-view";

export class MyEditorView extends VanillaView<{ model: EditorModel }> {
    private readonly chrome: TextChromeView;

    public constructor(props: { model: EditorModel }) {
        const chrome = new TextChromeView({
            model: props.model,
            children: createElement(
                EditorErrorBoundary,
                null,
                createElement(MyEditorBody, { model: props.model }),
            ),
        });
        super(props, chrome.root);
        this.chrome = this.child(chrome);
    }

    protected onMount(): void {
        this.chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        this.chrome.update({
            model: props.model,
            children: createElement(
                EditorErrorBoundary,
                null,
                createElement(MyEditorBody, { model: props.model }),
            ),
        });
    }
}
```

When the body is native, construct it as a `VanillaView`, pass `body.root` as the
`children` slot, register it with `child()`, and mount/update it alongside the chrome. The
`TextChromeView` slot accepts either DOM nodes or React elements; only the latter create a React
root.

## Step 4: Export the EditorModule

```typescript
// index.ts (or index.tsx when the module contains React body code)
import { TComponentState } from "../../core/state/state";
import { MyEditor, defaultMyEditorState } from "./MyEditor";
import { MyEditorView } from "./MyEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

export const myEditorModule: EditorModule = {
    createEditor: () =>
        new MyEditor(new TComponentState({ ...defaultMyEditorState })),
    View: MyEditorView,
    // Only for standalone (no-host) editors that open FROM a file path
    // (link decode / path-derived state) — text-bearing editors never need it:
    // newEditorModel: async (filePath?: string) => { ... },
    // Only for embeddable editors (rendered inside Notebook notes):
    // BodyView: MyEditorEmbeddedView,
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

Register the panel in `/src/renderer/ui/secondary-views/secondary-view-registry.ts`. A registration
returns `VanillaViewCtor<SecondaryViewProps>`; the secondary-view host owns the asynchronous load,
stable root, and retirement lifecycle. Build headers with `SideBarPanelHeaderView` against the
provided `headerRef`, pass DOM `Node` slots where possible, and use `mountReactHandle` only for a
deliberate React island that remains outside the converted surface. Do not register a replaced
record view with `this.child()`.

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
- [ ] `EditorModule` exports `createEditor` + required native `View` (plus `newEditorModel` for standalone file-open editors, `BodyView` for embeddable ones)
- [ ] Row added to the `EDITORS` table in `register-editors.ts`; matcher added to `EDITOR_MATCHERS` in `editor-matchers.ts` if the editor matches files/languages
- [ ] The row's `load` keeps a literal `import("./…")` — preserves code splitting
- [ ] Error states and loading states are handled in the native `View` (`AsyncEditorView` supplies the shared loading and native error host)
- [ ] (Optional) Scripting facade added with type declaration

## Examples

- **Simple viewer:** `/src/renderer/editors/image/` — read-only image viewer, no content host
- **Text-bearing minimal:** `/src/renderer/editors/svg/` — read-only `VanillaView` preview over the host (`/src/renderer/editors/html/` adds an image-export capability)
- **Text-bearing complex:** `/src/renderer/editors/grid/` — JSON/CSV grid editor with a native `DataGridView`, full edit/save flow, custom write-guard, and host-slot settings
- **Markdown renderer:** `/src/renderer/editors/markdown/` — native `TextChromeView` shell with a native body and hand-written HAST-to-DOM rendering
- **Per-note embedding:** `/src/renderer/editors/notebook/note-editor/` — Notebook embeds text-bearing editors per-note via `NoteItemEditModel` (a non-file IContentHost)
- **No-host with sidebar:** `/src/renderer/editors/explorer/` — Explorer sidebar editor with no main content area
- **Multi-process editor:** `/src/renderer/editors/browser/` — webview-based browser spanning three processes ([architecture doc](../architecture/browser-editor.md))
