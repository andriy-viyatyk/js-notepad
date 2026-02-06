# js-notepad Project Guidelines

## Quick Start for Claude

1. **Read this file completely** - essential context for all tasks
2. **For new features:** Read [/doc/architecture/overview.md](doc/architecture/overview.md)
3. **Check active tasks:** Review [/doc/tasks/active.md](doc/tasks/active.md)
4. **Follow standards:** Use [/doc/standards/](doc/standards/) when writing code

## Task Workflow (IMPORTANT)

When user says "let's work on tasks" or similar:

### If no task is currently "In Progress":
1. **Ask before starting**: Say "The next task is '[Task Title]'. Do you want to proceed with this task, or would you like to reprioritize and pick a different one?"
2. Wait for user confirmation

### When starting a new task (not already in progress):
1. **Review first, don't implement immediately**
2. Read the task documentation and provide a summary of:
   - What we're going to do (main points)
   - Key files involved
   - Any concerns or decisions needed
3. **Wait for user approval** before implementing
4. User will say either:
   - "Let's implement it fully" - proceed with full implementation
   - "Let's implement subtask X" - implement only that part
   - Discuss concerns first

### During implementation:
- Update task progress checklist
- Ask for clarification when uncertain
- Do NOT commit automatically - wait for user to request commits

### Completing a task:
1. Verify all acceptance criteria are met
2. Update documentation (see checklist in [/doc/tasks/active.md](doc/tasks/active.md)):
   - Architecture docs, standards docs, user docs, CLAUDE.md, what's new
3. Move task to "Recently Completed" in active.md
4. **Ask user for confirmation** before deleting the task folder

This step-by-step approach ensures user understands what's happening and can review changes properly.

## Documentation Map

| Need to...                    | Read...                                                |
|-------------------------------|--------------------------------------------------------|
| Understand architecture       | [/doc/architecture/overview.md](doc/architecture/overview.md) |
| Learn folder structure        | [/doc/architecture/folder-structure.md](doc/architecture/folder-structure.md) |
| Add a new editor              | [/doc/standards/editor-guide.md](doc/standards/editor-guide.md) |
| Add a UI component            | [/doc/standards/component-guide.md](doc/standards/component-guide.md) |
| Understand state management   | [/doc/architecture/state-management.md](doc/architecture/state-management.md) |
| Work with scripting system    | [/doc/architecture/scripting.md](doc/architecture/scripting.md) |
| Check coding style            | [/doc/standards/coding-style.md](doc/standards/coding-style.md) |
| See current tasks             | [/doc/tasks/active.md](doc/tasks/active.md) |
| See future ideas              | [/doc/tasks/backlog.md](doc/tasks/backlog.md) |

## Project Overview

JS-Notepad is a Windows Notepad replacement for developers. Built with Electron and Monaco Editor (VS Code engine), it extends classic notepad with powerful code editing and a JavaScript execution environment.

### Design Philosophy
- **Core First:** Keep core functionality fast and lightweight
- **Extensible:** Editors loaded on-demand via async imports
- **Developer-Focused:** Tools for manipulating and transforming data
- **Container:** Provides UI building blocks; users bring integrations via Node.js/npm

### Key Features
- **Monaco Editor** - Syntax highlighting, IntelliSense, multi-cursor, compare mode
- **JavaScript Executor** - Run scripts with `page` object to transform content
- **Grid Editors** - JSON/CSV viewing with sorting, filtering, Excel copy-paste
- **Markdown Preview** - Live rendered preview
- **PDF Viewer** - Integrated pdf.js

## Tech Stack

- **Runtime:** Electron 39 (nodeIntegration: true, contextIsolation: false)
- **Frontend:** React 19 with TypeScript
- **Editor:** Monaco Editor
- **State:** Zustand-style stores with custom primitives (TOneState, TComponentState)
- **Build:** Vite + Electron Forge
- **Styling:** Emotion (CSS-in-JS)

## Commands

```bash
npm start       # Development mode
npm run package # Package the app
npm run make    # Create distributables (MSI, ZIP)
npm run lint    # Run ESLint
```

## Folder Structure (Summary)

```
/src
  /main              # Electron main process
  /renderer          # React frontend
    /app             # Application shell
    /core            # State primitives, services, utilities
    /store           # Zustand stores (pages, files, settings)
    /editors         # ALL editors (text, grid, markdown, pdf, compare)
    /components      # Reusable UI components
    /features        # App features (tabs, sidebar, dialogs)
    /theme           # Styling
    /setup           # Monaco configuration
  /ipc               # Inter-process communication
/doc                 # Developer documentation
/docs                # User documentation
```

See [/doc/architecture/folder-structure.md](doc/architecture/folder-structure.md) for complete details.

## Critical Patterns

### 1. Dynamic Imports for Editors
Always use `import()` for editor code to maintain code splitting:
```typescript
// Good
const { PdfViewer } = await import("../pdf/PdfViewer");

// Bad - increases bundle size
import { PdfViewer } from "../pdf/PdfViewer";
```

### 2. Script Context (`page` object)
Scripts access content via the `page` variable:
```javascript
const data = JSON.parse(page.content);
page.grouped.content = JSON.stringify(result);
page.grouped.editor = "grid-json";
```

### 3. Grouped Pages
- Two tabs can be grouped (side-by-side)
- Accessing `page.grouped` auto-creates a grouped page if none exists
- Script output is written to the grouped page

### 4. State Management
- Stores in `/src/renderer/store/`
- State primitives in `/src/renderer/core/state/`
- See [state-management.md](doc/architecture/state-management.md)

## Coding Standards (Quick Reference)

- **TypeScript** for all new code
- **Emotion** for styling (styled components or css prop)
- **Functional components** with hooks
- **Direct imports** preferred over barrel imports (avoid circular deps)
- **Meaningful names** - descriptive, no abbreviations

See [/doc/standards/coding-style.md](doc/standards/coding-style.md) for complete standards.

## Key Files

| Purpose                  | File                                              |
|--------------------------|---------------------------------------------------|
| Page/tab state           | `/src/renderer/store/pages-store.ts`              |
| File operations          | `/src/renderer/store/files-store.ts`              |
| Script execution         | `/src/renderer/core/services/scripting/ScriptRunner.ts` |
| Monaco setup             | `/src/renderer/setup/configure-monaco.ts`         |
| Editor registry          | `/src/renderer/editors/registry.ts`               |
| Editor registration      | `/src/renderer/editors/register-editors.ts`       |
| Text editor model        | `/src/renderer/editors/text/TextPageModel.ts`     |
| Grid editor model        | `/src/renderer/editors/grid/GridPageModel.ts`     |
| Base virtualization      | `/src/renderer/components/virtualization/RenderGrid.tsx` |
| Advanced grid            | `/src/renderer/components/data-grid/AVGrid.tsx`   |
