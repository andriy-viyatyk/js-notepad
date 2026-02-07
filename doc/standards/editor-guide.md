# Editor Creation Guide

> Read this before creating a new editor type.

## Prerequisites

Read these first:
- [Architecture Overview](../architecture/overview.md)
- [Editor System](../architecture/editors.md)

## Step-by-Step Guide

### Step 1: Plan Your Editor

Answer these questions:
- What file types will it handle?
- Is it read-only (viewer) or editable?
- Does it need custom toolbar actions?
- Will it reuse existing components?

### Step 2: Create Folder Structure

```
/src/renderer/editors/myeditor/
├── index.ts              # EditorModule + exports
├── MyEditor.tsx          # Main component
├── MyPageModel.ts        # State management
├── MyToolbar.tsx         # (optional) Custom toolbar
└── components/           # (optional) Editor-specific components
    └── MyComponent.tsx
```

### Step 3: Implement PageModel

```typescript
// MyPageModel.ts
import { TComponentState } from '../../core/state/state';
import { PageModel, getDefaultPageModelState } from '../base';
import { IPage, PageType } from '../../../shared/types';

// 1. Define state interface
export interface MyPageModelState extends IPage {
  // Add editor-specific state
  customData: string;
  isLoading: boolean;
}

// 2. Default state factory
export const getDefaultMyPageModelState = (): MyPageModelState => ({
  ...getDefaultPageModelState(),
  type: 'myType' as PageType,  // Add to shared/types.ts
  customData: '',
  isLoading: false,
});

// 3. PageModel class
export class MyPageModel extends PageModel<MyPageModelState> {
  // For read-only viewers, set this
  // noLanguage = true;

  // Restore from saved state
  async restore(): Promise<void> {
    const { filePath } = this.state.get();
    if (filePath) {
      this.state.update((s) => { s.isLoading = true; });

      // Load your content
      // const content = await loadContent(filePath);

      this.state.update((s) => {
        s.isLoading = false;
        // s.customData = content;
      });
    }
  }

  // Data to persist for session restore
  getRestoreData(): Partial<MyPageModelState> {
    const { customData, isLoading, ...pageData } = this.state.get();
    return pageData;
  }

  // Custom methods
  doSomething = () => {
    this.state.update((s) => {
      s.customData = 'modified';
    });
  };
}

// 4. Factory functions
export function newMyPageModel(filePath?: string): MyPageModel {
  const state = {
    ...getDefaultMyPageModelState(),
    ...(filePath ? { filePath } : {}),
  };
  return new MyPageModel(new TComponentState(state));
}
```

### Step 4: Implement Editor Component

```typescript
// MyEditor.tsx
import styled from '@emotion/styled';
import { MyPageModel } from './MyPageModel';
import { CircularProgress } from '../../components/basic/CircularProgress';

const EditorRoot = styled.div({
  flex: '1 1 auto',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

interface MyEditorProps {
  model: MyPageModel;
}

export function MyEditor({ model }: MyEditorProps) {
  const { customData, isLoading } = model.state.use((s) => ({
    customData: s.customData,
    isLoading: s.isLoading,
  }));

  if (isLoading) {
    return (
      <EditorRoot style={{ alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={24} />
      </EditorRoot>
    );
  }

  return (
    <EditorRoot>
      <div>Your editor content: {customData}</div>
    </EditorRoot>
  );
}
```

### Step 5: Create EditorModule

```typescript
// index.ts
import { TComponentState } from '../../core/state/state';
import { EditorModule } from '../types';
import { IPage, PageType } from '../../../shared/types';
import { MyEditor } from './MyEditor';
import {
  MyPageModel,
  getDefaultMyPageModelState,
} from './MyPageModel';

const myEditorModule: EditorModule = {
  Editor: MyEditor,

  newPageModel: async (filePath?: string) => {
    const state = {
      ...getDefaultMyPageModelState(),
      ...(filePath ? { filePath } : {}),
    };
    const model = new MyPageModel(new TComponentState(state));
    await model.restore();
    return model;
  },

  newEmptyPageModel: async (pageType: PageType) => {
    if (pageType === 'myType') {
      return new MyPageModel(
        new TComponentState(getDefaultMyPageModelState())
      );
    }
    return null;
  },

  newPageModelFromState: async (state: Partial<IPage>) => {
    const initialState = {
      ...getDefaultMyPageModelState(),
      ...state,
    };
    const model = new MyPageModel(new TComponentState(initialState));
    await model.restore();
    return model;
  },
};

export default myEditorModule;

// Named exports
export { MyEditor, MyPageModel };
export type { MyPageModelState } from './MyPageModel';
```

### Step 6: Register Your Editor

All editor registration happens in `/editors/register-editors.ts`. This is the only file you need to modify to add a new editor.

#### 6a. Add PageType and PageEditor (if new)

```typescript
// /shared/types.ts
export type PageType = 'textFile' | 'pdfFile' | 'myType';
export type PageEditor = 'monaco' | 'grid-json' | 'grid-csv' | 'md-view' | 'pdf-view' | 'my-editor';
```

#### 6b. Register in EditorRegistry

Editors use function-based matching for full control over when they apply:

```typescript
// /editors/register-editors.ts
import { editorRegistry } from "./registry";

// For a standalone page editor (like PDF, Image viewer):
editorRegistry.register({
    id: "my-editor",           // Must match PageEditor type
    name: "My Editor",         // Display name in UI
    pageType: "myType",        // PageType this editor creates
    category: "page-editor",   // Standalone editor with own PageModel
    acceptFile: (fileName) => {
        // Return priority >= 0 if this editor can open the file
        // Higher priority wins when multiple editors match
        if (fileName.toLowerCase().endsWith(".myext")) return 50;
        return -1;  // -1 means not applicable
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
    switchOption: (languageId, fileName) => {
        // Return priority >= 0 to show in view switch dropdown
        // Lower priority appears first (monaco should be 0)
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

#### Registration Options

| Property | Description |
|----------|-------------|
| `id` | Unique editor ID (must be in `PageEditor` type) |
| `name` | Display name shown in UI |
| `pageType` | The `PageType` this editor works with |
| `category` | `"page-editor"` or `"content-view"` |
| `acceptFile(fileName)` | Returns priority >= 0 if editor can open file, -1 otherwise |
| `validForLanguage(languageId)` | Returns true if editor is valid for the language |
| `switchOption(languageId, fileName)` | Returns priority >= 0 to show in switch dropdown, -1 to hide |
| `loadModule` | Async function returning `EditorModule` |

#### Priority Guidelines

- `0` - Fallback editors (monaco text editor)
- `10` - Alternative views (markdown preview, grid view)
- `20` - Specialized text editors (e.g., *.grid.json opens in grid)
- `50` - Standard editors for specific file types
- `100` - Exclusive editors (PDF viewer, image viewer)

### Step 7: Add Toolbar (Optional)

```typescript
// MyToolbar.tsx
import { Button } from '../../components/basic/Button';
import { MyPageModel } from './MyPageModel';

interface MyToolbarProps {
  model: MyPageModel;
}

export function MyToolbar({ model }: MyToolbarProps) {
  return (
    <>
      <Button onClick={model.doSomething}>
        Do Something
      </Button>
    </>
  );
}
```

Then use in your editor or integrate with EditorToolbar.

## Testing Your Editor

1. **Open by file extension**: Create a file with your extension
2. **Session restore**: Close and reopen the app
3. **Multiple instances**: Open multiple files
4. **Edge cases**: Empty file, large file, corrupt file

## Checklist

- [ ] PageModel implements `restore()`
- [ ] PageModel implements `getRestoreData()`
- [ ] EditorModule exports all required functions
- [ ] Registered in `register-editors.ts`
- [ ] PageType added to `shared/types.ts` (if new page type)
- [ ] PageEditor added to `shared/types.ts` (if new editor)
- [ ] Async import used in `loadModule` (code splitting)
- [ ] Error states handled
- [ ] Loading states handled

## Examples

- **Simple viewer**: See `/editors/pdf/` - read-only PDF viewer
- **Complex editor**: See `/editors/text/` - full text editor
- **Grid view**: See `/editors/grid/` - tabular data editor
