# Testing Guide

> **Status: Placeholder** - Testing infrastructure not yet implemented.

## Current State

js-notepad currently does not have automated tests. Testing is done manually.

## Planned Testing Strategy

### Unit Tests

For utilities and pure functions:
- `/core/utils/` functions
- State management logic
- Data transformations

**Planned tools:** Vitest (Vite-native)

### Component Tests

For React components:
- Render with different props
- User interaction simulation
- State changes

**Planned tools:** Vitest + React Testing Library

### Integration Tests

For editor workflows:
- File open/save cycles
- Script execution
- Session restore

**Planned tools:** Vitest + custom harness

### E2E Tests (Optional)

For full application flows:
- Multi-window scenarios
- Real file system operations

**Planned tools:** Playwright or Spectron

## Manual Testing Checklist

Until automated tests exist, use this checklist:

### Core Functionality
- [ ] Open text file
- [ ] Save file (Ctrl+S)
- [ ] Save As (Ctrl+Shift+S)
- [ ] New tab (Ctrl+N)
- [ ] Close tab (Ctrl+W)
- [ ] Undo/Redo
- [ ] Find/Replace

### Editors
- [ ] Text editor loads
- [ ] JSON grid view works
- [ ] CSV grid view works
- [ ] Markdown preview renders
- [ ] PDF viewer displays
- [ ] Compare mode works

### Features
- [ ] Tab drag-and-drop
- [ ] Recent files list
- [ ] Folder bookmarks
- [ ] File explorer
- [ ] Syntax highlighting
- [ ] Language detection

### Script Execution
- [ ] Run script (F5)
- [ ] Script Panel
- [ ] Grouped page output
- [ ] Error handling

### Edge Cases
- [ ] Large files (>10MB)
- [ ] Binary files
- [ ] Files with special characters
- [ ] Network drives
- [ ] Read-only files

## Contributing Tests

When tests are implemented:

1. Put tests next to source files: `MyComponent.test.tsx`
2. Or in `__tests__/` folder
3. Name clearly: `describe('MyComponent')`, `it('should render')`
4. Test behavior, not implementation

## Related Tasks

See [active tasks](../tasks/active.md) for testing implementation task.
