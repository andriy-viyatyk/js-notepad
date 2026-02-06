# US-002: Editor Registry Pattern

## Status

**Status:** Planned
**Priority:** High
**Complexity:** Medium

## Summary

Replace procedural editor resolution with a declarative registry pattern, making it easier to add new editors.

## Why

Current problems:
- Adding a new editor requires changes in 5+ files
- No clear extension point for custom editors
- Editor resolution logic scattered across multiple files
- Hard for contributors to understand how to add editors

Benefits of registry pattern:
- Single place to register editors
- Declarative configuration
- Easy to add new editors
- Self-documenting

## Acceptance Criteria

- [ ] `EditorRegistry` class with `register()` method
- [ ] All existing editors registered (text, grid-json, grid-csv, markdown, pdf)
- [ ] `RenderEditor.tsx` uses registry for editor resolution
- [ ] `page-factory.ts` uses registry for model creation
- [ ] Adding new editor requires only registration call
- [ ] Documentation updated with new pattern
- [ ] No changes to existing functionality

## Technical Approach

### EditorDefinition Interface

```typescript
interface EditorDefinition {
  id: string;                    // e.g., "text", "grid-json", "pdf"
  name: string;                  // Display name
  pageType: PageType;            // Page type this editor handles
  extensions?: string[];         // File extensions (e.g., [".pdf"])
  filenamePatterns?: RegExp[];   // Filename patterns (e.g., /\.grid\.json$/)
  languagePatterns?: string[];   // Language IDs for switching
  priority: number;              // Resolution priority (higher = preferred)
  alternativeEditors?: string[]; // Editors this can switch to
  loadModule: () => Promise<EditorModule>;
}
```

### EditorRegistry Class

```typescript
class EditorRegistry {
  private editors = new Map<string, EditorDefinition>();

  register(definition: EditorDefinition): void;
  resolve(filePath: string, language?: string): EditorDefinition;
  getById(id: string): EditorDefinition | undefined;
  getAlternatives(id: string, language: string): EditorDefinition[];
}

export const editorRegistry = new EditorRegistry();
```

### Registration Example

```typescript
editorRegistry.register({
  id: 'text',
  name: 'Text Editor',
  pageType: 'textFile',
  extensions: ['*'],
  priority: 0,  // Lowest - fallback
  loadModule: () => import('./text'),
  alternativeEditors: ['grid-json', 'grid-csv', 'md-view'],
});

editorRegistry.register({
  id: 'pdf',
  name: 'PDF Viewer',
  pageType: 'pdfFile',
  extensions: ['.pdf'],
  priority: 100,  // Highest - exclusive
  loadModule: () => import('./pdf'),
});
```

## Files to Modify

- `editors/types.ts` - Add EditorDefinition interface
- `editors/registry.ts` - Implement EditorRegistry class
- `editors/text/index.ts` - Add registration
- `editors/grid/index.ts` - Add registration
- `editors/markdown/index.ts` - Add registration
- `editors/pdf/index.ts` - Add registration
- `app/RenderEditor.tsx` - Use registry
- `store/page-factory.ts` - Use registry

## Implementation Progress

### Phase 1: Create Registry
- [ ] Define EditorDefinition interface
- [ ] Implement EditorRegistry class
- [ ] Export singleton instance

### Phase 2: Register Editors
- [ ] Register text editor
- [ ] Register grid-json editor
- [ ] Register grid-csv editor
- [ ] Register markdown editor
- [ ] Register pdf editor

### Phase 3: Integrate
- [ ] Refactor RenderEditor to use registry
- [ ] Refactor page-factory to use registry
- [ ] Update getLanguageSwitchOptions to use registry

### Phase 4: Cleanup
- [ ] Remove old resolution functions (if fully replaced)
- [ ] Update documentation
- [ ] Update editor-guide.md

## Notes

This is a foundational task that will make future editor additions much easier. Take care to maintain backward compatibility during transition.

## Related

- [Editor System Architecture](../../architecture/editors.md)
- [Editor Creation Guide](../../standards/editor-guide.md)
