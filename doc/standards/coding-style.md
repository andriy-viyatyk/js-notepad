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

### Functional Components Only (Exception: Error Boundaries)

> **Exception:** React error boundaries require class components (`getDerivedStateFromError`/`componentDidCatch` have no hook equivalent). See `EditorErrorBoundary` and `EntryErrorBoundary`.

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

## Styling with Emotion and co-located CSS

> **Where Emotion is allowed:** Emotion is the styling tool for `src/renderer/uikit/` (the standalone component library) and for the chrome surfaces inside `src/renderer/ui/` (page tab strip, sidebar, navigation bar — one-of-a-kind app chrome). Application code outside those scopes — including `editors/`, `components/` (KEEP folders), and feature code — **must not** use `styled.*`, `import { css }`, or pass `style=` / `className=` to UIKit components. Compose UIKit primitives by props instead. For the full set of UIKit authoring rules (data-attribute state model, controlled-component contract, trait-based data binding, naming, etc.), see [`src/renderer/uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md) — that file is the canonical authoring reference; this section is the project-wide rule.

When an editor owns presentation for generated content or a third-party/native host, keep that CSS in a stylesheet beside the editor and scope it below a semantic editor root (for example, `MarkdownBlock.css` or `BrowserView.css`). Such styles are an editor boundary, not a new UIKit primitive or a generic styling escape hatch. Prefer existing UIKit layout and control props for the surrounding chrome; reserve native `style` values for runtime geometry or integration details that cannot be expressed semantically.

### Co-located CSS for converted components

Emotion remains valid for existing UIKit and one-of-a-kind `ui/` chrome until an explicit
conversion task migrates that surface. A converted component has one styling system for its DOM
subtree: plain CSS, not a mixture of Emotion and static CSS. The stylesheet is co-located and
imported by its owner (`Component/Component.tsx` imports `Component/Component.css`); it is plain
Vite CSS, not a CSS module, runtime class-name generator, or second global style registry.

The existing editor-local CSS files are the precedent for co-location and loading only. Their
class-root selectors and pre-existing literal values are not the model for UIKit scoping or token
usage. New component styles must begin at the required root selector:

```css
@layer uikit {
    [data-type="button"] {
        /* base rules, variants, then interaction states */
    }

    [data-type="button"] [data-part="label"] {
        /* stable internal structure */
    }
}
```

Use the established `data-part` vocabulary for stable internal regions; do not rename existing
part names, use generated Emotion classes, or rely on generic global selectors. Direct-child
selectors are appropriate when the old Emotion rule depended on DOM shape. An owning parent may
target a descendant's `[data-type]` or `[data-part]` from its own stylesheet, as existing
`AudioPlayer`, `FileSearch`, `GlobalStyles`, `CollapsiblePanelStack`, and AVGrid patterns do.
That is an owner relationship, not a public styling escape hatch. Converted UIKit components still
omit public `style` and `className` props, although their implementation may set a narrowly typed
custom property on its own raw root element.

### Tokens, colors, and runtime values

Static CSS consumes theme and design-token variables directly:

```css
[data-type="panel"] {
    color: var(--color-text-default, currentColor);
    padding: calc(var(--space-md) * 2);
    border-radius: var(--radius-md, 0px);
}
```

Use `var(--color-...)` names from `theme/color.ts` and the theme definitions. Use the app token
families `--space-*`, `--gap-*`, `--radius-*`, `--size-*`, and `--font-*` from US-981. Do not copy
theme color literals into CSS or make CSS import `color.ts`, `themeState`, or `resolveColor()`;
those JavaScript APIs are for canvas, Monaco, webviews, data URIs, and other non-CSS consumers.

Scalar runtime geometry or appearance belongs in a component-prefixed custom property on the
consuming element, such as `--spinner-size`, `--progress-pill-top`, or `--tree-indent-size`.
Every `var()` use needs a usable fallback. Boolean or finite state belongs in `data-*` attributes,
with inactive booleans omitted, rather than a class per state. Component-owned custom properties
are implementation details, never a hidden public styling API, and must not be written to `:root`
or a shared ancestor. Measurements, third-party/native-host values, and one-off placement may
remain inline when the owning task records why no static CSS consumer exists.

### Keyframes and cascade layers

Keyframes belong in the owning component stylesheet and use the stable global form
`persephone-<component-kebab-name>-<animation-kebab-name>`. Do not render a `<style>` element from
a component or use generic names such as `spin`, `pulse`, or `loading`. Preserve the original
duration, timing, iteration, fill behavior, and motion. The four current migration targets are:

| Source | Stable name |
| --- | --- |
| Dialog `pulse` | `persephone-dialog-pulse` |
| ProgressBar `indeterminateSlide` | `persephone-progress-bar-indeterminate-slide` |
| Spinner `spin` | `persephone-spinner-spin` |
| Notification `notification-slide-in` | `persephone-notification-slide-in` |

`notification-slide-in` in `Notification.tsx` and `browser-loading-pulse` in
`editors/browser/BrowserView.css` are grandfathered legacy names until their owning migrations;
they are not names for new stylesheets.

The layer order is declared once at startup in `src/renderer/theme/style-layers.css`:

```css
@layer base, uikit, app, editor;
```

New styles use `uikit` for UIKit, `app` for shell/coupled chrome, and `editor` for converted
editor-local CSS; `base` is reserved for reset and token infrastructure. Layer order is stable
even when lazy chunks load later. Existing Emotion and grandfathered styles remain unlayered
legacy CSS until their owner migrates; related owner/descendant rules must migrate together or
retain an explicitly reviewed specificity relationship. Within a layer preserve the old order:
base layout/paint, variants and sizes, hover/focus, then selected/active/disabled overrides.

Before completing a conversion, compare default, hover, focus, selected, disabled, loading, and
variant states, including direct-child SVG sizing and equal-specificity rules. Typecheck cannot
detect a cascade or insertion-order regression.

### Legacy Emotion shape for unconverted components

For unconverted UIKit and one-of-a-kind app-chrome components with multiple child elements, create
**one styled component** for the root element and style all children using nested class selectors.
This is the legacy shape retained until that component has a conversion task. Converted components
use the co-located CSS convention above. Editor components use their scoped stylesheet convention.

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

### Use Theme Colors — No Hardcoded Colors

All colors must come from the `color` object. Never use hex codes, `rgb()`/`rgba()`, or CSS named colors in styled components or inline styles.

```typescript
import color from '../../theme/color';

// GOOD - uses theme tokens
const Header = styled.div({
  backgroundColor: color.background.default,
  color: color.text.default,
  borderBottom: `1px solid ${color.border.default}`,
});

// BAD - hardcoded colors break theming
const Header = styled.div({
  backgroundColor: '#1f1f1f',
  color: 'rgba(204, 204, 204, 1)',
});
```

If a needed color doesn't exist in `color`, add it to `color.ts` and all theme definitions in `src/renderer/theme/themes/`.

#### Documented exception: `assets/agent/ui-highlight.js`

The agent highlight overlay carries its own literal colors and is exempt from this rule. Two
reasons, both intrinsic rather than incidental:

- It is a **standalone injectable asset**, not part of the renderer bundle. The same file is
  pasted into `browser_evaluate` to run inside board frames and browser pages, where no Persephone
  module graph exists — it cannot import `theme/color` in the contexts it must work in.
- Its accent look is a **fixed identity, not a theme surface**. A callout styled to match the
  surrounding theme is indistinguishable from Persephone's own UI, and the user must be able to
  tell at a glance that an agent placed it. Reading a board's `--p-*` tokens was considered and
  rejected for exactly this reason.

This exception covers that one file. Anything rendered by React still uses `color`.

## No Direct Node.js `fs` or `path` Imports

Renderer modules must NOT use `require("fs")` or `require("path")` directly. All file system operations go through `app.fs` (`/src/renderer/api/fs.ts`), and all path operations go through the `file-path` utility module (`/src/renderer/core/utils/file-path.ts`).

```typescript
// GOOD - path operations through file-path utility
import { fpBasename, fpDirname, fpJoin } from "../../core/utils/file-path";
const name = fpBasename(filePath);
const dir = fpDirname(filePath);

// GOOD - file operations through app.fs
import { fs } from "../../api/fs";
const content = await fs.read(filePath);
await fs.write(filePath, content);

// BAD - direct Node.js imports
const path = require("path");
const nodefs = require("fs");
```

**Why:** These modules are the single source of truth for file and path operations. The `file-path` module provides archive-aware path functions (for `zip!inner/path` and `.asar` path support). The `app.fs` module routes archive paths to the appropriate service. Centralizing all usage ensures consistent behavior and makes it easy to review/change path and file logic.

**Exceptions (allowed direct usage):**
- `file-path.ts` itself — the one module that wraps `require("path")`
- `fs.ts` itself — the one module that wraps `require("fs")`
- `archive-service.ts` — low-level archive I/O provider that `fs.ts` routes to (using `fs.ts` would create circular dependency)
- `file-watcher.ts` — uses `fs.watch()` (callback-based watcher, not a simple read/write)
- `content/providers/FileProvider.ts` — low-level binary I/O provider that intentionally bypasses `app.fs` archive transparency
- `content/providers/CacheFileProvider.ts` — low-level cache I/O provider for content pipe cache files
- `content/tree-providers/FileTreeProvider.ts` — filesystem tree provider that intentionally bypasses `app.fs` archive transparency (archive browsing is handled by ArchiveTreeProvider)
- `content/tree-providers/ArchiveTreeProvider.ts` — archive tree provider, uses `path.basename`/`path.extname` on plain filenames (not archive-aware path operations)
- `library-require.ts` — custom `require()` transpiler that uses `fs.readFileSync` for module compilation
- `ScriptPanel.tsx` — uses `fs.readFileSync`/`writeFileSync` for script file operations (will be migrated in future tasks)
- `themes/index.ts` — uses `fs.readFileSync` at startup before `app.fs` is initialized
- Other files that use `require("fs")` for low-level operations not covered by `app.fs` (e.g., `fs.watch`, `fs.createReadStream`)

When in doubt: if `app.fs` or `file-path` can do the job, use them.

### Bypassing Vite Bundling with `require()`

In the renderer process, Vite bundles `import` statements and externalizes `node:*` builtins into broken browser stubs. When a Node.js library must work with real `node:*` modules (e.g., `@modelcontextprotocol/sdk` uses `import process from 'node:process'` for stdio transport), use `require()` instead of `import` to load it at runtime via Electron's Node.js integration:

```typescript
// GOOD — require() bypasses Vite, Node.js resolves from node_modules at runtime
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");

// BAD — import() goes through Vite bundling, node:process gets externalized
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
```

This pattern is used in `McpConnectionManager.ts` for the MCP SDK client modules.

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
import { Button } from '../../uikit/Button/Button';
import { pagesModel } from '../../api/pages';

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
| Interface/Type | PascalCase | `EditorModel`, `EditorProps` |
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
    // `error` is `unknown` — `errMessage` turns it into something printable
    ui.notify(`Failed to load file: ${errMessage(error)}`, "warning");
    return null;
  }
}
```

### Provide User Feedback

```typescript
// GOOD - user sees what happened
ui.notify('Failed to save file. Check if the file is writable.', "warning");

// BAD - silent failure
console.error(error);
```

**Dialogs/notifications from internal UI vs. scripts.** Internal UI code (editors, components, models)
that needs a modal confirmation imports `showConfirmationDialog` from
`src/renderer/ui/dialogs/ConfirmationDialog` directly — that is the real modal popup (precedent:
`editors/graph/GraphBody.tsx`, `editors/text/ScriptPanel.tsx`, `editors/git-tree/GitChangesView.tsx`).
For toasts, use the `ui` singleton's `ui.notify(message, "error")` (the global alerts bar). The
`app.ui.confirm` / `app.ui.*` surface is the **script-facing** Object Model API (it routes to the script's
log/output context) — do not use it for the app's own UI.

### Turning a Caught Value Into a Message

A `catch` binding is `unknown`. Use `errMessage(e, fallback?)` from `shared/utils.ts` — never
hand-roll the narrowing:

```typescript
// GOOD
ui.notify(`Failed to save image: ${errMessage(err)}`, "error");
ui.notify(errMessage(err, "Failed to save file."), "warning");

// BAD — the three dialects this replaces
err instanceof Error ? err.message : String(err)   // verbose
(err as Error).message                             // unsafe: `undefined` for a thrown string
(err as Error)?.message || String(err)             // defensive but repetitive
```

`errMessage` lives in `shared/` because main, the renderer, and the board shim all need it.
It deliberately checks for a string `.message` property **before** falling back to `String(e)`,
rather than testing `instanceof Error` first: errors that cross the main↔renderer IPC boundary
(and MCP JSON-RPC replies) arrive as plain objects that fail the prototype check but still carry
a real message, and `String()` would render them as `"[object Object]"`.

One place it cannot be used: code inside a template literal that is *itself* worker source
(`main/worker-host.ts`'s `WORKER_CODE`). That string has no access to host imports.

### Reporting a Failure as a Toast

When the whole catch body is "tell the user and carry on", use `guard(label, fn, level?)` from
`core/utils/guard.ts` instead of the `try`/`catch` around it. The label is the full prefix, so
the toast text is unchanged:

```typescript
// GOOD
await guard("Failed to open file", () => app.events.openRawLink.sendAsync(link));

// BAD - the shape guard exists to remove
try {
    await app.events.openRawLink.sendAsync(link);
} catch (err) {
    ui.notify(`Failed to open file: ${errMessage(err)}`, "error");
}
```

`guard` swallows the error and resolves to `undefined`, so it fits handlers and menu actions.
Keep an explicit `try`/`catch` whenever the catch does anything else — updates state, logs, sets
an error field on a model, or re-throws — because the wrapper would hide that logic.

### Parsing JSON That May Be Malformed

Decide first whether a parse failure is worth reporting.

When it is **not** — a cached blob, a drag payload, a JSONL scan that skips junk lines — use
`tryParseJson<T>(text, fallback)` from `core/utils/parse-utils.ts` rather than hand-rolling a
`try`/`catch`. It returns `fallback` for absent, blank, and malformed input alike, so it also
replaces the `text.trim() ? JSON.parse(text) : {}` idiom, and it types the result at the call site
instead of leaking `any`.

```typescript
// GOOD
const payload = tryParseJson<TraitDragPayload | null>(raw, null);

// BAD - one more copy of a block that already exists a dozen times
try { return JSON.parse(raw) as TraitDragPayload; } catch { return null; }
```

Keep an explicit `try`/`catch` in two cases. First, when the user needs to know *why* their
content failed to load — `LogViewEditor` and the Grid's JSONL reader report `Line N: <message>`,
which a silent fallback would destroy. Second, when the `try` also guards the surrounding file
I/O rather than the parse alone; swapping the helper in there removes nothing.

### Bound Awaits on a Thread You Don't Own

A `try`/`catch` protects against failure, not against never answering. When an `await` crosses
into code whose scheduling you don't control — most notably `webview.executeJavaScript()`, which
queues on the *page's* renderer main thread — a busy or mid-load target can leave the promise
pending for a minute or more, and every await up the chain stalls with it. The user sees a
dialog or menu that simply does not open, clicks again, and eventually gets one per click.

Decide whether the result is **required** or a **suggestion**. A suggestion gets a deadline:

```typescript
// GOOD - the page's image hints are nice to have; the dialog opens regardless
const probe: Promise<string[]> = webview.executeJavaScript(script);
const images = await withTimeout(probe, 1000, []);

// BAD - a loading page holds the dialog hostage
const images = await webview.executeJavaScript(script);
```

`withTimeout(promise, ms, fallback)` lives in `core/utils/utils.ts`. Pick the budget per call
site — a menu item that merely appears or disappears can afford far less than a dialog gathering
suggestions — and proceed with what the app already knows from its own state.

Pair this with a re-entrancy guard on any handler that awaits before it shows something. Users
retry when nothing appears, and each retry queues another dialog:

```typescript
private starClickBusy = false;

handleStarClick = async () => {
    if (this.starClickBusy) return;
    this.starClickBusy = true;
    try {
        await this.runStarClick();
    } finally {
        this.starClickBusy = false;
    }
};
```

### Long Work Belongs Off the Main-Process Event Loop

The main process owns the window message pump, the window `close` event, and every `ipcMain`
handler. A long synchronous run there — a directory walk over `fs.readdirSync` /
`readFileSync`, a big parse, a hash over a large file — does not merely feel slow: Windows
paints the window "Not Responding", the app cannot be closed, and **any IPC that was supposed
to interrupt the work cannot arrive**, because the handler that would receive it is queued
behind the work itself.

That last point is the one that bites. A cancellation flag polled inside the loop looks like it
works and is dead code:

```typescript
// BAD - activeSearches is only written by the cancel IPC handler, which cannot
// run until this loop finishes. Every check reads a value that can never change.
const isCancelled = () => activeSearches.get(senderId) !== searchId;
while (dirStack.length > 0) {
    if (isCancelled()) return;
    ...
}
```

`async` alone does not fix this. A function marked `async` whose body never actually `await`s
anything still runs to completion in a single tick.

Move the work to a `worker_thread` and make termination the cancel:

```typescript
// GOOD - the walk stays synchronous, but in a thread that owns nothing
const worker = new Worker(source, { eval: true });
worker.on("message", (msg) => { /* relay to the renderer */ });
// cancel, replaced search, or window closed:
worker.terminate();
```

Two existing hosts follow this shape: `main/worker-host.ts` (script `app.runAsync`) and
`main/search-service.ts` (file-content search). Both also show the packaging constraint — a
worker bundle is loaded as **source** via `fs.readFileSync` + `{ eval: true }` rather than
`new Worker(path)`, because a worker bootstraps its own Node environment whose module loader
cannot be relied on to read an entry inside the packaged asar. Under `eval`, every surviving
`require` must be a node builtin, so such a bundle must keep its npm dependencies inlined and
must not import `electron`.

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
