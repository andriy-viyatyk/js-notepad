# US-003: ContentPageModel Extraction

## Status

**Status:** Planned
**Priority:** Medium
**Complexity:** Medium-High

## Summary

Extract common file/content handling from TextFileModel into a reusable ContentPageModel base class.

## Why

Current problems:
- TextFileModel has all file I/O, encryption, caching, file watching logic
- GridPageModel partially reuses by composition (awkward)
- Future editors (Notebook, ToDo, Bookmarks) would need to duplicate this logic

Benefits:
- DRY - common logic in one place
- Easier to create new content-based editors
- Cleaner inheritance hierarchy
- Consistent behavior across editors

## Acceptance Criteria

- [ ] ContentPageModel base class with file operations
- [ ] TextFileModel extends ContentPageModel
- [ ] GridPageModel extends ContentPageModel
- [ ] File I/O works correctly in both editors
- [ ] Encryption works correctly
- [ ] File watching works correctly
- [ ] Session restore works correctly
- [ ] No regressions in existing functionality

## Technical Approach

### Inheritance Hierarchy

```
PageModel (abstract)
├── ContentPageModel (file-based content)
│   ├── TextFileModel (Monaco-specific)
│   └── GridPageModel (Grid-specific)
└── ViewerPageModel (read-only, future)
    └── PdfViewerModel
```

### ContentPageModel Responsibilities

```typescript
abstract class ContentPageModel extends PageModel {
  // State
  content: string;
  modified: boolean;
  filePath?: string;
  encoding: string;
  deleted: boolean;
  temp: boolean;

  // File watching
  protected fileWatcher: FileWatcher | null;

  // Encryption
  protected password?: string;
  get encrypted(): boolean;
  get decrypted(): boolean;

  // File operations
  saveFile(saveAs?: boolean): Promise<boolean>;
  renameFile(newName: string): Promise<boolean>;

  // Caching
  protected saveModifications(): void;

  // Abstract - subclasses implement
  abstract parseContent(raw: string): void;
  abstract serializeContent(): string;
}
```

### TextFileModel Changes

Move TO ContentPageModel:
- File state (filePath, encoding, modified, deleted, temp)
- FileWatcher integration
- saveFile(), renameFile()
- Encryption methods
- Cache file handling

Keep IN TextFileModel:
- Language management
- Monaco editor reference
- Script panel
- runScript() methods

### GridPageModel Changes

- Remove composition with TextFileModel
- Extend ContentPageModel directly
- Implement parseContent() for JSON/CSV parsing
- Implement serializeContent() for output

## Files to Modify

### Create
- `editors/base/ContentPageModel.ts`

### Modify
- `editors/base/index.ts` - Export ContentPageModel
- `editors/text/TextPageModel.ts` - Extend ContentPageModel
- `editors/grid/GridPageModel.ts` - Extend ContentPageModel

## Implementation Progress

### Phase 1: Create ContentPageModel
- [ ] Create base class with state
- [ ] Move file I/O methods
- [ ] Move file watching
- [ ] Move encryption support
- [ ] Move caching logic
- [ ] Define abstract methods

### Phase 2: Refactor TextFileModel
- [ ] Change to extend ContentPageModel
- [ ] Implement parseContent/serializeContent
- [ ] Remove duplicated code
- [ ] Test all text editor features

### Phase 3: Refactor GridPageModel
- [ ] Change to extend ContentPageModel
- [ ] Remove TextFileModel composition
- [ ] Implement parseContent for JSON/CSV
- [ ] Implement serializeContent
- [ ] Test JSON grid editor
- [ ] Test CSV grid editor

### Phase 4: Documentation
- [ ] Update architecture docs
- [ ] Update editor-guide.md

## Notes

This is a significant refactoring that touches core functionality. Test thoroughly at each phase. Consider feature flags or parallel implementation if needed.

## Related

- [Editor System Architecture](../../architecture/editors.md)
- Depends on: None
- Enables: US-XXX (Tool Editors)
