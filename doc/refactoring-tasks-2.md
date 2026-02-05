# Refactoring Tasks - Phase 2: Architectural Improvements

This document tracks architectural improvements proposed in `proposed-structure.md` that go beyond folder reorganization. These tasks involve code/logic changes to improve extensibility and maintainability.

**Prerequisites:** Phase 1 (folder reorganization) must be complete.

**Legend:**
- [ ] Not started
- [x] Completed
- 🔄 In progress

---

## Overview

Phase 1 (completed) focused on **moving files** to new folder structure without significant code changes.

Phase 2 focuses on **architectural improvements**:
1. **Fix Circular Dependencies** - resolve Rollup warnings from barrel exports
2. Editor Registry Pattern - declarative editor registration
3. ContentPageModel - shared base for content editors
4. Page Grouping Separation - dedicated store for split view
5. Script Service Enhancements - hooks and toolbar builder
6. RenderEditor Refactoring - use registry instead of switch

---

## Phase 2.0: Fix Circular Dependencies (Quick Win)

**Goal:** Resolve Rollup circular dependency warnings that appeared after refactoring.

**Problem:** Barrel exports (`index.ts` files) create circular dependency chains when modules import from each other through the barrel. Rollup warns about this during build.

**Impact:** Not critical (build works, app runs), but good to fix for:
- Cleaner build output
- Better tree-shaking
- Avoid potential subtle bugs
- Future Rollup compatibility

**Solution:** Change imports to point directly to source modules instead of barrel exports in affected files.

### 2.0.1 Fix ScriptContext Circular Dependencies
- [ ] **Task 2.0.1.1**: In `core/services/scripting/ScriptContext.ts`:
  - Change `import { isTextFileModel } from "../../../editors/text"`
  - To `import { isTextFileModel } from "../../../editors/text/TextPageModel"`
- [ ] **Task 2.0.1.2**: In `core/services/scripting/ScriptContext.ts`:
  - Change `import { pagesModel } from "../../../store"`
  - To `import { pagesModel } from "../../../store/pages-store"`

### 2.0.2 Fix ScriptRunner Circular Dependencies
- [ ] **Task 2.0.2.1**: In `core/services/scripting/ScriptRunner.ts`:
  - Change `import { pagesModel } from "../../../store"`
  - To `import { pagesModel } from "../../../store/pages-store"`

### 2.0.3 Fix Grid Editor Circular Dependencies
- [ ] **Task 2.0.3.1**: In `editors/grid/GridPageModel.ts`:
  - Change `import { pagesModel, ... } from "../../store"`
  - To `import { pagesModel } from "../../store/pages-store"` (keep other imports from barrel if not circular)
- [ ] **Task 2.0.3.2**: In `editors/grid/GridEditor.tsx`:
  - Change `import { pagesModel } from "../../store"`
  - To `import { pagesModel } from "../../store/pages-store"`

### 2.0.4 Fix Markdown Editor Circular Dependencies
- [ ] **Task 2.0.4.1**: In `editors/markdown/MarkdownView.tsx`:
  - Change `import { pagesModel } from "../../store"`
  - To `import { pagesModel } from "../../store/pages-store"`

### 2.0.5 Verify Fix
- [ ] **Task 2.0.5.1**: Run `npm run make` and verify no circular dependency warnings
- [ ] **Task 2.0.5.2**: Test application works correctly

---

## Phase 2.1: Editor Registry Pattern

**Goal:** Replace procedural editor resolution with declarative registry pattern.

**Current State:**
- `registry.ts` has simple functions: `resolveEditor()`, `validateEditorForLanguage()`, `getLanguageSwitchOptions()`
- `RenderEditor.tsx` uses switch statement to render editors
- Adding new editor requires changes in multiple files

**Target State:**
- `EditorRegistry` class with `register()` method
- Editors self-register with metadata (extensions, priority, loader)
- `RenderEditor` uses registry to resolve and load editors
- Adding new editor requires only registration call

### 2.1.1 Create EditorRegistry Class
- [ ] **Task 2.1.1.1**: Define `EditorDefinition` interface in `editors/types.ts`
  ```typescript
  interface EditorDefinition {
    id: string;                    // e.g., "text", "grid-json", "pdf"
    name: string;                  // Display name
    pageType: PageType;            // Page type this editor handles
    extensions?: string[];         // File extensions (e.g., [".pdf"])
    filenamePatterns?: RegExp[];   // Filename patterns (e.g., /\.grid\.json$/)
    languagePatterns?: string[];   // Language IDs (e.g., ["json", "csv"])
    priority: number;              // Resolution priority (higher = preferred)
    alternativeEditors?: string[]; // Editors this can switch to
    loadModule: () => Promise<EditorModule>;
  }
  ```
- [ ] **Task 2.1.1.2**: Create `EditorRegistry` class in `editors/registry.ts`
  - `register(definition: EditorDefinition): void`
  - `resolve(filePath: string, language?: string): EditorDefinition`
  - `getById(id: string): EditorDefinition | undefined`
  - `getAlternatives(id: string, language: string): EditorDefinition[]`
- [ ] **Task 2.1.1.3**: Export singleton `editorRegistry` instance

### 2.1.2 Register Existing Editors
- [ ] **Task 2.1.2.1**: Register text editor (priority: 0, fallback for all files)
- [ ] **Task 2.1.2.2**: Register grid-json editor (priority: 10, `.json` + `*.grid.json`)
- [ ] **Task 2.1.2.3**: Register grid-csv editor (priority: 10, `.csv` + `*.grid.csv`)
- [ ] **Task 2.1.2.4**: Register markdown editor (priority: 10, `.md`, `.markdown`)
- [ ] **Task 2.1.2.5**: Register pdf editor (priority: 100, `.pdf`)

### 2.1.3 Update RenderEditor to Use Registry
- [ ] **Task 2.1.3.1**: Refactor `RenderEditor.tsx` to use `editorRegistry.resolve()`
- [ ] **Task 2.1.3.2**: Remove hardcoded switch statement
- [ ] **Task 2.1.3.3**: Use `AsyncEditor` pattern for all editors

### 2.1.4 Update Editor Switching
- [ ] **Task 2.1.4.1**: Refactor `getLanguageSwitchOptions()` to use registry
- [ ] **Task 2.1.4.2**: Use `alternativeEditors` from registry definitions
- [ ] **Task 2.1.4.3**: Update `TextToolbar` to use new API

### 2.1.5 Cleanup
- [ ] **Task 2.1.5.1**: Remove old `resolveEditor()` function
- [ ] **Task 2.1.5.2**: Remove old `validateEditorForLanguage()` if no longer needed
- [ ] **Task 2.1.5.3**: Update page-factory to use registry for model creation
- [ ] **Task 2.1.5.4**: Verify all editor scenarios work correctly

---

## Phase 2.2: ContentPageModel Base Class

**Goal:** Extract common file/content handling from TextFileModel into reusable base class.

**Current State:**
- `TextFileModel` contains all file I/O, encryption, caching, file watching logic
- `GridPageModel` partially reuses by composing with text page
- Future editors (Notebook, ToDo, Bookmarks) would need to duplicate this

**Target State:**
- `ContentPageModel` base class handles:
  - File I/O (read, write, auto-save)
  - Content state management
  - Modification tracking (`modified`, `temp`)
  - File watching for external changes
  - Encryption support
  - Script context exposure
- `TextFileModel` extends `ContentPageModel`, adds language/Monaco specifics
- `GridPageModel` extends `ContentPageModel`, adds grid-specific logic

### 2.2.1 Create ContentPageModel
- [ ] **Task 2.2.1.1**: Create `editors/base/ContentPageModel.ts`
- [ ] **Task 2.2.1.2**: Extract file I/O logic from TextFileModel
  - `filePath`, `encoding`, `modified`, `temp`, `deleted` state
  - `saveFile()`, `renameFile()` methods
  - File caching (`saveCacheFile`, `getCacheFile`, `deleteCacheFile`)
- [ ] **Task 2.2.1.3**: Extract file watching logic
  - `FileWatcher` integration
  - `onFileChanged()` handler
- [ ] **Task 2.2.1.4**: Extract encryption support
  - `encrypted`, `password` state
  - `mapContentToSave()`, `mapContentFromFile()` methods
  - `encrypt()`, `decrypt()` methods
- [ ] **Task 2.2.1.5**: Define abstract methods for subclasses
  - `parseContent(raw: string): void`
  - `serializeContent(): string`
- [ ] **Task 2.2.1.6**: Export from `editors/base/index.ts`

### 2.2.2 Refactor TextFileModel
- [ ] **Task 2.2.2.1**: Make TextFileModel extend ContentPageModel
- [ ] **Task 2.2.2.2**: Move text-specific logic only:
  - Language management
  - Monaco editor reference
  - Script panel
  - `runScript()` methods
- [ ] **Task 2.2.2.3**: Implement `parseContent()` and `serializeContent()`
- [ ] **Task 2.2.2.4**: Verify all text editor functionality works

### 2.2.3 Refactor GridPageModel
- [ ] **Task 2.2.3.1**: Make GridPageModel extend ContentPageModel
- [ ] **Task 2.2.3.2**: Remove composition with TextFileModel
- [ ] **Task 2.2.3.3**: Implement grid-specific `parseContent()` and `serializeContent()`
- [ ] **Task 2.2.3.4**: Verify JSON and CSV grid editors work correctly

### 2.2.4 Create ViewerPageModel (Optional)
- [ ] **Task 2.2.4.1**: Create `editors/base/ViewerPageModel.ts` for read-only viewers
- [ ] **Task 2.2.4.2**: Refactor PdfViewerModel to extend ViewerPageModel
- [ ] **Task 2.2.4.3**: Prepare for future ImageViewerModel

---

## Phase 2.3: Page Grouping Separation

**Goal:** Extract page grouping logic into dedicated store for better maintainability.

**Current State:**
- `pages-store.ts` contains both page collection management AND grouping logic
- Grouping logic: `groupPages()`, `ungroupPages()`, `getGroupedPage()`, `requireGroupedText()`

**Target State:**
- `pages-store.ts` - Page collection (open, close, reorder, show/hide)
- `page-grouping.ts` - Split view logic (group, ungroup, get grouped)

### 2.3.1 Create Page Grouping Store
- [ ] **Task 2.3.1.1**: Create `store/page-grouping.ts`
- [ ] **Task 2.3.1.2**: Extract grouping state: `groupedPages: Map<string, string>`
- [ ] **Task 2.3.1.3**: Extract grouping methods:
  - `groupPages(pageId1, pageId2)`
  - `ungroupPages(pageId)`
  - `getGroupedPage(pageId)`
  - `getLeftGroupedPage(pageId)`
  - `requireGroupedText(pageId, language?)`
- [ ] **Task 2.3.1.4**: Export from `store/index.ts`

### 2.3.2 Update Pages Store
- [ ] **Task 2.3.2.1**: Remove grouping logic from `pages-store.ts`
- [ ] **Task 2.3.2.2**: Import and use `pageGrouping` store where needed
- [ ] **Task 2.3.2.3**: Update references in components

### 2.3.3 Update Consumers
- [ ] **Task 2.3.3.1**: Update `ScriptContext.ts` to use page-grouping store
- [ ] **Task 2.3.3.2**: Update `ScriptRunner.ts` to use page-grouping store
- [ ] **Task 2.3.3.3**: Update `TextToolbar.tsx` compare mode
- [ ] **Task 2.3.3.4**: Update `Pages.tsx` rendering
- [ ] **Task 2.3.3.5**: Verify all grouping scenarios work

---

## Phase 2.4: Script Service Enhancements

**Goal:** Expand scripting capabilities with hooks and toolbar builder API.

**Current State:**
- `ScriptRunner.ts` - executes scripts
- `ScriptContext.ts` - provides `page` and `React` to scripts

**Target State:**
- `ScriptHooks.ts` - language/event hooks system
- `ToolbarBuilder.ts` - API for scripts to add toolbar items
- Expanded `ScriptContext` with `app` and `toolbar` namespaces

### 2.4.1 Script Hooks System
- [ ] **Task 2.4.1.1**: Create `core/services/scripting/ScriptHooks.ts`
- [ ] **Task 2.4.1.2**: Define hook types:
  - `onLanguageChange(language: string, script: string)`
  - `onFileOpen(filePath: string, script: string)`
  - `onFileSave(filePath: string, script: string)`
- [ ] **Task 2.4.1.3**: Create hooks registry and execution logic
- [ ] **Task 2.4.1.4**: Integrate with TextFileModel language change
- [ ] **Task 2.4.1.5**: Add UI for configuring hooks (future)

### 2.4.2 Toolbar Builder API
- [ ] **Task 2.4.2.1**: Create `core/services/scripting/ToolbarBuilder.ts`
- [ ] **Task 2.4.2.2**: Define toolbar API:
  ```typescript
  toolbar.addButton({ icon, label, onClick })
  toolbar.addCombobox({ options, value, onChange })
  toolbar.clear()
  ```
- [ ] **Task 2.4.2.3**: Connect to editor toolbar ref system
- [ ] **Task 2.4.2.4**: Add to ScriptContext

### 2.4.3 Expand ScriptContext
- [ ] **Task 2.4.3.1**: Add `app` namespace:
  ```typescript
  app.openFile(path: string): Promise<PageInterface>
  app.showAlert(message: string): void
  app.showConfirm(message: string): Promise<boolean>
  ```
- [ ] **Task 2.4.3.2**: Add `toolbar` namespace (from ToolbarBuilder)
- [ ] **Task 2.4.3.3**: Update ScriptContext.ts with new APIs
- [ ] **Task 2.4.3.4**: Document new script capabilities

---

## Phase 2.5: Compare Editor Improvements

**Goal:** Make compare editor a proper standalone editor with its own model.

**Current State:**
- `CompareEditor.tsx` exists but shares model with text pages
- Compare mode is a flag on TextFileModel

**Target State:**
- `ComparePageModel` - dedicated model for compare sessions
- Compare editor properly registered in registry
- Clear separation from text editor

### 2.5.1 Create ComparePageModel
- [ ] **Task 2.5.1.1**: Create `editors/compare/ComparePageModel.ts`
- [ ] **Task 2.5.1.2**: Define compare-specific state:
  - `leftPageId`, `rightPageId`
  - `diffMode` (inline vs side-by-side)
- [ ] **Task 2.5.1.3**: Handle compare session lifecycle
- [ ] **Task 2.5.1.4**: Export from `editors/compare/index.ts`

### 2.5.2 Register Compare Editor
- [ ] **Task 2.5.2.1**: Register compare in EditorRegistry (after 2.1 is done)
- [ ] **Task 2.5.2.2**: Define how compare mode is triggered (not file-based)
- [ ] **Task 2.5.2.3**: Update toolbar compare button logic

---

## Phase 2.6: Tool Editors Infrastructure (Future)

**Goal:** Prepare infrastructure for tool editors (Notebook, ToDo, Bookmarks).

**Note:** This phase is for future implementation when tool editors are needed.

### 2.6.1 Create Tools Folder Structure
- [ ] **Task 2.6.1.1**: Create `editors/tools/` folder
- [ ] **Task 2.6.1.2**: Create `editors/tools/notebook/` structure
- [ ] **Task 2.6.1.3**: Create `editors/tools/todo/` structure
- [ ] **Task 2.6.1.4**: Create `editors/tools/bookmarks/` structure

### 2.6.2 Implement Notebook Editor
- [ ] **Task 2.6.2.1**: Create `NotebookPageModel` extending ContentPageModel
- [ ] **Task 2.6.2.2**: Create `NotebookEditor.tsx` component
- [ ] **Task 2.6.2.3**: Register for `*.note.json` files
- [ ] **Task 2.6.2.4**: Implement note CRUD operations
- [ ] **Task 2.6.2.5**: Add categories/tags support
- [ ] **Task 2.6.2.6**: Add search functionality

### 2.6.3 Implement ToDo Editor
- [ ] **Task 2.6.3.1**: Create `TodoPageModel` extending ContentPageModel
- [ ] **Task 2.6.3.2**: Create `TodoEditor.tsx` component
- [ ] **Task 2.6.3.3**: Register for `*.todo.json` files
- [ ] **Task 2.6.3.4**: Implement todo list management

### 2.6.4 Implement Bookmarks Editor
- [ ] **Task 2.6.4.1**: Create `BookmarkPageModel` extending ContentPageModel
- [ ] **Task 2.6.4.2**: Create `BookmarkEditor.tsx` component
- [ ] **Task 2.6.4.3**: Register for `*.link.json` files
- [ ] **Task 2.6.4.4**: Implement bookmark management with categories

---

## Progress Summary

| Phase | Tasks | Completed | Status |
|-------|-------|-----------|--------|
| Phase 2.0: Circular Dependencies | 8 | 0 | Not started |
| Phase 2.1: Editor Registry | 17 | 0 | Not started |
| Phase 2.2: ContentPageModel | 14 | 0 | Not started |
| Phase 2.3: Page Grouping | 10 | 0 | Not started |
| Phase 2.4: Script Enhancements | 12 | 0 | Not started |
| Phase 2.5: Compare Editor | 6 | 0 | Not started |
| Phase 2.6: Tool Editors | 14 | 0 | Future |
| **Total** | **81** | **0** | **Not started** |

---

## Recommended Order

1. **Phase 2.0** (Circular Dependencies) - Quick win, fixes build warnings
2. **Phase 2.1** (Editor Registry) - Foundation for all other improvements
3. **Phase 2.2** (ContentPageModel) - Enables clean GridPageModel and future tools
4. **Phase 2.3** (Page Grouping) - Simplifies pages-store
5. **Phase 2.4** (Script Enhancements) - Adds power-user features
6. **Phase 2.5** (Compare Editor) - Cleans up compare mode
7. **Phase 2.6** (Tool Editors) - When ready to add new editors

---

## Notes

- **Phase 2.0** can be done immediately as a quick fix
- Each phase can be done independently after 2.0 and 2.1
- Phase 2.1 (Editor Registry) should be done before other architectural changes
- Phase 2.6 is optional/future - only implement when tool editors are needed
- All phases should maintain backward compatibility during transition
