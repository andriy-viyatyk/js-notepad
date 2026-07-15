# US-849: Show the board icon for board-associated files in the Explorer tree

**Epic:** [EPIC-043 — Content-Host Boards](../../epics/EPIC-043.md)
**Status:** Implemented (Option B — global) — awaiting user test (epic deferred-review)

## Goal

In the Explorer file tree, a file claimed by a trusted custom-editor board (via the board's `fileMasks`) shows that **board's icon** instead of the generic Windows system icon — inserted into the icon-resolution ladder **after** built-in language/pattern icons and **before** the system-icon fallback. Example: `.drawio` files show the **drawio-viewer** board's icon.

## Background

### Current icon-resolution ladder

The Explorer tree renders each row's icon via `TreeProviderItemIcon` (`src/renderer/components/tree-provider/TreeProviderItemIcon.tsx`). For a local file it delegates to `<FileTypeIcon fileName={item.title}>` (`src/renderer/components/icons/LanguageIcon.tsx`). `FileTypeIcon`'s ladder is exactly as the user described:

1. **Language icon** — `getLanguageById(language) || getLanguageByExtension(ext)` → `languageIconMap[lang.id]` (`LanguageIcon.tsx:202-210`).
2. **Compound-extension pattern icon** — `getFilePatternIcon(fileName)` (e.g. `*.rest.json` → RestClientIcon), overrides the language icon (`:124-142, :213`).
3. **System icon** — async Windows per-extension icon via `api.getFileIcon` (`:159-169, :218-235`).
4. **Default icon** — `DefaultIcon` (`:239`).

`.drawio` has no entry in `languageIconMap` and no pattern rule, so today it falls straight to the **system icon** (step 3). We want a **board step between 2 and 3**.

### Available building blocks

- **`customEditorRegistry`** (`src/renderer/editors/board/custom-editor-registry.ts`) — reactive mask→trusted-board map. `getBoardsForFile(fileName)` (sync) / `useBoardsForFile(fileName)` (reactive hook) return `CustomEditorMatch[]` (each carries `boardRoot`, `priority`, `name`, `editorKind`). Already initialized at app bootstrap (`register-editors.ts:457` calls `ensureInitialized()`), and returns `[]` gracefully before init → clean fallback.
- **`BoardGlyph`** (`src/renderer/editors/board/BoardGlyph.tsx`) — a drop-in `<BoardGlyph boardRoot={root} size={16} />` that renders the board's own `icon.{svg,png,ico}` (async-cached via `board-icon-cache.ts`, self-refreshing via `useBoardIcon`), falling back to the default `BoardIcon` glyph. This is the same component the page tab / sidebar row use, so the Explorer icon will match the tab icon exactly.

## Design decision (needs sign-off)

The board step must land **after** the built-in static icons (language + pattern) and **before** the system fallback. That "is there a built-in static icon?" check currently lives *inside* `FileTypeIcon`. Two placements:

- **Option A — Explorer-scoped (recommended).** Extract the static-icon lookup into an exported pure helper `getStaticFileIcon(fileName?, language?): SvgIconComponent | undefined` in `LanguageIcon.tsx` (refactor `FileTypeIcon` to use it — no behavior change). Then in `TreeProviderItemIcon`, for a local file with **no** static icon **and** a matching board, render `<BoardGlyph>`; otherwise render `<FileTypeIcon>` unchanged. Scope stays exactly on the Explorer tree (the user's stated target); the shared `components/icons` module gains **no** dependency on the editor layer.
- **Option B — global.** Insert the board step directly inside `FileTypeIcon`, so board icons appear **everywhere** `FileTypeIcon`/`FileIcon` is used (Explorer, file grids/lists, Git "Changes", etc.). Cleaner single-source ladder, but broadens scope beyond the request and adds an `editors/board` import into the shared `components/icons` module (mild coupling / cycle-risk; mitigated by importing the specific files, not the barrel).

**Recommendation: Option A** — matches the requested scope, keeps `components/icons` decoupled, and is trivially promotable to Option B later if we want board icons in every file list.

> **DECISION: Option B** — the user wants the board icon everywhere files are listed. Implemented by inserting the board step directly inside `FileTypeIcon`. See "Implementation (Option B)" below.

## Implementation (Option B — as built)

The board step lives inside `FileTypeIcon` (`src/renderer/components/icons/LanguageIcon.tsx`), between the built-in static icon (language/pattern) and the system-icon fallback. Every consumer of `FileTypeIcon` / `FileIcon` / `LanguageIcon` (Explorer tree, file grids/lists, Git "Changes", page-tab language icons, …) now shows the board icon for a board-claimed file that has no built-in icon.

- Imports (specific files, not the barrel, to avoid the barrel's heavy graph): `customEditorRegistry` from `../../editors/board/custom-editor-registry`, `BoardGlyph` from `../../editors/board/BoardGlyph`.
- `const boardMatches = customEditorRegistry.useBoardsForFile(!resolvedIcon && fileName ? fileName : "")` — reactive hook, called unconditionally (rules-of-hooks); passed `""` (→ `[]`) whenever a built-in icon already resolved, so it's inert on the common path.
- Winner: highest `priority` (ties → trusted-list order), mirroring `resolveEditorIdForFile`.
- The system-icon `prepareIcon` effect and render now gate on `!board` too, so a board-matched file never fetches or renders the Windows icon.
- Board icon is sized from the numeric `width` prop (fallback 16) via `<BoardGlyph boardRoot={board.boardRoot} size={size} />`.

## Implementation plan (Option A)

1. **`src/renderer/components/icons/LanguageIcon.tsx`** — extract the built-in static-icon resolution into an exported helper and reuse it in `FileTypeIcon`:
   ```ts
   /** The built-in (language + compound-pattern) icon for a file, or undefined when
    *  none applies (→ caller may fall back to a board icon / system icon). */
   export function getStaticFileIcon(
       fileName?: string,
       language?: string,
   ): SvgIconComponent | undefined {
       const ext = fileName ? fpExtname(fileName).toLowerCase() : "";
       const lang = getLanguageById(language || "") || (ext ? getLanguageByExtension(ext) : undefined);
       const langIcon = lang ? languageIconMap[lang.id] : undefined;
       const patternIcon = fileName ? getFilePatternIcon(fileName) : undefined;
       return patternIcon || langIcon;
   }
   ```
   Then `FileTypeIcon` computes `const resolvedIcon = getStaticFileIcon(fileName, language);` (via `useMemo`) — identical behavior, single source.

2. **`src/renderer/components/tree-provider/TreeProviderItemIcon.tsx`** — add the board step for local-file rows:
   - Import `getStaticFileIcon` and, from the editor layer (specific files, not the barrel): `customEditorRegistry` (`../../editors/board/custom-editor-registry`) and `BoardGlyph` (`../../editors/board/BoardGlyph`).
   - Call the reactive hook unconditionally at the top (rules-of-hooks), alongside the existing `useHttpPathExtension`:
     ```ts
     const boardMatches = customEditorRegistry.useBoardsForFile(item.title);
     ```
   - In the **local file** branch (the final `return <FileTypeIcon .../>`, `:51`), before falling through:
     ```ts
     if (!getStaticFileIcon(item.title) && boardMatches.length > 0) {
         // Highest-priority match (ties → first / trusted-list order) — the board
         // that would actually open the file (mirrors resolveEditorIdForFile).
         const board = boardMatches.reduce((a, b) => (b.priority > a.priority ? b : a));
         return <BoardGlyph boardRoot={board.boardRoot} size={16} />;
     }
     return <FileTypeIcon fileName={item.title} width={16} height={16} />;
     ```
   - Leave the HTTP/favicon and directory branches unchanged. (Optionally apply the same board step to the HTTP-with-extension branch — deferred; not requested.)

3. **Verify** `tsc --noEmit` + `eslint` clean on both files.

## Concerns / open questions

- **C1 — scope (Option A vs B).** Recommending Explorer-only (Option A). Confirm you don't also want board icons in the Git "Changes" list / file grids (that would be Option B).
- **C2 — which board when several match.** Highest `priority` (ties → trusted-list order), mirroring `resolveEditorIdForFile` so the icon matches the board that would actually open the file.
- **C3 — built-in icon wins.** Per the request, board icons apply only when there's **no** built-in language/pattern icon (e.g. `.drawio`). A board claiming `.json` would **not** override the JSON icon. Confirm that's desired (recommended — conservative).
- **C4 — reactivity/perf.** Each file row subscribes to the registry via `useBoardsForFile`; a lightweight reactive selector, re-renders on trust/mask changes so a newly trusted board's icon appears live. Fine at typical tree sizes.
- **C5 — icon-only, no open-behavior change.** This task changes only the displayed icon; it does not change which editor opens the file (that is already `resolveEditorIdForFile`).

## Acceptance criteria

1. In the Explorer tree, a `.drawio` file shows the **drawio-viewer board icon** (matching its page-tab icon), not the generic system icon.
2. Files with a built-in icon (`.json`, `.ts`, `.md`, …) are **unchanged**.
3. Files with no built-in icon and no matching board still fall back to system/default icon (**unchanged**).
4. Trusting/untrusting a board updates the affected file icons live (no restart).
5. `npx tsc --noEmit` and `npx eslint` clean on the touched files.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/components/icons/LanguageIcon.tsx` | Extract exported `getStaticFileIcon` helper; `FileTypeIcon` reuses it (no behavior change) |
| `src/renderer/components/tree-provider/TreeProviderItemIcon.tsx` | Board-icon step for local files with no built-in icon (before system fallback) |
