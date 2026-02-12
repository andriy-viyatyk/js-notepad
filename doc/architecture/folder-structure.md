# Folder Structure

Detailed organization of the codebase.

## Root Structure

```
js-notepad/
├── src/                    # Source code
│   ├── main/               # Electron main process
│   ├── renderer/           # React frontend
│   ├── ipc/                # IPC communication
│   ├── shared/             # Shared code
│   └── preload.ts          # Preload script
├── assets/                 # Static assets
├── patches/                # Dependency patches
├── doc/                    # Developer documentation
└── docs/                   # User documentation
```

## Renderer Structure

```
/src/renderer/
│
├── app/                    # Application Shell
│   ├── MainPage.tsx        # Root component
│   ├── Pages.tsx           # Page container/router
│   ├── RenderEditor.tsx    # Editor dispatcher
│   ├── AsyncEditor.tsx     # Async editor loader
│   ├── EventHandler.tsx    # Global event handling
│   └── index.ts
│
├── core/                   # Core Infrastructure
│   ├── state/              # State management primitives
│   │   ├── state.ts        # TOneState, TComponentState, TGlobalState
│   │   ├── model.ts        # TModel, TDialogModel, TComponentModel
│   │   ├── events.ts       # Event subscription system
│   │   ├── view.ts         # View registry (dialogs/poppers)
│   │   └── index.ts
│   ├── services/           # Application services
│   │   ├── encryption.ts   # File encryption/decryption
│   │   ├── file-watcher.ts # File change detection
│   │   ├── scripting/      # Script execution
│   │   │   ├── ScriptRunner.ts
│   │   │   ├── ScriptContext.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── utils/              # Utility functions
│   │   ├── csv-utils.ts
│   │   ├── node-utils.ts
│   │   ├── parse-utils.ts
│   │   ├── obj-path.ts
│   │   ├── memorize.ts
│   │   ├── utils.ts
│   │   ├── monaco-languages.ts
│   │   └── index.ts
│   └── index.ts
│
├── store/                  # Application State
│   ├── pages-store.ts      # Page/tab management
│   ├── files-store.ts      # File I/O, caching
│   ├── app-settings.ts     # User preferences
│   ├── recent-files.ts     # Recent files list
│   ├── menu-folders.ts     # Sidebar bookmarks
│   ├── page-factory.ts     # Page model creation
│   ├── language-mapping.ts # Language utilities
│   └── index.ts
│
├── editors/                # Editor Implementations
│   ├── base/               # Shared editor infrastructure
│   │   ├── PageModel.ts
│   │   ├── EditorToolbar.tsx
│   │   ├── EditorConfigContext.tsx
│   │   ├── EditorStateStorageContext.tsx
│   │   ├── LanguageIcon.tsx
│   │   └── index.ts
│   ├── text/               # Monaco text editor
│   │   ├── TextPageView.tsx
│   │   ├── TextPageModel.ts
│   │   ├── TextEditor.tsx
│   │   ├── TextToolbar.tsx
│   │   ├── TextFooter.tsx
│   │   ├── ScriptPanel.tsx
│   │   ├── EncryptionPanel.tsx
│   │   ├── ActiveEditor.tsx
│   │   └── index.ts
│   ├── grid/               # JSON/CSV grid editor
│   │   ├── GridEditor.tsx
│   │   ├── GridPageModel.ts
│   │   ├── components/
│   │   ├── utils/
│   │   └── index.ts
│   ├── markdown/           # Markdown preview
│   │   ├── MarkdownView.tsx
│   │   └── index.ts
│   ├── pdf/                # PDF viewer
│   │   ├── PdfViewer.tsx
│   │   └── index.ts
│   ├── image/              # Image viewer
│   │   ├── ImageViewer.tsx
│   │   └── index.ts
│   ├── notebook/           # Notebook editor (.note.json)
│   │   ├── NotebookEditor.tsx
│   │   ├── NotebookEditorModel.ts
│   │   ├── NoteItemView.tsx
│   │   ├── NoteItemViewModel.ts
│   │   ├── ExpandedNoteView.tsx
│   │   ├── notebookTypes.ts
│   │   ├── note-editor/    # Note item sub-editor
│   │   └── index.ts
│   ├── mermaid/            # Mermaid diagram preview
│   │   ├── MermaidView.tsx
│   │   └── index.ts
│   ├── compare/            # Diff editor
│   │   ├── CompareEditor.tsx
│   │   └── index.ts
│   ├── registry.ts         # Editor resolution
│   ├── types.ts            # Editor interfaces
│   └── index.ts
│
├── components/             # Reusable UI Components
│   ├── basic/              # Atomic components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── TextField.tsx
│   │   ├── TextAreaField.tsx
│   │   ├── PathInput.tsx
│   │   ├── Breadcrumb.tsx
│   │   ├── TagsList.tsx
│   │   ├── Chip.tsx
│   │   ├── Tooltip.tsx
│   │   ├── CircularProgress.tsx
│   │   └── index.ts
│   ├── form/               # Form controls
│   │   ├── ComboSelect.tsx
│   │   ├── SwitchButtons.tsx
│   │   ├── ListMultiselect.tsx
│   │   └── index.ts
│   ├── layout/             # Layout helpers
│   │   ├── Splitter.tsx
│   │   ├── CollapsiblePanelStack.tsx
│   │   ├── Elements.tsx
│   │   └── index.ts
│   ├── TreeView/           # Virtualized tree component
│   │   ├── TreeView.tsx
│   │   ├── TreeView.model.ts
│   │   ├── CategoryTree.tsx
│   │   └── index.ts
│   ├── overlay/            # Floating UI
│   │   ├── Popper.tsx
│   │   ├── PopupMenu.tsx
│   │   ├── WithPopupMenu.tsx
│   │   └── index.ts
│   ├── virtualization/     # Base virtualization
│   │   ├── RenderGrid/
│   │   └── index.ts
│   ├── data-grid/          # Advanced data grid
│   │   ├── AVGrid/
│   │   └── index.ts
│   └── index.ts
│
├── features/               # App-Specific Features
│   ├── tabs/               # Tab management
│   │   ├── PageTabs.tsx
│   │   ├── PageTab.tsx
│   │   └── index.ts
│   ├── sidebar/            # Sidebar/menu
│   │   ├── MenuBar.tsx
│   │   ├── FileExplorer.tsx
│   │   ├── FileList.tsx
│   │   ├── RecentFileList.tsx
│   │   ├── OpenTabsList.tsx
│   │   └── index.ts
│   ├── dialogs/            # Application dialogs
│   │   ├── Dialogs.tsx
│   │   ├── ConfirmationDialog.tsx
│   │   ├── InputDialog.tsx
│   │   ├── alerts/
│   │   └── index.ts
│   └── index.ts
│
├── theme/                  # Styling
│   ├── color.ts
│   ├── GlobalStyles.tsx
│   ├── icons.tsx
│   └── language-icons.tsx
│
├── setup/                  # Configuration
│   ├── configure-monaco.ts
│   └── monaco-languages/
│
├── types/                  # Global Type Declarations
│   ├── window.d.ts         # Window interface extension
│   └── events.d.ts         # MouseEvent extension
│
└── index.tsx               # Entry point
```

## When to Create New Folders

| Scenario | Location |
|----------|----------|
| New editor type | `/editors/[name]/` |
| Reusable UI component | `/components/[category]/` |
| App-specific feature | `/features/[name]/` |
| New service | `/core/services/` |
| New utility | `/core/utils/` |
| New store | `/store/` |

## Import Conventions

```typescript
// Prefer specific imports for deeply nested modules
import { Button } from "../../components/basic/Button";

// Use barrel imports for related items from same module
import { pagesModel, filesModel } from "../../store";

// Exception: avoid barrel imports that cause circular dependencies
import { pagesModel } from "../../store/pages-store"; // Direct import
```
