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
File Path → resolveEditor() → Editor Type → Load Module → Render
```

Resolution priority:
1. Filename pattern (e.g., `*.grid.json`)
2. File extension (e.g., `.pdf`)
3. Default to text editor

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

### Step 5: Register in RenderEditor

```typescript
// app/RenderEditor.tsx
const getMyModule = async () =>
    (await import("../editors/myeditor")).default;

// In switch statement:
case "myType":
  return <AsyncEditor getEditorModule={getMyModule} model={model} />;
```

### Step 6: Update page-factory.ts

Add handling for the new page type.

## Editor Switching

Some editors support switching views (e.g., JSON → Grid view):

```typescript
// In TextToolbar.tsx
const switchOptions = getLanguageSwitchOptions(language);

// Available editors for language
if (switchOptions.options.length > 1) {
  // Render switch buttons
}
```

The `page.editor` property controls which editor renders the content.

## Future: Editor Registry

Currently editor resolution uses functions. Future improvement will use a declarative registry:

```typescript
editorRegistry.register({
  id: 'myeditor',
  name: 'My Editor',
  extensions: ['.myext'],
  priority: 10,
  loadModule: () => import('./myeditor'),
});
```

See `/doc/tasks/` for the Editor Registry task.
