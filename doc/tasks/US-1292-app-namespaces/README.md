# US-1292: AiVision descriptors for the `app` namespaces

**Epic:** [EPIC-083](../../epics/EPIC-083.md)  
**Status:** Investigation complete; implementation not started  
**Depends on:** [US-1289: AiVision core](../US-1289-ai-vision-core/README.md)  
**Parallel with:** [US-1291: AiVision descriptors for editor facades](../US-1291-facade-descriptors/README.md)

## Goal

Make the twelve static `app` namespaces already exposed by `AiRoot` resolvable and searchable
through `call`, with hand-written AiVision descriptors that mirror the real `.d.ts` contracts and
warn before destructive or user-visible actions. Keep the descriptors off the application-startup
path and do not change the namespace singleton implementations.

The implementation must make live calls such as `call path:"settings"`,
`call path:"fs.exists" args:["C:\\Windows"]`, and `helpSearch("read file")` useful without
introducing a parallel object tree. This document records the verified plan only; no implementation
is part of this task-document pass.

## Background

### Binding decisions from EPIC-083

The following decisions are fixed and are not reopened by this task:

- **Decision 1 - interface, not base class:** AiVision is `IAiVisible`/`IAiVisionDescriptor` metadata
  from `src/shared/ai-vision/types.ts`. The app namespaces remain their existing classes or object
  literals; no trait wrapper or replacement object model is introduced.
- **Decision 4 - cooperative discovery:** `members` is the static kind-level API shape. Dynamic
  `children()` is reserved for live objects such as pages and current editor facades. These
  namespaces are static nodes, so none of their descriptors gets `children()` or `index()`.
  `AiRoot.children()` remains unchanged: the namespace properties are static root members, not live
  children.
- **Decision 5 - result shaping:** descriptor-bearing instances are returned through
  `summarize()`, while `ITextFile`, `IFileStat`, `IDirEntry`, download entries, board catalog
  results, event payloads, and other method-returned records remain plain data handled by
  `src/shared/ai-vision/result-shaper.ts`.
- **Decision 6 - security parity:** `call` exposes the existing script API subset; it does not add
  privilege. Every destructive or user-visible action in these descriptors gets `caution` text.
  Nothing is hidden from the script API.
- **Decision 8 - hand-written descriptors:** the member lists and help strings are written by hand
  for this MVP. Generating them from `.d.ts` JSDoc remains US-1294.

### Existing AiVision pattern

`src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts` and `PageWrapper.ts` establish the
descriptor shape: a readonly `IAiMember[]`, a help string, a fresh `get aiVision()` descriptor,
and a compact `summarize()` result. Facades in `src/renderer/scripting/api-wrapper/` use the same
pattern, but the namespace objects cannot use an own `aiVision` property for this task:

- `src/renderer/api/fs.ts`, `settings.ts`, `ui.ts`, `window.ts`, `recent.ts`, `downloads.ts`,
  `menu-folders.ts`, and `shell/index.ts` export class instances whose declared script types
  cannot be modified to add `aiVision`.
- `src/renderer/api/proc.ts` and `src/renderer/api/boards.ts` export plain object literals typed
  as `IProc` and `IBoards`; adding an `aiVision` property would break those declared types.
- `src/renderer/api/board-vars/admin-api.ts` exports the `BoardVarsAdmin` instance used by
  `app.boardVars`.

The constructor registry in `types.ts` cannot distinguish the `proc` and `boards` object literals
from arbitrary `Object` values. The fixed design is an instance-keyed `WeakMap` registry for all
namespace singleton instances. The existing constructor registry remains available for other
objects.

### AiRoot, registration, and search path

`src/renderer/scripting/ai-vision/root.ts` delegates `fs`, `settings`, `ui`, `shell`, `window`,
`proc`, `boards`, `boardVars`, `editors`, `recent`, `downloads`, and `menuFolders` to the same
instances returned by `AppWrapper`. `src/renderer/scripting/ai-vision/call.ts` is the renderer
entry point that imports `AiRoot`; therefore the registration side effect will be imported by
`root.ts` from a new `namespaces/index.ts`, not by `src/renderer/api/app.ts` or renderer bootstrap.
The registration is paid only when the AiVision path is loaded for `call`/`helpSearch`.

The current `src/shared/ai-vision/help-search.ts` walks `children()` only. That is correct for
dynamic pages but cannot find a static path such as `fs.readFile` while the root children contract
must stay unchanged. The plan therefore extends help search to inspect only descriptor-declared
plain properties explicitly marked `node: true`, resolving them only
to see whether they have an AiVision descriptor. It continues to use `children()` for dynamic traversal and skips caution-marked
getters, including `PageWrapper.grouped`, so discovery remains side-effect safe.

### `ui.log` boundary

The requested declaration review found two different UI APIs:

- `AiRoot.ui` is `this.app.ui`, whose type is `IUserInterface` from
  `src/renderer/api/types/ui.d.ts`. Its real members are dialogs, notifications, progress,
  screen lock, and app-window highlighting; it has no `log` property.
- `ui-log.d.ts` describes the separate callable global `ui: IUiLog`, installed lazily by
  `src/renderer/scripting/ScriptContext.ts` as a `UiFacade`. It is not `app.ui`, is not a member
  of `AiRoot`, and is not reachable as `call path:"ui.log"`.

The `ui` namespace descriptor therefore must not advertise `log`, `dialog`, or `show` from the
global Log View facade. Advertising `ui.log` here would create a resolver path that does not exist.
The separate global Log View surface is out of scope for this task; this decision is recorded so a
future task can describe it at the correct root if needed.

### Verified namespace inventory

The member counts below are direct members of the `app.<namespace>` descriptor. Nested `shell`
services have their own counts. Every signature is copied from the corresponding declaration in
`src/renderer/api/types/`; returned interfaces are called out as plain shaped data rather than
additional descriptors.

| Namespace | Kind | Direct member count | Notes |
|---|---:|---:|---|
| `fs` | `FileSystem` | 23 | File writes/deletes, OS dialogs, and explorer actions carry `caution`; no dynamic children or index. `ITextFile`, `IFileStat`, and `IDirEntry` results are plain data. |
| `settings` | `Settings` | 4 | `set` carries `caution`; `theme` is readonly; `onChanged` is an event property with no nested descriptor. |
| `ui` | `UserInterface` | 11 | All methods visibly affect or can block the UI and carry `caution`; no `ui.log` because that belongs to the separate global `IUiLog`. |
| `shell` | `Shell` | 4 | `openExternal` and screen capture carry `caution`; plain-property nested services `version` → `VersionService` (2) and `encryption` → `EncryptionService` (3) get descriptors. |
| `window` | `Window` | 14 | Window, sidebar, zoom, and new-window actions carry `caution`; state properties are readonly. |
| `proc` | `Process` | 1 | `execute` carries `caution` because it spawns a process; returned `IExecuteHandle` is not a plain property child and gets no descriptor in this task. |
| `boards` | `Boards` | 12 | Creation, opening, trust, rename, install/download/uninstall actions carry `caution`; returned catalog/version/update records are plain data. |
| `boardVars` | `BoardVars` | 6 | Every method can wait on storage-creation or decrypt prompts; `set` also persists secrets. No children/index. |
| `editors` | `EditorRegistry` | 5 | Read-only registry queries; returned editor/switch records are plain data. |
| `recent` | `RecentFiles` | 5 | `add`, `remove`, and `clear` change persisted recent-file history and carry `caution`; call `load()` before reading the plain `files` array. |
| `downloads` | `Downloads` | 7 | Download list/state are plain data; cancel/open/reveal/clear actions carry `caution`; internal bootstrap member `init` is deliberately omitted. |
| `menuFolders` | `MenuFolders` | 5 | `add`, `remove`, and `move` persist sidebar-folder changes and carry `caution`; folder records are plain data. |

No namespace descriptor implements `children()` or `index()`: all arrays, records, handles, and
event objects returned by these APIs are values, not dynamic AiVision nodes. The only nested
descriptors planned are `shell.version` and `shell.encryption`, because they are plain properties
and expose useful callable services.

### Full verified member inventory

`property` entries are read-only unless the declaration says otherwise. No declaration in this
scope has a genuinely settable property, so the implementation must not add `writable: true` to
any entry.

#### `fs` → `FileSystem`

Source: `src/renderer/api/types/fs.d.ts`

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `read` | `read(filePath: string, encoding?: string): Promise<string>` | Read text with auto-detected or specified encoding. |
| `readFile` | `readFile(filePath: string, encoding?: string): Promise<ITextFile>` | Read text with content and detected encoding. |
| `readBinary` | `readBinary(filePath: string): Promise<Buffer>` | Read a file as binary data. |
| `write` | `write(filePath: string, content: string, encoding?: string): Promise<void>` | Write text and create parent directories as needed. **Caution:** writes and may overwrite the user's file. |
| `append` | `append(filePath: string, text: string): Promise<void>` | Append UTF-8 text, creating the file if needed. **Caution:** changes the user's file. |
| `writeBinary` | `writeBinary(filePath: string, data: Buffer): Promise<void>` | Write binary data and create parent directories as needed. **Caution:** writes and may overwrite the user's file. |
| `exists` | `exists(filePath: string): Promise<boolean>` | Check whether a file or directory exists. |
| `delete` | `delete(filePath: string): Promise<void>` | Delete a file; no-op when absent. **Caution:** deletes the user's file. |
| `rename` | `rename(oldPath: string, newPath: string): Promise<void>` | Rename or move a file or directory. **Caution:** changes the user's filesystem. |
| `stat` | `stat(filePath: string): Promise<IFileStat>` | Return file/directory metadata, including an `exists` flag. |
| `copyFile` | `copyFile(srcPath: string, destPath: string): Promise<void>` | Copy a file and create parent directories as needed. **Caution:** writes the destination file. |
| `listDir` | `listDir(dirPath: string, pattern?: string \| RegExp): Promise<string[]>` | List names in a directory, optionally filtered. |
| `mkdir` | `mkdir(dirPath: string): Promise<void>` | Create a directory and parents as needed. **Caution:** changes the user's filesystem. |
| `listDirWithTypes` | `listDirWithTypes(dirPath: string): Promise<IDirEntry[]>` | List names with directory flags. |
| `removeDir` | `removeDir(dirPath: string, recursive?: boolean): Promise<void>` | Remove a directory. **Caution:** deletes a directory; recursive removal deletes its contents. |
| `resolveDataPath` | `resolveDataPath(relativePath: string): string` | Resolve a relative path in the per-window app-data folder. |
| `resolveCachePath` | `resolveCachePath(relativePath: string): string` | Resolve a relative path in the per-window cache folder. |
| `commonFolder` | `commonFolder(name: string): Promise<string>` | Resolve a standard OS folder such as `documents`, `downloads`, or `temp`. |
| `showOpenDialog` | `showOpenDialog(options?: IOpenDialogOptions): Promise<string[] \| null>` | Show the native Open File dialog. **Caution:** blocks for user input. |
| `showSaveDialog` | `showSaveDialog(options?: ISaveDialogOptions): Promise<string \| null>` | Show the native Save File dialog. **Caution:** blocks for user input. |
| `showFolderDialog` | `showFolderDialog(options?: IFolderDialogOptions): Promise<string[] \| null>` | Show the native Select Folder dialog. **Caution:** blocks for user input. |
| `showInExplorer` | `showInExplorer(filePath: string): void` | Select a path in the OS file explorer. **Caution:** opens/focuses an OS window. |
| `showFolder` | `showFolder(folderPath: string): void` | Open a folder in the OS file explorer. **Caution:** opens/focuses an OS window. |

#### `settings` → `Settings`

Source: `src/renderer/api/types/settings.d.ts`

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `theme` | property `string` | Current theme name; readonly, not writable through `value`. |
| `get` | `get<T = any>(key: string): T` | Read a setting; unknown keys return `undefined`. |
| `set` | `set<T = any>(key: string, value: T): void` | Persist a setting automatically after a debounce. **Caution:** changes application configuration and may actuate services through `onChanged`. |
| `onChanged` | property `IEvent<{ key: string; value: any }>` | Change notification event; the event object is not given a nested descriptor. |

#### `ui` → `UserInterface`

Source: `src/renderer/api/types/ui.d.ts`

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `confirm` | `confirm(message: string, options?: IConfirmOptions): Promise<string \| null>` | Show a confirmation dialog and wait for the user's choice. **Caution:** blocks on user input. |
| `input` | `input(message: string, options?: IInputOptions): Promise<IInputResult \| null>` | Show an input dialog and wait for the user's response. **Caution:** blocks on user input. |
| `password` | `password(options?: IPasswordOptions): Promise<string \| null>` | Show a password dialog. **Caution:** blocks on user input and handles secret text. |
| `notify` | `notify(message: string, type?: NotificationType): Promise<string \| undefined>` | Show a toast notification. **Caution:** visibly interrupts the user and may wait for a click. |
| `textDialog` | `textDialog(options: ITextDialogOptions): Promise<ITextDialogResult \| null>` | Show a Monaco text dialog. **Caution:** visibly opens a dialog and waits for the user. |
| `showProgress` | `showProgress<T>(promise: Promise<T>, label?: string): Promise<T>` | Show a progress overlay while a promise is pending. **Caution:** changes the visible UI. |
| `createProgress` | `createProgress(label?: string): Promise<IProgressHandle>` | Create a progress handle whose `show()` displays an overlay. **Caution:** can create visible progress UI. |
| `notifyProgress` | `notifyProgress(label: string, timeout?: number): void` | Show a centered auto-dismissing notification. **Caution:** changes the visible UI. |
| `addScreenLock` | `addScreenLock(): Promise<{ release: () => void }>` | Lock the screen with a blocking overlay until released. **Caution:** blocks user interaction. |
| `highlightElement` | `highlightElement(selector: string, text?: string, options?: IHighlightOptions): Promise<IHighlightResult>` | Draw an explanatory highlight in the app window. **Caution:** changes the visible UI and waits for dismissal. |
| `clearHighlights` | `clearHighlights(id?: string): Promise<number>` | Remove one or all highlights. **Caution:** changes the visible UI. |

`IProgressHandle` is returned data/handle from `createProgress`; it is not a plain property child
and receives no descriptor in this task. The Log View `IUiLog` methods from `ui-log.d.ts` are not
members of this `app.ui` descriptor.

#### `shell` → `Shell`

Source: `src/renderer/api/types/shell.d.ts`

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `openExternal` | `openExternal(url: string): Promise<void>` | Open a URL in the OS default browser. **Caution:** opens/focuses an external application. |
| `startScreenSnip` | `startScreenSnip(hideWindows: boolean): Promise<string \| null>` | Run the native screen-snip tool and return a PNG data URL or `null`. **Caution:** opens native capture UI and can hide Persephone windows. |
| `version` | property `IVersionService` | Runtime/update service; nested descriptor `VersionService`. |
| `encryption` | property `IEncryptionService` | AES-GCM text service; nested descriptor `EncryptionService`. |

Nested `shell.version` → `VersionService`, from `IVersionService`:

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `runtimeVersions` | `runtimeVersions(): Promise<IRuntimeVersions>` | Read Electron, Node, and Chrome versions. |
| `checkForUpdates` | `checkForUpdates(force?: boolean): Promise<IUpdateInfo>` | Check for application updates and return update information. |

Nested `shell.encryption` → `EncryptionService`, from `IEncryptionService`:

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `encrypt` | `encrypt(text: string, password: string): Promise<string>` | Encrypt text with a password. |
| `decrypt` | `decrypt(encryptedText: string, password: string): Promise<string>` | Decrypt text with a password. |
| `isEncrypted` | `isEncrypted(text: string): boolean` | Check whether text has the supported encrypted prefix. |

The `IRuntimeVersions` and `IUpdateInfo` results are plain data and get no descriptors.

#### `window` → `Window`

Source: `src/renderer/api/types/window.d.ts`

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `minimize` | `minimize(): void` | Minimize this window. **Caution:** changes the visible application window. |
| `maximize` | `maximize(): void` | Maximize this window. **Caution:** changes the visible application window. |
| `restore` | `restore(): void` | Restore this window from maximized/minimized state. **Caution:** changes the visible application window. |
| `close` | `close(): void` | Close this window. **Caution:** may close the application or prompt about unsaved work. |
| `toggleWindow` | `toggleWindow(): void` | Toggle maximized/restored state. **Caution:** changes the visible application window. |
| `isMaximized` | property `boolean` | Whether the window is maximized; readonly. |
| `menuBarOpen` | property `boolean` | Whether the sidebar/menu bar is open; readonly. |
| `toggleMenuBar` | `toggleMenuBar(): void` | Toggle the sidebar. **Caution:** changes the visible UI. |
| `openMenuBar` | `openMenuBar(panelId?: string): void` | Open the sidebar, optionally selecting a panel. **Caution:** changes the visible UI. |
| `zoom` | `zoom(delta: number): void` | Change the window zoom level. **Caution:** changes the visible UI. |
| `resetZoom` | `resetZoom(): void` | Reset zoom to 100%. **Caution:** changes the visible UI. |
| `zoomLevel` | property `number` | Current zoom step; readonly. |
| `openNew` | `openNew(filePath?: string): Promise<number>` | Open a new application window, optionally with a file. **Caution:** creates a visible window. |
| `windowIndex` | property `number` | Zero-based index among application windows; readonly. |

#### `proc` → `Process`

Source: `src/renderer/api/types/proc.d.ts`

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `execute` | `execute(command: string, options?: IExecuteOptions): IExecuteHandle` | Spawn a shell/direct child process and return a streaming/one-shot handle. **Caution:** runs an external process with the user's privileges. |

`IExecuteHandle` and its `on`, `getText`, `getJson`, `getBytes`, `write`, `endStdin`, and
`kill` methods are returned by `execute`, not plain namespace properties. They are intentionally
not registered as nested descriptors here; result shaping treats the handle as an undecorated class
instance. The declaration remains the source of truth for the returned handle contract.

#### `boards` → `Boards`

Source: `src/renderer/api/types/boards.d.ts`

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `createBoard` | `createBoard(name: string, dir: string): Promise<string>` | Scaffold and auto-trust a blank board. **Caution:** writes a board to disk and grants its creation trust. |
| `createDemoBoard` | `createDemoBoard(name: string, dir: string): Promise<string>` | Scaffold and auto-trust the bundled Demo board. **Caution:** writes a board to disk and grants its creation trust. |
| `openBoard` | `openBoard(boardRoot: string): Promise<void>` | Open an existing board in a new/reused tab. **Caution:** opens a visible page and may invoke board trust flow. |
| `registerBoard` | `registerBoard(boardRoot: string): Promise<boolean>` | Request trust for a board through the user's trust dialog. **Caution:** blocks on user consent and grants execution trust only after approval. |
| `unregisterBoard` | `unregisterBoard(boardRoot: string): Promise<void>` | Remove board trust and its pin. **Caution:** changes board availability and sidebar state. |
| `renameBoard` | `renameBoard(boardRoot: string, newName: string): Promise<string>` | Rename a board folder and transfer associated state. **Caution:** moves files and changes an open board's path. |
| `searchPublished` | `searchPublished(query?: string): Promise<PublishedBoardResult[]>` | Search the published-board catalog with local install annotations. |
| `getPublishedVersions` | `getPublishedVersions(id: string): Promise<PublishedVersionResult[]>` | Return published version history and compatibility/install flags. |
| `downloadPublished` | `downloadPublished(id: string, opts?: { dir?: string; version?: string }): Promise<string>` | Download, verify, extract, and record a board without trusting it. **Caution:** writes an archive's contents to disk. |
| `installPublished` | `installPublished(id: string, opts?: { dir?: string; version?: string }): Promise<string \| undefined>` | Start interactive installation or change an installed version. **Caution:** writes board files and may block on board/trust/close dialogs. |
| `uninstallBoard` | `uninstallBoard(id: string): Promise<boolean>` | Delete an installed catalog board after confirmation. **Caution:** removes board files and trust/pin state. |
| `checkPublishedUpdates` | `checkPublishedUpdates(force?: boolean): Promise<BoardUpdateInfo[]>` | Refresh the catalog and report compatible updates. |

`PublishedBoardResult`, `PublishedVersionResult`, and `BoardUpdateInfo` are plain result records;
they do not receive descriptors or children.

#### `boardVars` → `BoardVars`

Source: `src/renderer/api/types/board-vars.d.ts`

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `namespaceFor` | `namespaceFor(boardRoot: string): Promise<string>` | Resolve the namespace key used by a board's environment store. **Caution:** the first use can block on storage setup. |
| `get` | `get(namespace: string, name: string, env?: string): Promise<string \| undefined>` | Read one stored variable. **Caution:** can block on storage setup or an unlock prompt. |
| `set` | `set(namespace: string, name: string, value: string, env?: string): Promise<void>` | Persist one board environment value. **Caution:** can block on storage setup/unlock and writes a secret. |
| `list` | `list(namespace: string, env?: string): Promise<string[]>` | List variable names in a profile. **Caution:** can block on storage setup or an unlock prompt. |
| `listNamespaces` | `listNamespaces(): Promise<string[]>` | List configured environment namespaces. **Caution:** can block on storage setup or an unlock prompt. |
| `show` | `show(namespace?: string): Promise<void>` | Open the built-in environment-variable editor. **Caution:** opens a visible editor and can block on storage setup/unlock. |

#### `editors` → `EditorRegistry`

Source: `src/renderer/api/types/editors.d.ts`

| Member | Kind / exact signature | Summary |
|---|---|---|
| `getAll` | `getAll(): IEditorInfo[]` | Return all registered editors. |
| `getById` | `getById(id: EditorView): IEditorInfo \| undefined` | Find editor information by id. |
| `resolve` | `resolve(filePath: string): IEditorInfo \| undefined` | Resolve the best editor for a file path. |
| `resolveId` | `resolveId(filePath: string): EditorView \| undefined` | Resolve only the best editor id for a file path. |
| `getSwitchOptions` | `getSwitchOptions(languageId: string, filePath?: string): ISwitchOptions` | Return compatible editor-switch options for a language/path. |

`IEditorInfo` and `ISwitchOptions` are plain data/service results; no nested descriptor is planned
for the returned `getOptionLabel` function.

#### `recent` → `RecentFiles`

Source: `src/renderer/api/types/recent.d.ts`

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `files` | property `string[]` | Loaded recent paths, most recent first; `[]` until `load()` runs. |
| `load` | `load(): Promise<void>` | Load recent paths from disk. |
| `add` | `add(filePath: string): Promise<void>` | Add a path to the top, deduplicating and capping at 100. **Caution:** changes persisted recent-file history. |
| `remove` | `remove(filePath: string): Promise<void>` | Remove a path. **Caution:** changes persisted recent-file history. |
| `clear` | `clear(): Promise<void>` | Clear all recent paths. **Caution:** deletes persisted recent-file history. |

#### `downloads` → `Downloads`

Source: `src/renderer/api/types/downloads.d.ts`

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `downloads` | property `DownloadEntry[]` | Current download entries as plain data. |
| `hasActiveDownloads` | property `boolean` | Whether any download is currently active. |
| `aggregateProgress` | property `number` | Aggregate active-download progress. |
| `cancelDownload` | `cancelDownload(id: string): void` | Cancel a download. **Caution:** stops a user download. |
| `openDownload` | `openDownload(id: string): void` | Open a completed download. **Caution:** opens the downloaded file in the OS/app. |
| `showInFolder` | `showInFolder(id: string): void` | Reveal a download in its folder. **Caution:** opens/focuses an OS window. |
| `clearCompleted` | `clearCompleted(): void` | Clear completed download entries. **Caution:** removes download history from the manager. |

The declaration's `init(): Promise<void>` member is intentionally omitted from the agent-facing
descriptor because it is an internal bootstrap operation called by application startup. The
descriptor exposes the seven useful state/action members above.

#### `menuFolders` → `MenuFolders`

Source: `src/renderer/api/types/menu-folders.d.ts`

| Member | Kind / exact signature | Summary / flags |
|---|---|---|
| `folders` | property `readonly IMenuFolder[]` | Current configured sidebar folders as plain data. |
| `add` | `add(folder: { name: string; path?: string; files?: string[] }): string` | Add a configured folder and return its generated id. **Caution:** persists and changes the sidebar. |
| `remove` | `remove(id: string): void` | Remove a configured folder. **Caution:** persists a sidebar change. |
| `find` | `find(id: string): IMenuFolder \| undefined` | Find a configured folder by id. |
| `move` | `move(sourceId: string, targetId: string): void` | Reorder configured folders. **Caution:** persists a sidebar change. |

### Root summary corrections

`AiRoot.ROOT_MEMBERS` already includes all twelve requested names, but several summaries drift from the
actual declarations and implementation. The implementation must update
`src/renderer/scripting/ai-vision/root.ts` as follows:

| Current root summary | Corrected summary |
|---|---|
| `ui`: “Notifications, dialogs, the Log View.” | “Dialogs, notifications, progress overlays, screen locks, and app-window highlights.” |
| `shell`: “Open paths/URLs with the OS and run shell commands.” | “Open URLs, capture screen snippets, encrypt/decrypt text, and inspect runtime/update versions.” |
| `window`: “This window: title, size, focus, sidebar.” | “This window: state, sidebar, zoom, and multi-window actions.” |
| `boards`: “Boards — sandboxed mini web-apps: create, open, refresh.” | “Boards — sandboxed mini web-apps: create, open, trust, install, update, and remove.” |
| `menuFolders`: “Folders pinned to the menu bar.” | “Configured folders shown in the sidebar.” |

The existing root cautions for `fs`, `shell`, and `proc` remain, but the namespace member hints are
the authoritative detailed warnings. The `boardVars` root summary should also be made precise:
“Administer board environment variables and secrets.”

## Implementation Plan

### 1. Add exact-instance registry support

Change `src/shared/ai-vision/types.ts` without removing or weakening the constructor registry:

- Extend `IAiMember` with `node?: boolean` and this comment: `The value is itself an AiVision
  node; helpSearch may follow this property. Never set it on a getter with side effects.`
- Keep `registerAiVision(ctor, describe)` and its prototype-chain lookup working.
- Add `registerAiVisionFor(instance: object, describe: (instance: unknown) => IAiVisionDescriptor)`.
- Store factories in a module-private `WeakMap<object, DescriptorFactory>` so object literals can
  be keyed by identity without retaining arbitrary objects.
- In `getAiVision(value)`, preserve the precedence `value.aiVision` first, then consult the exact
  instance registry, then fall back to the existing constructor/prototype registry.
- Keep the function process-agnostic: no renderer imports or namespace registrations belong in
  shared types.

The `IAiMember` addition is:

```ts
readonly writable?: boolean;
/** The value is itself an AiVision node; `helpSearch` may follow this property. Never set it on a getter with side effects. */
readonly node?: boolean;
```

Before:

```ts
const registry = new Map<Constructor, DescriptorFactory>();

export function registerAiVision(ctor: Constructor, describe: DescriptorFactory): void {
    registry.set(ctor, describe);
}

export function getAiVision(value: unknown): IAiVisionDescriptor | undefined {
    if (isAiVisible(value)) return value.aiVision;
    // constructor/prototype lookup only
}
```

After:

```ts
const registry = new Map<Constructor, DescriptorFactory>();
const instanceRegistry = new WeakMap<object, DescriptorFactory>();

export function registerAiVisionFor(instance: object, describe: DescriptorFactory): void {
    instanceRegistry.set(instance, describe);
}

export function getAiVision(value: unknown): IAiVisionDescriptor | undefined {
    if (isAiVisible(value)) return value.aiVision;
    if (!value || typeof value !== "object") return undefined;
    const instanceFactory = instanceRegistry.get(value);
    if (instanceFactory) return instanceFactory(value);
    // retain the existing constructor/prototype lookup here
}
```

### 2. Create side-effect-only namespace descriptor modules

Create `src/renderer/scripting/ai-vision/namespaces/` with one module per requested namespace and
an `index.ts` registration module:

- `fs.ts` — export a `describeFileSystem` factory and the verified 23-member `FileSystem` list.
- `settings.ts` — export `describeSettings`, four members, and a non-sensitive summary.
- `ui.ts` — export `describeUserInterface`, eleven `IUserInterface` members, and no Log View
  `ui.log` member.
- `shell.ts` — export `describeShell`, plus `describeVersionService` and
  `describeEncryptionService` for its two plain-property nested services.
- `window.ts` — export `describeWindow` and the fourteen `IWindow` members.
- `proc.ts` — export `describeProcess` and the one `IProc.execute` member.
- `boards.ts` — export `describeBoards` and all twelve `IBoards` members.
- `board-vars.ts` — export `describeBoardVars` and all six `IBoardVars` members.
- `editors.ts` — export `describeEditorRegistry` and all five `IEditorRegistry` members.
- `recent.ts` — export `describeRecentFiles` and all five `IRecentFiles` members.
- `downloads.ts` — export `describeDownloads` and the seven agent-facing `IDownloads` members; omit internal `init`.
- `menu-folders.ts` — export `describeMenuFolders` and all five `IMenuFolders` members.
- `index.ts` — import the singleton values and register every factory with
  `registerAiVisionFor`: `fs` from `src/renderer/api/fs.ts`, `settings` from `settings.ts`, `ui`
  from `ui.ts`, `shell` from `shell/index.ts`, `appWindow` from `window.ts`, `proc` from
  `proc.ts`, `boards` from `boards.ts`, `boardVarsAdmin` from `board-vars/admin-api.ts`, and
  `editors`, `recent`, `downloads`, and `menuFolders` from their matching modules. Import `version`
  from `src/renderer/api/shell/version.ts` and `encryption` from
  `src/renderer/api/shell/encryption.ts` and register those exact nested identities with their
  nested factories.

Each factory must return `kind`, one-sentence `summary`, the static `members`, a useful help string,
and a compact `summarize()` closure. The summary must not expose settings secrets, password data,
file contents, process output, board catalog bodies, or download entry payloads. Suggested compact
summaries are:

| Kind | Summary shape |
|---|---|
| `FileSystem` | `{ kind: "FileSystem" }` |
| `Settings` | `{ kind: "Settings", theme: instance.theme }` |
| `UserInterface` | `{ kind: "UserInterface" }` |
| `Shell` | `{ kind: "Shell" }` |
| `VersionService` | `{ kind: "VersionService" }` |
| `EncryptionService` | `{ kind: "EncryptionService" }` |
| `Window` | `{ kind: "Window", windowIndex, isMaximized, menuBarOpen, zoomLevel }` |
| `Process` | `{ kind: "Process" }` |
| `Boards` | `{ kind: "Boards" }` |
| `BoardVars` | `{ kind: "BoardVars" }` |
| `EditorRegistry` | `{ kind: "EditorRegistry", editorCount: instance.getAll().length }` |
| `RecentFiles` | `{ kind: "RecentFiles", count: instance.files.length }` |
| `Downloads` | `{ kind: "Downloads", count: instance.downloads.length, active: instance.hasActiveDownloads }` |
| `MenuFolders` | `{ kind: "MenuFolders", count: instance.folders.length }` |

The implementation may use an equally compact safe shape where a getter is not initialized yet,
but must not read a side-effecting method merely to create a summary. In particular, do not call
`recent.load()`, catalog methods, dialogs, process methods, or filesystem reads from `summarize()`.

Representative before/after shape for the new `fs.ts` module:

Before:

```ts
// src/renderer/scripting/ai-vision/namespaces/fs.ts does not exist.
```

After:

```ts
import { fs } from "../../../api/fs";
import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const FILE_SYSTEM_MEMBERS: readonly IAiMember[] = [
    { name: "read", kind: "method", signature: "read(filePath: string, encoding?: string)", summary: "Read text." },
    { name: "write", kind: "method", signature: "write(filePath: string, content: string, encoding?: string)", summary: "Write text.", caution: "writes the user's disk" },
    // ...all remaining entries from the verified inventory above...
];

export function describeFileSystem(instance: unknown): IAiVisionDescriptor {
    const value = instance as typeof fs;
    return {
        kind: "FileSystem",
        summary: "File reads, writes, directories, dialogs, and OS file integration.",
        members: FILE_SYSTEM_MEMBERS,
        help: "Use read/readFile for text, exists/stat for checks, and write/delete only after confirming the target path.",
        summarize: () => ({ kind: "FileSystem" }),
    };
}
```

The actual implementation must contain every verified member, not the abbreviated comment in the
shape snippet. The namespace modules only export their factories and member/help constants;
`index.ts` performs all registration so the side-effect boundary is explicit and centralized.

The `shell.version` and `shell.encryption` member entries in `shell.ts` must set `node: true` so
help-search can follow those registered nested service instances. No namespace descriptor gets
`children()` or `index()`.

### 3. Pay registration only on the AiVision path

Add a side-effect import in `src/renderer/scripting/ai-vision/root.ts`:

```ts
import "./namespaces";
```

This is the chosen registration point. `call.ts` imports `root.ts`, and `helpSearch` is reached
through the same root; no startup module imports `namespaces/index.ts`. Do not import the registry
from `src/renderer/api/app.ts`, `src/renderer.ts`, `ScriptContext.ts`, or any `src/renderer/api/*.ts`
module. Confirm that creating an ordinary `ScriptContext` or booting the renderer does not load the
namespace registration module merely because the app services initialize.

### 4. Correct root summaries without changing root children

In `src/renderer/scripting/ai-vision/root.ts`, update only the drifted `ROOT_MEMBERS` summaries
listed above, and set `node: true` on exactly these twelve namespace members:
`fs`, `settings`, `ui`, `shell`, `window`, `proc`, `boards`, `boardVars`, `editors`, `recent`,
`downloads`, and `menuFolders`. Do not set it on `pages` or `page`, which are already reached
through `children()`, or on `windows`, which is served by the main process and is not resolvable in
the renderer. Keep the twelve property names and existing `children()` implementation intact; do
not add namespace entries to `children()`, and do not add a root `index()`.

Representative root-member change:

```ts
// Before
{ name: "fs", kind: "property", summary: "File system access (read/write files, list folders)." },
{ name: "windows", kind: "property", summary: "All Persephone windows ..." },

// After
{ name: "fs", kind: "property", node: true, summary: "File system access (read/write files, list folders)." },
{ name: "windows", kind: "property", summary: "All Persephone windows ..." },
```

### 5. Make static namespace members searchable safely

Update `src/shared/ai-vision/help-search.ts` so each visited descriptor is traversed in two ways:

1. Existing `children()` traversal remains the only route for dynamic pages, current facades, and
   other live children; retain restrictions, depth/node limits, deduplication, and instance-path
   ranking.
2. For descriptor members with `kind: "property"` and `node: true`, read that
   named property via the existing safe `stepTo()` helper. Queue it only when `getAiVision()`
   returns a descriptor. Build the static path with `joinChildPath()`. Do not invoke methods,
   index arrays, inspect returned plain data, or read properties without the explicit `node: true`
   opt-in.

This lets `helpSearch("read file")` visit registered `fs` and match its `readFile` member, while
`AiRoot.children()` remains exactly the live pages/active-page list. The actual declaration name is
`readFile`; there is no `fs.readText` member in `src/renderer/api/types/fs.d.ts`.

Before:

```ts
for (const child of descriptor.children?.() ?? []) {
    // enqueue only dynamic children
}
```

After:

```ts
for (const member of descriptor.members) {
    if (member.kind !== "property" || member.node !== true) continue;
    const childNode = await stepTo(node, `.${member.name}`);
    if (getAiVision(childNode)) {
        queue.push({ node: childNode, path: joinChildPath(path, `.${member.name}`), depth: depth + 1 });
    }
}
for (const child of descriptor.children?.() ?? []) {
    // retain the existing dynamic-child path, restriction, and enqueue logic
}
```

The code must retain the existing `seenKinds`, `MAX_NODES`, `MAX_DEPTH`, and `dedupe` behavior.

### 6. Validate implementation completeness and live behavior

- Compare every descriptor entry against its `.d.ts` file and the matching exported singleton.
- Confirm the 12 direct counts and the nested shell counts in the tables above.
- Confirm every destructive/user-visible member has `caution`, including filesystem dialogs,
  `shell.openExternal`, process spawn, settings persistence, board actions, downloads, and UI
  actions.
- Confirm no property is marked `writable: true`; the resolver must reject assignment to all
  namespace properties because all declared properties are readonly or getter-only.
- Confirm no descriptor has `children()` or `index()` and no returned data interface was registered.
- Confirm `getAiVision()` still resolves constructor-registered values after instance lookup was
  added.
- Run the repository's normal TypeScript/lint checks after implementation, but do not add unit
  tests or a test harness; this project does not use them.
- Perform the live `call` and `helpSearch` checks listed below after implementation.

## Concerns

### Resolved during investigation

- **Can the existing constructor registry describe `proc` and `boards`?** No. Both exports are
  object literals typed as `IProc`/`IBoards`, so the plan uses exact-instance `WeakMap` registration.
- **Can the API singleton files gain `aiVision`?** No. The task explicitly preserves their public
  declarations and implementation objects; descriptors are separate modules.
- **Should namespace objects be root `children()`?** No. They are static root members by the epic's
  decision; static help-search traversal handles discoverability without changing live children.
- **Does `shell.run` need a descriptor?** No. The verified `IShell` declaration has no `run`
  member; its process-spawning operation is `proc.execute`, while `shell.openExternal` is the
  external-application action that receives `caution`.
- **Should `ui.log` be nested under `app.ui`?** No. `app.ui` is `IUserInterface`; `ui-log.d.ts`
  describes a separate global callable `ui` installed by `ScriptContext`.
- **Should result interfaces and process handles get descriptors?** No. They are returned values,
  not plain properties under the root namespaces. Plain records are shaped by `result-shaper.ts`,
  and the returned `IExecuteHandle` is intentionally outside this namespace task.
- **Can help search infer safe properties from missing `caution`?** No. `IAiMember.node` is an
  explicit opt-in: the walker follows only `node: true` properties. `caution` is orthogonal — it
  describes what a node's members do (`fs` writes), not whether reading the property is safe, so
  the root's cautioned `fs`/`shell`/`proc` entries are still traversable, and
  never invokes methods. This preserves the side-effect safety that comes from cooperative
  discovery and avoids reading `PageWrapper.content`, free-form `data`, recent/download/folder
  arrays, or creating a grouped page merely to discard them.
- **Are any namespace properties writable?** No. Every listed declaration property is readonly or
  implemented as a getter-only public member. The descriptor must not invent writable assignments.

### Scope boundaries to preserve

Do not implement or describe `app.events`, `app.fetch`, `app.runAsync`, `io`/`pipe`, `script`,
`tools`, `guides`, or `main`; those belong to other tasks. Do not modify the API singleton files,
the namespace `.d.ts` files, `resolver.ts`, `hint.ts`, or the existing page/facade descriptors for
this task.

## Acceptance Criteria

- [ ] `call` with `path: ""` returns the existing root plus all twelve namespace members, with the
      corrected summaries for `ui`, `shell`, `window`, `boards`, `boardVars`, and `menuFolders`.
- [ ] `call` with `path: "settings"` returns the `Settings` hint with exactly `theme`, `get`,
      `set`, and `onChanged`; `set` has `caution` and `theme` is not writable.
- [ ] `call` with `path: "fs.exists"` and `args: ["C:\\Windows"]` returns `true` on the Windows
      test machine, and `call path:"fs.readFile"` returns shaped `{ content, encoding }` data
      without an AiVision descriptor for `ITextFile`.
- [ ] `call` with `path: "fs"` lists all 23 verified members, including `read`, `readFile`,
      `readBinary`, all write/delete/directory methods, all three dialogs, and both explorer
      actions, with cautions on each side-effecting member.
- [ ] `call` with `path: "shell"` lists four direct members; `call path:"shell.version"` lists
      `runtimeVersions` and `checkForUpdates`; `call path:"shell.encryption"` lists all three
      encryption methods.
- [ ] `call` with `path: "window"`, `"proc"`, `"boards"`, `"boardVars"`, `"editors"`,
      `"recent"`, `"downloads"`, and `"menuFolders"` returns the exact counts and signatures in
      this document: `window` has 14 members and `downloads` has 7 agent-facing members because
      internal `downloads.init` is omitted. `proc.execute`, board mutations, persisted recent-file
      mutations, download actions, and folder mutations are visibly marked with `caution`.
- [ ] `call` with `path: "helpSearch"` and `args: ["read file"]` finds the callable member path
      `fs.readFile` (the declaration has no `fs.readText`) because root member `fs` is explicitly
      marked `node: true`; the same run does not read `page.content`, `recent.files`,
      `downloads.downloads`, or `menuFolders.folders`, and does not create a grouped page.
- [ ] `call` with `path: "ui.log"` is rejected as an unknown member of `UserInterface`; the
      descriptor does not advertise the separate global `IUiLog` surface.
- [ ] `helpSearch` still finds dynamic facade paths such as `pages[i].asGrid().addRows` and does
      not create a grouped page while traversing the `node: true` static namespace properties or
      live children; non-node data properties such as `page.content` are never traversed.
- [ ] `getAiVision()` resolves the exact registered class instances and the `proc`/`boards` object
      literals, while an existing constructor-registered object still resolves through the original
      registry path.
- [ ] No namespace descriptor exposes `children()` or `index()`, no member is marked
      `writable: true`, returned data/handles are not registered as namespace children, and only
      the twelve root namespaces plus `shell.version`/`shell.encryption` carry `node: true`.
- [ ] Registration is loaded by `src/renderer/scripting/ai-vision/root.ts` only; ordinary app
      startup and `src/renderer/api/*.ts` remain free of the AiVision namespace registration side
      effect.
- [ ] TypeScript and lint checks pass after implementation. No unit tests or test harnesses are
      added.

## Files Changed Summary

| File | Current status | Planned change |
|---|---|---|
| `doc/tasks/US-1292-app-namespaces/README.md` | New task document | Record the verified namespace inventory, implementation plan, concerns, and live acceptance checks. |
| `doc/active-work.md` | Existing dashboard row has no link | Replace the US-1292 placeholder with a linked task entry under EPIC-083. |
| `doc/epics/EPIC-083.md` | Linked task row has no link | Link the US-1292 row to this task document and update its title to include all scoped namespaces. |
| `src/shared/ai-vision/types.ts` | Constructor-only registry and no traversal opt-in | Add `IAiMember.node`, `registerAiVisionFor()`, and exact-instance lookup while preserving constructor lookup. |
| `src/shared/ai-vision/help-search.ts` | Dynamic `children()` traversal only | Follow only `IAiMember.node === true` plain properties, never every uncautioned property, so static namespaces are searchable without reading data properties. |
| `src/renderer/scripting/ai-vision/root.ts` | Root members exist; several summaries drift | Import namespace registration on the AiVision path, correct verified namespace summaries, and mark exactly the twelve renderer namespaces with `node: true`; keep `children()` unchanged. |
| `src/renderer/scripting/ai-vision/namespaces/fs.ts` | New | Describe/register `FileSystem`. |
| `src/renderer/scripting/ai-vision/namespaces/settings.ts` | New | Describe/register `Settings`. |
| `src/renderer/scripting/ai-vision/namespaces/ui.ts` | New | Describe/register `UserInterface`; do not add global `ui.log`. |
| `src/renderer/scripting/ai-vision/namespaces/shell.ts` | New | Describe/register `Shell`, `VersionService`, and `EncryptionService`. |
| `src/renderer/scripting/ai-vision/namespaces/window.ts` | New | Describe/register `Window`. |
| `src/renderer/scripting/ai-vision/namespaces/proc.ts` | New | Describe/register `Process` for the plain `proc` object. |
| `src/renderer/scripting/ai-vision/namespaces/boards.ts` | New | Describe/register `Boards` for the plain `boards` object. |
| `src/renderer/scripting/ai-vision/namespaces/board-vars.ts` | New | Describe/register `BoardVars`. |
| `src/renderer/scripting/ai-vision/namespaces/editors.ts` | New | Describe/register `EditorRegistry`. |
| `src/renderer/scripting/ai-vision/namespaces/recent.ts` | New | Describe/register `RecentFiles`. |
| `src/renderer/scripting/ai-vision/namespaces/downloads.ts` | New | Describe/register `Downloads`. |
| `src/renderer/scripting/ai-vision/namespaces/menu-folders.ts` | New | Describe/register `MenuFolders`. |
| `src/renderer/scripting/ai-vision/namespaces/index.ts` | New | Register all namespace singleton identities and nested shell service identities. |

### Files verified and intentionally requiring no US-1292 implementation change

| File / area | Reason |
|---|---|
| `src/renderer/api/fs.ts`, `settings.ts`, `ui.ts`, `window.ts`, `proc.ts`, `boards.ts`, `editors.ts`, `recent.ts`, `downloads.ts`, `menu-folders.ts`, `shell/index.ts`, `board-vars/admin-api.ts` | Existing singleton implementations and public behavior are the source objects; the fixed design forbids adding `aiVision` to them. |
| `src/renderer/api/types/fs.d.ts`, `settings.d.ts`, `ui.d.ts`, `ui-log.d.ts`, `shell.d.ts`, `window.d.ts`, `proc.d.ts`, `boards.d.ts`, `board-vars.d.ts`, `editors.d.ts`, `recent.d.ts`, `downloads.d.ts`, `menu-folders.d.ts` | Verified authoritative member names, signatures, JSDoc summaries, and readonly properties; do not alter declarations. |
| `src/renderer/scripting/api-wrapper/AppWrapper.ts` | Already delegates every requested root member to the existing app singleton. |
| `src/renderer/scripting/ScriptContext.ts` and `src/renderer/scripting/api-wrapper/UiFacade.ts` | Confirmed the global `ui: IUiLog` boundary; no `app.ui` change belongs here. |
| `src/shared/ai-vision/resolver.ts` | Existing resolver already consults descriptors, enforces member names/cautions through hints, and refuses non-writable assignments. |
| `src/shared/ai-vision/hint.ts` | Existing formatting already emits `caution` and `writable` flags. |
| `src/shared/ai-vision/result-shaper.ts` | Existing shaping is sufficient for plain data and undecorated returned values. |
| `src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts`, `PageWrapper.ts`, and existing facade files | Existing reviewed descriptor pattern and dynamic-child behavior are reused; no page/facade changes are in scope. |
