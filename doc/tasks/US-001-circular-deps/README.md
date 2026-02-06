# US-001: Fix Circular Dependencies

## Status

**Status:** Completed
**Priority:** Medium
**Complexity:** Low (Quick Win)

## Summary

Fix Rollup circular dependency warnings that appeared after folder reorganization.

## Why

During `npm run make`, Rollup shows warnings about circular dependencies:
- `isTextFileModel` reexported through barrel causing circular chain
- `pagesModel` reexported through barrel causing circular chains

**Impact:** Not critical (build works, app runs), but should fix for:
- Cleaner build output
- Better tree-shaking
- Avoid potential subtle bugs
- Future Rollup compatibility

## Acceptance Criteria

- [x] No circular dependency warnings during `npm run make`
- [ ] Application works correctly after changes (manual testing required)
- [ ] All tests pass (when implemented)

## Technical Approach

Change imports to point directly to source modules instead of barrel exports in files that are part of circular chains.

**Example:**
```typescript
// Before (causes circular dependency)
import { pagesModel } from "../../../store";

// After (direct import)
import { pagesModel } from "../../../store/pages-store";
```

## Files to Modify

### ScriptContext.ts
- Change `import { isTextFileModel } from "../../../editors/text"` → `"../../../editors/text/TextPageModel"`
- Change `import { pagesModel } from "../../../store"` → `"../../../store/pages-store"`

### ScriptRunner.ts
- Change `import { pagesModel } from "../../../store"` → `"../../../store/pages-store"`

### GridPageModel.ts
- Change `import { pagesModel, ... } from "../../store"` → separate imports

### GridEditor.tsx
- Change `import { pagesModel } from "../../store"` → `"../../store/pages-store"`

### MarkdownView.tsx
- Change `import { pagesModel } from "../../store"` → `"../../store/pages-store"`

## Implementation Progress

- [x] Fix ScriptContext.ts imports
- [x] Fix GridPageModel.ts imports
- [x] Fix GridEditor.tsx imports
- [x] Fix MarkdownView.tsx imports
- [x] Run `npm run make` and verify no warnings
- [ ] Test application functionality (manual)

## Notes

This is a quick win task that can be completed in a single session. The pattern is simple: identify circular imports through barrels and change to direct imports.
