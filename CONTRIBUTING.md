# Contributing to js-notepad

Thank you for your interest in contributing to js-notepad! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Git

### Setting Up Development Environment

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/andriy-viyatyk/js-notepad.git
   cd js-notepad
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development mode:
   ```bash
   npm start
   ```

### Development Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run in development mode with hot reload |
| `npm run package` | Package the app |
| `npm run make` | Create distributables (MSI, ZIP) |
| `npm run lint` | Run ESLint |

## Project Structure

js-notepad is an Electron application with the following structure:

```
/src
  /main              # Electron main process
  /renderer          # React frontend
    /app             # Application shell
    /core            # State primitives, services, utilities
    /store           # Application state (Zustand stores)
    /editors         # Editor implementations
    /components      # Reusable UI components
    /features        # App-specific features
    /theme           # Styling
    /setup           # Monaco configuration
  /ipc               # Inter-process communication
```

For detailed architecture documentation, see [/doc/architecture/](doc/architecture/).

## How to Contribute

### Reporting Bugs

1. Check if the issue already exists in [GitHub Issues](https://github.com/andriy-viyatyk/js-notepad/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Version information

### Suggesting Features

1. Check existing issues and the [backlog](doc/tasks/backlog.md)
2. Create a feature request issue with:
   - Clear use case description
   - Proposed solution (if any)
   - Alternatives considered

### Submitting Code

1. **Pick an issue** - Look for issues labeled `good first issue` or `help wanted`
2. **Create a branch** - Use descriptive names like `feature/json-export` or `fix/tab-close-crash`
3. **Make changes** - Follow the coding standards below
4. **Test** - Ensure the app works correctly
5. **Submit PR** - Reference the issue number

## Coding Standards

### General

- Use TypeScript for all new code
- Use Emotion for styling (styled components or css prop)
- Use functional React components with hooks
- Keep components focused and reusable

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | PascalCase for components | `TextEditor.tsx` |
| Files | kebab-case for utilities | `file-utils.ts` |
| Components | PascalCase | `EditorToolbar` |
| Functions | camelCase | `parseJsonContent` |
| Constants | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |
| Types/Interfaces | PascalCase with prefix | `TPageModel`, `IEditorConfig` |

### Code Style

```typescript
// Good: Clear, typed, focused
function calculateSum(values: number[]): number {
  return values.reduce((sum, val) => sum + val, 0);
}

// Good: Styled component
const Container = styled.div`
  display: flex;
  padding: 8px;
`;
```

### Important Patterns

1. **Dynamic Imports** - Use `import()` for editors to maintain code splitting
2. **Direct Imports** - Prefer direct imports over barrel imports to avoid circular dependencies
3. **State Management** - Use stores in `/src/renderer/store/`

For complete coding standards, see [/doc/standards/coding-style.md](doc/standards/coding-style.md).

## Adding New Features

### Adding a New Editor

See [/doc/standards/editor-guide.md](doc/standards/editor-guide.md) for step-by-step instructions.

### Adding a UI Component

See [/doc/standards/component-guide.md](doc/standards/component-guide.md) for guidelines.

## Pull Request Guidelines

1. **One feature/fix per PR** - Keep PRs focused
2. **Descriptive title** - Summarize the change
3. **Link issues** - Reference related issues with `Fixes #123` or `Related to #456`
4. **Description** - Explain what changed and why
5. **Screenshots** - Include for UI changes
6. **No breaking changes** - Unless discussed first

### PR Checklist

- [ ] Code follows project coding standards
- [ ] `npm run lint` passes
- [ ] App runs without errors (`npm start`)
- [ ] Production build works (`npm run make`)
- [ ] Changes are documented if needed

## Documentation

- **Developer docs** are in `/doc/` - architecture, standards, tasks
- **User docs** are in `/docs/` - guides for end users
- Update relevant docs when making changes

## Questions?

- Check the documentation in `/doc/`
- Open an issue for discussion
- Review existing PRs and issues for context

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
