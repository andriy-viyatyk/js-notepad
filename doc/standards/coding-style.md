# Coding Style Guide

## TypeScript

### Use TypeScript for All New Code

```typescript
// GOOD
function greet(name: string): string {
  return `Hello, ${name}`;
}

// BAD - no types
function greet(name) {
  return `Hello, ${name}`;
}
```

### Prefer Interfaces Over Types for Objects

```typescript
// GOOD
interface UserProps {
  name: string;
  age: number;
}

// Use type for unions, intersections, primitives
type Status = 'active' | 'inactive';
type Handler = () => void;
```

### Avoid `any`

```typescript
// GOOD
function process(data: unknown): void {
  if (typeof data === 'string') {
    // data is string here
  }
}

// BAD
function process(data: any): void {
  // No type safety
}
```

## React

### Functional Components Only

```typescript
// GOOD
function MyComponent({ title }: { title: string }) {
  return <h1>{title}</h1>;
}

// Or with interface
interface MyComponentProps {
  title: string;
  onClick?: () => void;
}

function MyComponent({ title, onClick }: MyComponentProps) {
  return <h1 onClick={onClick}>{title}</h1>;
}
```

### Hooks at Top Level

```typescript
function MyComponent() {
  // Hooks first
  const [value, setValue] = useState('');
  const data = model.state.use((s) => s.data);

  // Then derived values
  const isValid = value.length > 0;

  // Then callbacks
  const handleSubmit = () => {
    // ...
  };

  // Then render
  return <div>...</div>;
}
```

### Avoid Inline Functions in Render (for frequently re-rendered components)

```typescript
// GOOD - callback defined outside render
const handleClick = useCallback(() => {
  doSomething();
}, []);

return <Button onClick={handleClick} />;

// OK for simple cases or rarely re-rendered
return <Button onClick={() => doSomething()} />;
```

## Styling with Emotion

### Single Styled Root with Nested Class-Based Styles

For components with multiple child elements, create **one styled component** for the root element and style all children using nested class selectors. This keeps styles organized and easier to read.

```typescript
// GOOD - single styled root with nested classes
const MyComponentRoot = styled.div({
  display: 'flex',
  flexDirection: 'column',
  padding: 16,

  "& .header": {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 8,
  },

  "& .content": {
    flex: 1,
    overflow: "auto",
  },

  "& .button": {
    padding: "8px 16px",
    cursor: "pointer",
    "&:hover": {
      opacity: 0.9,
    },
    "&.primary": {
      backgroundColor: color.background.selection,
    },
  },
});

function MyComponent() {
  return (
    <MyComponentRoot>
      <div className="header">Title</div>
      <div className="content">...</div>
      <button className="button primary">Click</button>
    </MyComponentRoot>
  );
}

// BAD - multiple styled components (harder to read)
const Header = styled.div({ fontSize: 18, fontWeight: 600 });
const Content = styled.div({ flex: 1, overflow: "auto" });
const Button = styled.button({ padding: "8px 16px" });
```

### Use Theme Colors

```typescript
import color from '../../theme/color';

const Header = styled.div({
  backgroundColor: color.background.default,
  color: color.text.default,
  borderBottom: `1px solid ${color.border.default}`,
});
```

## File Organization

### One Component Per File

```typescript
// Button.tsx
export function Button() { ... }
export interface ButtonProps { ... }

// Types can be in same file or separate types.ts
```

### Index Files for Exports

```typescript
// index.ts
export { Button } from './Button';
export type { ButtonProps } from './Button';
export { Input } from './Input';
```

### Import Order

```typescript
// 1. React/external libraries
import { useState, useCallback } from 'react';
import styled from '@emotion/styled';

// 2. Internal absolute imports (if configured)

// 3. Relative imports - parents first
import { Button } from '../../components/basic/Button';
import { pagesModel } from '../../store';

// 4. Relative imports - siblings/children
import { MyHelper } from './MyHelper';
import { localUtil } from './utils';

// 5. Types (often with type keyword)
import type { MyType } from './types';
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Component | PascalCase | `TextEditor`, `PageTab` |
| Hook | camelCase with `use` | `useHighlightedText` |
| Function | camelCase | `formatDate`, `handleClick` |
| Constant | UPPER_SNAKE_CASE | `MAX_TABS`, `DEFAULT_ENCODING` |
| Interface/Type | PascalCase | `PageModel`, `EditorProps` |
| File (component) | PascalCase.tsx | `TextEditor.tsx` |
| File (utility) | kebab-case.ts | `csv-utils.ts` |
| Folder | kebab-case | `data-grid`, `text-editor` |

## Error Handling

### Use Try-Catch for Async Operations

```typescript
async function loadFile(path: string) {
  try {
    const content = await fs.readFile(path, 'utf-8');
    return content;
  } catch (error) {
    alertWarning(`Failed to load file: ${error.message}`);
    return null;
  }
}
```

### Provide User Feedback

```typescript
// GOOD - user sees what happened
alertWarning('Failed to save file. Check if the file is writable.');

// BAD - silent failure
console.error(error);
```

## Comments

### When to Comment

```typescript
// GOOD - explains WHY, not WHAT
// Monaco requires language ID without the leading dot
const languageId = extension.slice(1);

// BAD - obvious from code
// Set the value to 5
value = 5;
```

### JSDoc for Public APIs

```typescript
/**
 * Creates a new page model for the given file path.
 * @param filePath - Optional file path. If omitted, creates untitled page.
 * @returns The new page model instance.
 */
export function newTextFileModel(filePath?: string): TextFileModel {
  // ...
}
```

## Don't Over-Engineer

### Avoid Premature Abstraction

```typescript
// GOOD - simple and clear
function formatUserName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}

// BAD - over-engineered
const createFormatter = <T>(config: FormatterConfig<T>) =>
  (item: T) => config.fields.map(f => item[f]).join(config.separator);
```

### YAGNI (You Aren't Gonna Need It)

Only add features/abstractions when actually needed, not "just in case."

```typescript
// GOOD - solves current problem
function saveFile(path: string, content: string) { ... }

// BAD - premature flexibility
function saveFile(path: string, content: string, options?: {
  encoding?: string;
  backup?: boolean;
  compress?: boolean;
  encrypt?: boolean;
  // ... options we might need someday
}) { ... }
```
