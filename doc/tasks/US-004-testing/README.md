# US-004: Implement Testing Infrastructure

## Status

**Status:** Planned
**Priority:** Medium
**Complexity:** Medium

## Summary

Set up automated testing infrastructure with Vitest for unit and component tests.

## Why

Current state:
- No automated tests
- All testing is manual
- Easy to introduce regressions
- Hard for contributors to verify changes

Benefits:
- Catch regressions early
- Document expected behavior
- Confidence in refactoring
- Better contributor experience

## Acceptance Criteria

- [ ] Vitest configured and running
- [ ] At least 5 utility function tests
- [ ] At least 3 component tests
- [ ] At least 1 integration test
- [ ] Test scripts in package.json
- [ ] CI can run tests (future)
- [ ] Testing guide documented

## Technical Approach

### Tools

- **Vitest** - Fast, Vite-native test runner
- **React Testing Library** - Component testing
- **jsdom** - DOM environment for tests

### Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

### Test Structure

```
src/
├── core/utils/
│   ├── csv-utils.ts
│   └── csv-utils.test.ts      # Co-located
├── components/basic/
│   ├── Button.tsx
│   └── Button.test.tsx        # Co-located
└── test/
    ├── setup.ts               # Global setup
    └── helpers.ts             # Test utilities
```

### Test Categories

1. **Unit Tests** - Pure functions in `/core/utils/`
2. **Component Tests** - React components with RTL
3. **Integration Tests** - Multi-component workflows

## Files to Create/Modify

### Create
- `vitest.config.ts`
- `src/test/setup.ts`
- `src/test/helpers.ts`
- Initial test files (see progress)

### Modify
- `package.json` - Add test scripts
- `tsconfig.json` - Include test types

## Implementation Progress

### Phase 1: Setup
- [ ] Install Vitest and dependencies
- [ ] Create vitest.config.ts
- [ ] Create test setup file
- [ ] Add npm scripts

### Phase 2: Utility Tests
- [ ] Test csv-utils.ts
- [ ] Test parse-utils.ts
- [ ] Test obj-path.ts
- [ ] Test memorize.ts
- [ ] Test utils.ts (debounce, etc.)

### Phase 3: Component Tests
- [ ] Test Button component
- [ ] Test Input component
- [ ] Test Tooltip component

### Phase 4: Integration Tests
- [ ] Test state management flow
- [ ] Document test patterns

### Phase 5: Documentation
- [ ] Update testing.md guide
- [ ] Add test examples

## Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:ci": "vitest --run"
  }
}
```

## Notes

Start with simple, high-value tests. Don't aim for 100% coverage immediately. Focus on:
1. Functions with complex logic
2. Components with user interaction
3. Critical workflows

## Related

- [Testing Guide](../../standards/testing.md)
