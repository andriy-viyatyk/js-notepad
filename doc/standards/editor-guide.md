# Editor Creation Guide

> Read this before creating a new editor type.

## Prerequisites

Read these first:
- [Architecture Overview](../architecture/overview.md)
- [Editor System](../architecture/editors.md)

## Decision Tree

Three questions decide the shape of your editor:

1. **Does it work on editable text content?** (e.g. JSON, CSV, Markdown — yes; PDF, Image, Browser — no)
   - **Yes** → compose an `IContentHost` (via `this.contentHost`). Skip to step 2.
   - **No** → your editor stores its own state directly. Skip to "Step 1: Folder structure" below.

2. **Should users be able to switch *to* this editor while looking at a sibling text view?** (e.g. Grid view when looking at JSON — yes; Markdown preview from Monaco — yes)
   - **Yes** → expose `CONTENT_HOST_TRAIT` (with `extractContentHost` / `inheritContentHost`).
   - **No** → just compose the host; no trait needed.

3. **Should the editor have its own sidebar panel(s)?** (e.g. Link Editor's Categories panel)
   - **Yes** → set `this.secondaryEditor = ["my-panel"]` in `setPage()` or `restore()`. See [Secondary Editors](../architecture/secondary-editors.md).
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

### Text-bearing editor (with `IContentHost` + `CONTENT_HOST_TRAIT`)

```typescript
// MyEditor.ts
import { EditorModel } from "../base/EditorModel";
import { CONTENT_HOST_TRAIT, IContentHostTrait } from "../base/editor-traits";
import { IContentHost } from "../base/IContentHost";

export class MyEditor extends EditorModel<MyEditorState> implements IContentHostTrait {
    readonly editorId = "my-view";
    contentHost: IContentHost | null = null;

    constructor() {
        super(/* state */);
        this.traits.set(CONTENT_HOST_TRAIT, this);
    }

    extractContentHost(): IContentHost {
        const host = this.contentHost!;
        this.contentHost = null;   // detach — do NOT dispose
        return host;
    }

    inheritContentHost(host: IContentHost): void {
        this.contentHost = host;
        // Read content via this.contentHost.state, subscribe to changes, etc.
    }

    async restore(): Promise<void> {
        // Initial parse of content from this.contentHost.state.get().content
    }

    dispose(): void {
        // Only dispose this.contentHost if WE created it (not if it was inherited).
        // The owner is responsible for host lifecycle across editor swaps.
        super.dispose();
    }
}
```

The lifecycle hook order during a switch is:

1. Owner calls `oldEditor.traits.get(CONTENT_HOST_TRAIT)?.extractContentHost()` → returns the host (no dispose)
2. Owner creates new editor instance via `editorRegistry.createEditor(newId)`
3. Owner calls `newEditor.traits.get(CONTENT_HOST_TRAIT)?.inheritContentHost(host)`
4. Owner installs newEditor (e.g., `page.setMainEditor(newEditor)`)
5. `newEditor.restore()` runs — reads from the inherited host

## Step 3: Implement the React Component

```typescript
// MyEditorBody.tsx (or MyEditorView.tsx for non-text editors)
import styled from "@emotion/styled";
import { MyEditor } from "./MyEditor";
import { Spinner } from "../../uikit/Spinner/Spinner";

const Root = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
});

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
            <Root style={{ alignItems: "center", justifyContent: "center" }}>
                <Spinner size={24} />
            </Root>
        );
    }

    return <Root>Your editor content: {customData}</Root>;
}
```

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
import { EditorModule } from "../base/editorRegistry";
import { MyEditor } from "./MyEditor";
import { MyEditorBody } from "./MyEditorBody";

const myEditorModule: EditorModule = {
    id: "my-editor",
    name: "My Editor",
    Editor: MyEditorBody,
    create: () => new MyEditor(),
    hasContentHost: false,              // true if text-bearing
    accepts: (input) => {
        if (input.kind === "file" && input.fileName?.toLowerCase().endsWith(".myext")) {
            return 50;                  // priority — see Editor System § Resolution
        }
        return -1;
    },
};

export default myEditorModule;
```

## Step 5: Register the Editor

In `/src/renderer/editors/register-editors.ts`:

```typescript
import { editorRegistry } from "./base/editorRegistry";

editorRegistry.register(
    async () => (await import("./myeditor")).default,
);
```

The registry stores the module factory; the factory runs on first `getById` / `resolve` call, populating the actual `EditorModule`. This preserves code splitting — the editor module is only loaded when needed.

### Registration Options

| Property | Description |
|----------|-------------|
| `id` | Unique editor ID (must be in `EditorView` type) |
| `name` | Display name shown in UI |
| `Editor` | React component (`React.ComponentType<{ model: EditorModel }>`) |
| `create()` | Factory returning a new `EditorModel` instance |
| `hasContentHost` | `true` for text-bearing editors that compose an `IContentHost` |
| `accepts(input)` | Returns priority ≥ 0 if this editor accepts the input (file/url/content), -1 otherwise |
| `validateForLanguage(lang)` | Returns `true` if the editor is valid for the language |
| `switchOption(lang, filePath?)` | Returns priority ≥ 0 to show in the switch dropdown, -1 to hide |
| `isEditorContent(lang, content)` | Returns `true` if content matches this editor (regex-based, no JSON parsing) |

### Priority Guidelines

- `0` — Fallback (monaco text editor)
- `10` — Alternative text views (markdown preview, grid view)
- `20` — Specialized text editors (e.g., `*.grid.json` → grid editor)
- `50` — Standard editors for specific file types
- `90` — Content-based detection (e.g., JSON with `"type": "note-editor"`)
- `100` — Exclusive editors (PDF, image)

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

If your editor needs sidebar panel(s), see [Secondary Editors](../architecture/secondary-editors.md) for the full lifecycle. Quick version:

```typescript
class MyEditor extends EditorModel<MyEditorState> {
    setPage(page: IPageHost | null): void {
        super.setPage(page);
        if (page) {
            this.secondaryEditor = ["my-panel"];  // setter manages registration
        }
    }
}
```

Register the panel React component in `/src/renderer/ui/navigation/secondary-editor-registry.ts`.

## Testing Your Editor

1. **Open by file extension:** create a file with your extension and verify it opens correctly
2. **Session restore:** close and reopen the app — the page should restore with content + state intact
3. **Editor switch (text-bearing only):** open the file in Monaco, switch to your editor via the toolbar dropdown, then back — verify content + modifications survive
4. **Multiple instances:** open multiple files of your type in different tabs
5. **Edge cases:** empty file, large file, file with parse errors

## Checklist

- [ ] `MyEditor` extends `EditorModel<MyEditorState>` with a unique `editorId`
- [ ] Constructor calls `super()` with a `TOneState` seeded from `IEditorState` fields
- [ ] `restore()` handles the initial async load (returns immediately if nothing to load)
- [ ] `getDescriptor()` returns persisted state (stripped of runtime-only fields)
- [ ] `dispose()` calls `super.dispose()` and cleans up subscriptions / sub-models
- [ ] For text-bearing editors: implements `IContentHostTrait` and registers `CONTENT_HOST_TRAIT`
- [ ] For text-bearing editors: `inheritContentHost(host)` does NOT recreate state if the host has content already
- [ ] `EditorModule` exports all required fields (`id`, `name`, `Editor`, `create`, optional matchers)
- [ ] Registered via `editorRegistry.register(...)` in `register-editors.ts`
- [ ] `accepts()` returns appropriate priority (see priority guide)
- [ ] Async import in the registration factory preserves code splitting
- [ ] Error states and loading states are handled in the React component
- [ ] (Optional) Scripting facade added with type declaration

## Examples

- **Simple viewer:** `/src/renderer/editors/pdf/` — read-only PDF viewer, no content host
- **Text-bearing minimal:** `/src/renderer/editors/html/` — HTML preview, composes IContentHost + trait
- **Text-bearing complex:** `/src/renderer/editors/grid/` — JSON/CSV grid editor with full edit/save flow
- **Per-note embedding:** `/src/renderer/editors/notebook/note-editor/` — Notebook embeds text-bearing editors per-note via `NoteItemEditModel` (a non-file IContentHost)
- **No-host with sidebar:** `/src/renderer/editors/explorer/` — Explorer sidebar editor with no main content area
- **Multi-process editor:** `/src/renderer/editors/browser/` — webview-based browser spanning three processes ([architecture doc](../architecture/browser-editor.md))
