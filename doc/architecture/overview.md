# Architecture Overview

> Read this document before creating new modules or making architectural changes.

## Application Type

js-notepad is an **Electron desktop application** - a Windows Notepad replacement designed for developers. It combines:
- Monaco Editor (VS Code engine) for text editing
- Custom editors for specific file types (Grid, PDF, Markdown)
- JavaScript execution environment for data transformation

## Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Application                      │
├─────────────────────┬───────────────────────────────────────┤
│    Main Process     │          Renderer Process             │
│    (Node.js)        │          (Chromium + React)           │
├─────────────────────┼───────────────────────────────────────┤
│ - Window management │ - React UI                            │
│ - System tray       │ - Monaco Editor                       │
│ - File dialogs      │ - State management                    │
│ - Native menus      │ - Script execution                    │
└─────────────────────┴───────────────────────────────────────┘
         │                           │
         └───────── IPC ─────────────┘
              (Inter-Process Communication)
```

### Key Characteristics

- **nodeIntegration: true** - Renderer has full Node.js access
- **contextIsolation: false** - Direct Node.js in renderer
- Scripts can `require()` any Node.js module or npm package

## Renderer Architecture

```
/src/renderer/
├── app/              # Application shell (entry points)
├── core/             # Infrastructure (state, services, utils)
├── store/            # Application state (Zustand-style)
├── editors/          # ALL editor implementations
├── components/       # Reusable UI components
├── features/         # App-specific features
├── theme/            # Styling
├── setup/            # Configuration
└── types/            # Type declarations
```

### Layer Responsibilities

| Layer | Responsibility | Dependencies |
|-------|---------------|--------------|
| **app/** | Bootstrap, routing, global handlers | All layers |
| **features/** | App-specific UI (tabs, sidebar, dialogs) | components, store, editors |
| **editors/** | File type handling, content editing | components, store, core |
| **components/** | Reusable UI building blocks | core, theme |
| **store/** | Application state | core |
| **core/** | Primitives, services, utilities | None (foundation) |

### Dependency Rules

1. Lower layers should NOT import from higher layers
2. `core/` is the foundation - no app-specific imports
3. `components/` should be reusable - no store/editor imports
4. `editors/` can use components and store
5. `features/` orchestrates editors, components, and store
6. `app/` ties everything together

## Key Subsystems

### 1. State Management

See [state-management.md](./state-management.md) for details.

- Custom Zustand-like implementation in `core/state/`
- Stores in `store/` for global app state
- Component-local state via `TComponentModel`

### 2. Editor System

See [editors.md](./editors.md) for details.

- All editors in `/editors/` with consistent structure
- `PageModel` base class for all page types
- Dynamic loading via `import()` for code splitting
- Editor resolution based on file extension/pattern

### 3. Scripting System

See [scripting.md](./scripting.md) for details.

- JavaScript execution with `page` context variable
- Full Node.js access for scripts
- Grouped pages for script output
- Script Panel for ad-hoc scripts on any file

### 4. Theming System

- CSS Custom Properties approach — `color.ts` returns `var()` references, theme definitions set actual values on `:root`
- 55+ component files import `color` unchanged — zero migration needed when adding themes
- Theme definitions in `src/renderer/theme/themes/` (one file per theme)
- Monaco editor has separate theme integration via `onMonacoThemeChange` callback
- Startup: synchronous `fs.readFileSync` in `themes/index.ts` + inline `<script>` in `index.html` for flash-free startup
- Theme preference persisted in `appSettings.json`
- Settings page (`src/renderer/editors/settings/SettingsPage.tsx`) provides visual theme selector

## Design Principles

### 1. Core First
Keep the core text editing experience fast and lightweight. Heavy features load on-demand.

### 2. Async Imports for Editors
```typescript
// CORRECT - async import
const getPdfModule = async () =>
    (await import("../editors/pdf/PdfViewer")).default;

// WRONG - synchronous import
import { PdfViewer } from "../editors/pdf/PdfViewer";
```

### 3. Container with Building Blocks
js-notepad provides UI building blocks (toolbar, editors, grouped pages). Users bring their own integrations via Node.js/npm - the app doesn't need built-in database or API integrations.

### 4. Consistent Editor Structure
Every editor follows the same pattern:
```
/editors/[name]/
├── index.ts           # Exports
├── [Name]Editor.tsx   # Component
├── [Name]PageModel.ts # State & logic
└── components/        # Editor-specific (optional)
```

## File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React Component | PascalCase.tsx | `TextEditor.tsx` |
| Model/Store | kebab-case.ts | `pages-store.ts` |
| Utility | kebab-case.ts | `csv-utils.ts` |
| Types | kebab-case.ts or in component | `types.ts` |
| Index | index.ts | `index.ts` |

## Related Documentation

- [Folder Structure](./folder-structure.md) - Detailed folder organization
- [Editors](./editors.md) - Editor system architecture
- [Browser Editor](./browser-editor.md) - Multi-process browser editor architecture
- [State Management](./state-management.md) - State patterns
- [Scripting](./scripting.md) - Script execution system
