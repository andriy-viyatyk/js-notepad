# Component Creation Guide

> Read this before creating new UI components.

## Where to Put Your Component

| Component Type | Location | Example |
|---------------|----------|---------|
| Reusable, no app state | `/components/[category]/` | Button, Tooltip |
| App-specific feature | `/features/[feature]/` | PageTab, FileExplorer |
| Editor-specific | `/editors/[editor]/components/` | CsvOptions |

## Component Categories

### /components/basic/
Atomic, context-free components.
- Button, Input, Chip, Tooltip
- No knowledge of app state
- Purely props-driven

### /components/form/
Form controls and inputs.
- ComboSelect, SwitchButtons
- Handle user input
- May have internal state

### /components/layout/
Layout primitives.
- Splitter, FlexSpace
- Control arrangement/sizing

### /components/overlay/
Floating UI elements.
- Popper, PopupMenu
- Portal-based rendering

### /components/virtualization/
Performance-critical scrolling.
- RenderGrid (base)
- Handles large datasets

### /components/data-grid/
High-level data display.
- AVGrid
- Built on virtualization

## Creating a Basic Component

### 1. Create the File

```
/components/basic/MyComponent.tsx
```

### 2. Define Props Interface

```typescript
export interface MyComponentProps {
  /** Primary content */
  children: React.ReactNode;
  /** Called when clicked */
  onClick?: () => void;
  /** Visual style variant */
  variant?: 'primary' | 'secondary';
  /** Additional CSS class */
  className?: string;
}
```

### 3. Create Styled Components

```typescript
import styled from '@emotion/styled';
import color from '../../theme/color';

const Root = styled.div<{ variant: 'primary' | 'secondary' }>(({ variant }) => ({
  padding: '8px 16px',
  borderRadius: 4,
  backgroundColor: variant === 'primary'
    ? color.primary.main
    : color.background.default,
  color: variant === 'primary'
    ? color.primary.contrastText
    : color.text.default,
  cursor: 'pointer',
  '&:hover': {
    opacity: 0.9,
  },
}));
```

### 4. Implement Component

```typescript
export function MyComponent({
  children,
  onClick,
  variant = 'primary',
  className,
}: MyComponentProps) {
  return (
    <Root
      variant={variant}
      onClick={onClick}
      className={className}
    >
      {children}
    </Root>
  );
}
```

### 5. Export from Index

```typescript
// /components/basic/index.ts
export { MyComponent } from './MyComponent';
export type { MyComponentProps } from './MyComponent';
```

## Creating a Feature Component

Feature components can use app state and other features.

### Example: Feature in /features/

```typescript
// /features/sidebar/MyFeature.tsx
import { pagesModel } from '../../store';
import { Button } from '../../components/basic/Button';

interface MyFeatureProps {
  onClose: () => void;
}

export function MyFeature({ onClose }: MyFeatureProps) {
  const pages = pagesModel.state.use((s) => s.pages);

  const handleClick = (pageId: string) => {
    pagesModel.showPage(pageId);
    onClose();
  };

  return (
    <div>
      {pages.map(page => (
        <Button key={page.id} onClick={() => handleClick(page.id)}>
          {page.title}
        </Button>
      ))}
    </div>
  );
}
```

## Component Patterns

### Forwarding Refs

When wrapping native elements:

```typescript
import { forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ value, onChange, ...props }, ref) {
    return (
      <StyledInput
        ref={ref}
        value={value}
        onChange={onChange}
        {...props}
      />
    );
  }
);
```

### Composition with Children

```typescript
interface CardProps {
  children: React.ReactNode;
  title?: string;
}

export function Card({ children, title }: CardProps) {
  return (
    <CardRoot>
      {title && <CardTitle>{title}</CardTitle>}
      <CardContent>{children}</CardContent>
    </CardRoot>
  );
}
```

### Render Props (when needed)

```typescript
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function List<T>({ items, renderItem }: ListProps<T>) {
  return (
    <ListRoot>
      {items.map((item, index) => renderItem(item, index))}
    </ListRoot>
  );
}
```

## Testing Checklist

Before committing a new component:

- [ ] Works with different prop combinations
- [ ] Handles edge cases (empty, loading, error)
- [ ] Keyboard accessible (if interactive)
- [ ] Looks correct in both themes (if applicable)
- [ ] No console errors/warnings
- [ ] Exported from index.ts

## Anti-Patterns

### Don't Access Store in /components/

```typescript
// BAD - component depends on app state
// /components/basic/PageButton.tsx
import { pagesModel } from '../../store';

// GOOD - pass as props, put in /features/ if needs state
// /features/tabs/PageButton.tsx
```

### Don't Create Mega-Components

Split large components:

```typescript
// BAD - 500 lines
function MegaForm() { ... }

// GOOD - composed from smaller pieces
function UserForm() {
  return (
    <Form>
      <PersonalInfoSection />
      <ContactSection />
      <PreferencesSection />
      <FormActions />
    </Form>
  );
}
```

### Don't Duplicate Styles

Use theme values and shared styled components:

```typescript
// BAD - hardcoded colors
const Box = styled.div({ backgroundColor: '#1e1e1e' });

// GOOD - theme reference
const Box = styled.div({ backgroundColor: color.background.default });
```
