# Task Backlog

Ideas and future tasks not yet planned for implementation.

---

## Architecture Improvements

### Script Service Enhancements

**Goal:** Expand scripting with hooks and toolbar builder API.

**Target State:**
- `ScriptHooks.ts` - language/event hooks system
- `ToolbarBuilder.ts` - API for scripts to add toolbar items
- Expanded ScriptContext with `app` and `toolbar` namespaces

#### Script Hooks System

**Tasks:**
- [ ] Create `core/services/scripting/ScriptHooks.ts`
- [ ] Define hook types: `onLanguageChange`, `onFileOpen`, `onFileSave`
- [ ] Create hooks registry and execution logic
- [ ] Integrate with TextFileModel language change
- [ ] Add UI for configuring hooks

#### Toolbar Builder API

**Tasks:**
- [ ] Create `core/services/scripting/ToolbarBuilder.ts`
- [ ] Define API: `toolbar.addButton()`, `toolbar.addCombobox()`, `toolbar.clear()`
- [ ] Connect to editor toolbar ref system
- [ ] Add to ScriptContext

#### Expand ScriptContext

**Tasks:**
- [ ] Add `app` namespace: `openFile()`, `showAlert()`, `showConfirm()`
- [ ] Add `toolbar` namespace
- [ ] Document new script capabilities

**Complexity:** High

---

### Script Output Mode Improvement

**Goal:** Allow scripts to control output page content directly without being overwritten.

**Current Behavior:**
- Script executes
- On success: return value overwrites `page.grouped.content` (prints "undefined" if no return)
- On error: error message with stack trace overwrites `page.grouped.content`
- Any assignment to `page.grouped.content` during script execution is overwritten

**Problem:** Scripts cannot incrementally write to output (useful for long-running tasks that want to show progress).

**Proposed Behavior:**
- If script does NOT assign to `page.grouped.content`: preserve current behavior (return value → output)
- If script DOES assign to `page.grouped.content`: "manual output mode"
  - Do NOT overwrite with return value
  - Script controls output content directly
  - On error in manual mode: show error dialog instead of overwriting output page

**Use Cases:**
- Long-running scripts that append progress updates to output
- Scripts that want to format output in a specific way during execution
- Scripts that build output incrementally

**Tasks:**
- [ ] Track whether `page.grouped.content` was assigned during script execution
- [ ] Modify ScriptRunner to check output mode after execution
- [ ] In manual mode: skip writing return value to output
- [ ] In manual mode on error: show error dialog instead of overwriting output
- [ ] Update scripting documentation with new behavior
- [ ] Add examples of incremental output scripts

**Complexity:** Medium

---

### Undo/Redo for TextPageModel

**Goal:** Implement undo/redo at the TextPageModel level so all editors (Grid, Notebook, Markdown, etc.) inherit undo/redo support, similar to how VS Code provides undo/redo for custom editors via its text document model.

**Current State:**
- Only Monaco editor has undo/redo (via its own internal history)
- When switching from Monaco to Grid editor, Monaco unmounts and its undo/redo history is lost
- Grid editor, Notebook editor, and other editors have no undo/redo support

**Target State:**
- TextPageModel maintains an undo/redo history stack tracking content changes
- All editors that modify content through TextPageModel automatically get undo/redo
- `Ctrl+Z` / `Ctrl+Shift+Z` work in Grid editor, Notebook editor, etc.
- History survives editor switches (e.g., Monaco → Grid → Monaco)

**Tasks:**
- [ ] Design undo/redo history model in TextPageModel (operation stack with content snapshots or diffs)
- [ ] Implement `undo()` and `redo()` methods on TextPageModel
- [ ] Add global keyboard handler for `Ctrl+Z` / `Ctrl+Shift+Z` when non-Monaco editors are active
- [ ] Integrate with Grid editor data changes
- [ ] Integrate with Notebook editor changes
- [ ] Handle history limits (max stack size) to prevent memory issues
- [ ] Preserve Monaco's own undo/redo when Monaco is active (avoid double-handling)

**Complexity:** High

---

## New Features

### Tool Editors Infrastructure

**Goal:** Editors for structured data files.

> ToDo Editor moved to active tasks: US-022

#### Bookmarks Editor (`*.link.json`)

Categorized bookmarks with tags.

**Tasks:**
- [ ] Create `editors/tools/bookmarks/` structure
- [ ] Create `BookmarkPageModel` extending PageModel
- [ ] Create `BookmarkEditor.tsx` component
- [ ] Register for `*.link.json` files
- [ ] Implement bookmark management with categories

**Complexity:** High (each)

---

### Hex Editor

**Goal:** Open and view/edit binary files (`.bin`, `.dat`, `.wasm`, `.exe`, `.dll`, etc.) in hex format.

Developers frequently need to inspect binary data — file headers, protocols, WASM modules. A hex view with offset columns, hex bytes, and ASCII representation. Could build on top of existing virtualization for large files.

**Complexity:** Medium-High

---

### Log Viewer

**Goal:** Specialized viewer for `.log` files with live tail, line filtering, regex search, and severity-level coloring.

Developers deal with logs daily and plain text editors don't help. A dedicated view with real-time filtering, severity highlighting (ERROR/WARN/INFO/DEBUG), and follow-tail mode would be very useful.

**Complexity:** Medium

---

### REST Client

**Goal:** Lightweight API testing tool using `.http` file format (same as VS Code REST Client extension).

Note: js-notepad already supports a basic REST workflow — create a JS file, write `const resp = await fetch(...); return await resp.json()` and execute it. A dedicated REST editor would add a more visual experience with request/response panels, headers UI, and history. Discussable whether the added value justifies the effort.

**Complexity:** High

---

### Regex Tester

**Goal:** Interactive regex testing tool with live match highlighting and capture group display.

Note: Users can already test regex via scripting (`page.content.match(/.../g)`), but a dedicated tool with visual highlighting of matches, named groups, and replace preview would be more convenient. Discussable.

**Complexity:** Medium

---

### JWT Decoder

**Goal:** Paste or open a JWT token, see decoded header and payload with expiration check.

Note: Already achievable via script panel (`page.content.split(".").slice(0,2).map(atob)`), but a dedicated viewer with formatted JSON output, expiration status, and signature info could be more convenient. Discussable — low effort but also low differentiation.

**Complexity:** Low

---

### Color Palette Editor

**Goal:** Create and edit color palettes with a palette generator for background/foreground combinations.

Good candidate for a tool editor. Could generate proper color schemes for web apps — complementary, analogous, triadic palettes. Display swatches, convert between hex/rgb/hsl, check contrast ratios (WCAG), and export as CSS variables or JSON.

**Complexity:** Medium-High

---

### System Information Editor (`*.sys.json`)

**Goal:** A diagnostic editor that scans and displays comprehensive Windows system information — running processes, services, startup apps, scheduled tasks, network connections, and more — to help investigate system issues like malware, performance problems, or network connectivity.

**Motivation:**
- Investigating system issues (suspicious processes, high CPU usage, unexpected network activity) currently requires manual PowerShell/Task Manager work
- Network diagnostics (e.g., detecting a network adapter running at lower speed than expected) require separate tools
- Having a persistent `.sys.json` file allows comparing scans over time to detect new/removed processes or services — critical for identifying malware or unwanted software

**Core Features:**

1. **File-based persistence** — opens/saves `*.sys.json` files containing last scan data
2. **Refresh/Scan button** — collects system information by spawning PowerShell processes
3. **Diff highlighting** — after a new scan, highlights what's NEW and what's REMOVED compared to the previous scan stored in the file
4. **Executable path resolution** — every process/service is matched to its real executable path on disk so the user knows where it comes from

**Data to Collect (via PowerShell):**

| Category | Description |
|----------|-------------|
| Running Processes | Name, PID, executable path, CPU %, memory usage, start time, command line arguments |
| Services (all) | Name, display name, status (running/stopped), startup type, executable path |
| Startup Applications | Name, command, location (registry key or startup folder), publisher |
| Scheduled Tasks | Name, status, next run time, last run result, action (executable + args), trigger type |
| Active Network Connections | Local/remote address:port, protocol (TCP/UDP), state, owning process name + PID |
| Network Adapters | Name, speed, status, link speed vs max speed, IP configuration, DNS servers |
| Installed Software | Name, version, publisher, install date, install location |
| System Overview | OS version, uptime, CPU model, RAM total/available, disk usage |

**Additional Detail Drill-Down (not stored in scan file):**
- Per-process: open handles, loaded DLLs, digital signature / publisher info
- Per-service: dependencies, recovery actions, associated registry entries
- Per-startup item: file properties (signed?, when modified?, file size)
- Per-network connection: DNS reverse lookup of remote IPs, geolocation hints
- Windows Registry queries for known autorun locations

**System Monitoring:**
- Network adapter speed monitoring (detect when adapter negotiates lower speed than expected)
- CPU usage anomaly summary
- Disk I/O summary

**UI Concept:**
- Tabbed or accordion sections for each category (Processes, Services, Startup, Tasks, Network, etc.)
- Summary bar showing counts and key stats
- Diff indicators: green for new entries, red/strikethrough for removed entries since last scan
- Search/filter within each section
- Click on an item to see additional details (fetched on demand, not stored)

**Technical Notes:**
- Register for `*.sys.json` file pattern in EditorRegistry
- Data collection runs in main process (spawn PowerShell with appropriate commands)
- IPC channel for renderer to request scans and receive results
- Consider scan progress indicator since full system scan may take several seconds
- Store scan timestamp and machine identifier in the JSON file

**Complexity:** High

---

### Certificate Viewer

**Goal:** Open `.pem`, `.crt`, `.cer` files and display parsed certificate details (issuer, subject, expiry, chain).

DevOps and backend developers deal with certificates frequently and usually resort to `openssl` CLI commands. A visual viewer would be more convenient.

**Complexity:** Low-Medium | **Priority:** Very Low

---

### Font Preview

**Goal:** Open `.ttf`, `.woff`, `.woff2` font files and preview glyphs at different sizes with customizable sample text.

Frontend developers occasionally need to inspect fonts. Could show glyph table, character set coverage, and font metadata.

**Complexity:** Low-Medium | **Priority:** Low

---

### Other Feature Ideas

| Idea | Description | Complexity |
|------|-------------|------------|
| Settings UI | Visual settings editor | Medium |
| Plugin System | Load external editor plugins | Very High |

---

## Developer Experience

| Idea | Description | Complexity |
|------|-------------|------------|
| Testing Infrastructure | Vitest setup with component tests. Postponed until core features stabilize to avoid test rewrites during refactoring. | Medium |
| Storybook | Component development environment | Medium |
| CI/CD Pipeline | Automated builds and releases | Medium |
| Performance Monitoring | Track bundle size, startup time | Low |

---

## User Experience

| Idea | Description | Complexity |
|------|-------------|------------|
| Middle-click Tab Close | Close tab with middle mouse button (standard behavior) | Low |
| Sidebar Toggle Shortcut | Add `Ctrl+B` to show/hide sidebar | Low |
| Keyboard Shortcuts Panel | View/customize shortcuts | Medium |
| Themes | Multiple color themes | Medium |
| Welcome Page | Onboarding for new users | Low |
| Command Palette | VS Code-like Ctrl+Shift+P | Medium |

---

## Documentation

| Idea | Description | Complexity |
|------|-------------|------------|
| Video Tutorials | Screen recordings of features | Medium |
| API Reference | Script API documentation | Low |

---

## Technical Debt

| Issue | Description | Complexity |
|-------|-------------|------------|
| TypeScript Strict Mode | Enable stricter type checking | Medium |
| Reduce Bundle Size | Analyze and optimize bundle | Medium |
| Accessibility Audit | Keyboard nav, screen readers | Medium |
| Memory Leak Audit | Check for subscription leaks | Low |

---

## Moving to Active

When ready to work on a backlog item:

1. Create task folder: `doc/tasks/US-XXX-name/`
2. Write detailed README.md
3. Add to `active.md` in Planned section
4. Remove from this file

## Adding Ideas

Feel free to add ideas here with:
- Brief description
- Rough complexity estimate
- Any initial thoughts on approach
