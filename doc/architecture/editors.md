# Editor System Architecture

## Overview

The editor system handles different file types with specialized viewers/editors. Each editor:
- Has its own `PageModel` for state management
- Renders a specific UI for the file type
- Can be loaded asynchronously for code splitting

## Editor Categories

Editors are divided into two categories based on how they integrate with the application:

### Content Views (`category: "content-view"`)

Views of text-based content that share `TextFileModel` for state management.

| Editor | Description |
|--------|-------------|
| **monaco** | Monaco text editor (default) |
| **grid-json** | Tabular JSON viewer/editor |
| **grid-csv** | CSV viewer/editor |
| **md-view** | Rendered markdown preview |
| **svg-view** | Rendered SVG preview |
| **notebook-view** | Structured notes editor for `.note.json` files |

**Characteristics:**
- Rendered inside `TextPageView` via `ActiveEditor` component
- Share toolbar, script panel, footer, and encryption panel
- Can switch between each other (e.g., JSON text → Grid view)
- Use `TextFileModel` - no separate PageModel needed
- `switchOption()` function controls when editor appears in switch dropdown

### Page Editors (`category: "page-editor"`)

Standalone editors with their own PageModel for non-text file formats.

| Editor | Description |
|--------|-------------|
| **pdf-view** | PDF viewer (read-only) |
| **image-view** | Image viewer (PNG, JPG, GIF, WEBP, BMP, ICO) |

**Characteristics:**
- Rendered instead of `TextPageView` by `RenderEditor`
- Have their own PageModel subclass (e.g., `PdfViewerModel`)
- Handle their own UI entirely (no shared toolbar/script panel)
- Each has a unique `pageType` (e.g., "pdfFile")

### Architecture Diagram

```
RenderEditor
├── [page-editor] → AsyncEditor → PdfViewer / ImageViewer (own PageModel)
└── [content-view] → TextPageView
                         ├── TextToolbar
                         ├── ActiveEditor → Monaco / Grid / Markdown / Notebook
                         ├── ScriptPanel
                         ├── TextFooter
                         └── EditorOverlay (portal target for expanded note)
```

## Editor Types

| Editor | File Types | Description |
|--------|------------|-------------|
| **Text** | `*` (all) | Monaco-based text editor (default) |
| **Grid JSON** | `.json`, `*.grid.json` | Tabular JSON viewer/editor |
| **Grid CSV** | `.csv`, `*.grid.csv` | CSV viewer/editor |
| **Markdown** | `.md`, `.markdown` | Rendered markdown preview |
| **Image** | `.png`, `.jpg`, `.gif`, `.webp`, `.bmp`, `.ico` | Image viewer |
| **SVG** | `.svg` | SVG preview (content-view, Monaco default) |
| **PDF** | `.pdf` | PDF viewer (read-only) |
| **Notebook** | `*.note.json` | Structured notes with categories, tags, search |
| **Compare** | (triggered) | Side-by-side diff view |

## Editor Resolution

When a file is opened:

```
File Path → editorRegistry.resolve() → EditorDefinition → loadModule() → Render
```

Resolution priority (higher priority wins):
1. Filename patterns (e.g., `*.grid.json`) - priority 10
2. File extensions (e.g., `.pdf`) - priority 100
3. Default to monaco text editor - priority 0

All editor registration is in `/editors/register-editors.ts`.

## Editor Structure

Every editor follows this pattern:

```
/editors/[name]/
├── index.ts              # Public exports + EditorModule
├── [Name]Editor.tsx      # Main component (or [Name]View.tsx)
├── [Name]PageModel.ts    # State and business logic
├── [Name]Toolbar.tsx     # Editor-specific toolbar (optional)
├── components/           # Editor-specific components (optional)
└── utils/                # Editor-specific utilities (optional)
```

### EditorModule Interface

```typescript
interface EditorModule {
  Editor: React.ComponentType<{ model: PageModel }>;
  newPageModel(filePath?: string): Promise<PageModel>;
  newEmptyPageModel(pageType: PageType): Promise<PageModel | null>;
  newPageModelFromState(state: Partial<IPage>): Promise<PageModel>;
}
```

## PageModel Hierarchy

```
PageModel (abstract)
├── TextFileModel         # Content views (Monaco, Grid, Markdown)
├── PdfViewerModel        # PDF viewer (page-editor)
├── ImageViewerModel      # Image viewer (page-editor)
└── [Future page-editors...]

TComponentModel (for view-specific state)
├── GridPageModel         # Grid view state (columns, filters, etc.)
├── MarkdownViewModel     # Markdown view state (scroll position)
├── NotebookEditorModel   # Notebook state (notes, categories, tags, filters)
└── [Future view models...]
```

Note: Content views like Grid and Markdown use `TextFileModel` for content management,
but may have their own `TComponentModel` for view-specific state (not page state).

### PageModel Base

```typescript
class PageModel<T extends IPage, R = any> {
  state: TComponentState<T>;

  get id(): string;
  get type(): PageType;

  // Lifecycle
  restore(): Promise<void>;
  saveState(): Promise<void>;
  getRestoreData(): Partial<T>;
  applyRestoreData(data: Partial<T>): void;

  // Language
  changeLanguage(language: string): void;
}
```

## Adding a New Editor

### Step 1: Create Editor Folder

```
/editors/myeditor/
├── index.ts
├── MyEditor.tsx
└── MyPageModel.ts
```

### Step 2: Implement PageModel

```typescript
// MyPageModel.ts
import { PageModel, getDefaultPageModelState } from "../base";

interface MyPageModelState extends IPage {
  // Custom state...
}

export class MyPageModel extends PageModel<MyPageModelState> {
  // Implementation...
}

export function newMyPageModel(filePath?: string): MyPageModel {
  // Factory function
}
```

### Step 3: Implement Editor Component

```typescript
// MyEditor.tsx
interface MyEditorProps {
  model: MyPageModel;
}

export function MyEditor({ model }: MyEditorProps) {
  const state = model.state.use();
  return <div>...</div>;
}
```

### Step 4: Create EditorModule

```typescript
// index.ts
import { EditorModule } from "../types";
import { MyEditor } from "./MyEditor";
import { MyPageModel, newMyPageModel } from "./MyPageModel";

const myEditorModule: EditorModule = {
  Editor: MyEditor,
  newPageModel: async (filePath) => newMyPageModel(filePath),
  newEmptyPageModel: async (pageType) => {
    if (pageType === "myType") {
      return newMyPageModel();
    }
    return null;
  },
  newPageModelFromState: async (state) => {
    return new MyPageModel(new TComponentState({
      ...getDefaultMyState(),
      ...state,
    }));
  },
};

export default myEditorModule;
export { MyEditor, MyPageModel };
```

### Step 5: Register in EditorRegistry

Add registration in `/editors/register-editors.ts`. Editors use function-based matching for full control:

```typescript
// For a standalone page editor (like PDF, Image viewer):
editorRegistry.register({
    id: "my-editor",           // Must match PageEditor type
    name: "My Editor",         // Display name in UI
    pageType: "myType",        // PageType this editor creates
    category: "page-editor",   // Standalone editor with own PageModel
    acceptFile: (fileName) => {
        // Return priority >= 0 if editor can open file, -1 otherwise
        if (fileName.toLowerCase().endsWith(".myext")) return 50;
        return -1;
    },
    loadModule: async () => {
        const module = await import("./myeditor");
        return module.default;
    },
});

// For a content view (alternative view of text content):
editorRegistry.register({
    id: "my-view",
    name: "My View",
    pageType: "textFile",      // Uses TextFileModel
    category: "content-view",  // Rendered inside TextPageView
    validForLanguage: (languageId) => languageId === "mylang",
    switchOption: (languageId) => {
        // Return priority >= 0 to show in switch dropdown, -1 to hide
        if (languageId !== "mylang") return -1;
        return 10;
    },
    loadModule: async () => {
        const module = await import("./myview");
        return {
            Editor: module.MyView,
            newPageModel: textEditorModule.newPageModel,  // Reuse text model
            newEmptyPageModel: textEditorModule.newEmptyPageModel,
            newPageModelFromState: textEditorModule.newPageModelFromState,
        };
    },
});
```

### Step 6: Add Types (if new)

Add to `/shared/types.ts`:

```typescript
export type PageType = 'textFile' | 'pdfFile' | 'myType';
export type PageEditor = 'monaco' | 'grid-json' | ... | 'my-editor';
```

## Editor Switching

Some editors support switching views (e.g., JSON → Grid view):

```typescript
// In TextToolbar.tsx
const switchOptions = editorRegistry.getSwitchOptions(language);

// Available editors for language
if (switchOptions.options.length > 1) {
  // Render switch buttons
}
```

The `page.editor` property controls which editor renders the content.

## EditorRegistry API

```typescript
editorRegistry.register(definition)              // Register an editor
editorRegistry.getById(id)                       // Get editor by ID
editorRegistry.getAll()                          // Get all registered editors
editorRegistry.resolve(filePath)                 // Resolve editor for file (calls acceptFile)
editorRegistry.resolveId(filePath)               // Resolve just the editor ID
editorRegistry.validateForLanguage(editor, lang) // Validate editor/language (calls validForLanguage)
editorRegistry.getSwitchOptions(lang, filePath)  // Get UI switch options (calls switchOption)
```

For complete guide, see [Editor Creation Guide](/doc/standards/editor-guide.md).
