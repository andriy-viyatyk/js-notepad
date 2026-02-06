# Editor System Architecture

## Overview

The editor system handles different file types with specialized viewers/editors. Each editor:
- Has its own `PageModel` for state management
- Renders a specific UI for the file type
- Can be loaded asynchronously for code splitting

## Editor Types

| Editor | File Types | Description |
|--------|------------|-------------|
| **Text** | `*` (all) | Monaco-based text editor (default) |
| **Grid JSON** | `.json`, `*.grid.json` | Tabular JSON viewer/editor |
| **Grid CSV** | `.csv`, `*.grid.csv` | CSV viewer/editor |
| **Markdown** | `.md`, `.markdown` | Rendered markdown preview |
| **PDF** | `.pdf` | PDF viewer (read-only) |
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
├── TextFileModel         # Text editor with Monaco
├── GridPageModel         # Grid editor for JSON/CSV
├── PdfViewerModel        # PDF viewer (read-only)
└── [Future models...]
```

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

Add registration in `/editors/register-editors.ts`:

```typescript
editorRegistry.register({
    id: "my-editor",           // Must match PageEditor type
    name: "My Editor",         // Display name in UI
    pageType: "myType",        // PageType this editor creates
    extensions: [".myext"],    // File extensions to handle
    languageIds: ["mylang"],   // Monaco language IDs (for editor switching)
    priority: 50,              // Higher = preferred when multiple match
    loadModule: async () => {
        const module = await import("./myeditor");
        return module.default;
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
editorRegistry.resolve(filePath)                 // Resolve editor for file
editorRegistry.resolveId(filePath)               // Resolve just the editor ID
editorRegistry.getAlternatives(languageId)       // Get editors for language
editorRegistry.validateForLanguage(editor, lang) // Validate editor/language
editorRegistry.getSwitchOptions(languageId)      // Get UI switch options
```

For complete guide, see [Editor Creation Guide](/doc/standards/editor-guide.md).
