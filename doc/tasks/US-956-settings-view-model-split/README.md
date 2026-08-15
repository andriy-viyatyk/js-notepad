# US-956: SettingsView model-view decomposition

## Goal

Decompose the Settings editor into focused section components and component models, so async
settings I/O and event handling no longer live inside the single `SettingsView.tsx` render file.
Preserve all existing settings behavior and UI.

## Background

`src/renderer/editors/settings/SettingsView.tsx` combines the Settings page shell with fourteen
sections. Its most stateful sections are `McpSection` (MCP/Mneme status subscriptions, port
validation and clipboard feedback), `BrowserProfilesSection` (profile CRUD, bookmark file
selection and partition-data clearing), and `DefaultBrowserSection` (registration status and
actions). The latter currently invokes its status check through a `useState` initializer, which
runs during rendering instead of as a mount effect.

The project model-view standard calls for `TComponentModel` when a component has several hooks
or asynchronous event handlers. Models use `TComponentState`, `useComponentModel`, arrow
function handlers, and `effect()` registrations from `init()`; their views render from model
state and bind the model methods.

## Implementation plan

- [x] Create `editors/settings/sections/` and relocate the high-state Settings sections from the page shell.
- [x] Extract the remaining settings-bound sections, theme chooser, and file-search controls so
  `SettingsView.tsx` contains only page layout and section ordering.
- [x] Add a browser-profiles component model for profile CRUD, bookmark-file selection, Tor
  profile actions, and partition-data clearing.
- [x] Add an MCP component model for MCP/Mneme status subscriptions, port input synchronization,
  validation, toggle actions, configuration text, and clipboard feedback.
- [x] Add a default-browser component model for registration status and register/unregister
  actions; load status through its lifecycle rather than during rendering.
- [x] Leave simple settings-bound sections as views where a model would add no value.
- [x] Reduce `SettingsView.tsx` to page composition while retaining its rendered section order,
  labels, and setting keys.
- [x] Run typecheck, lint, and a diff whitespace check.
- [ ] Perform a targeted live Settings smoke test if the running development instance is available.

Static verification is complete. A live smoke test was not available in this session: no dev
listener was visible on the expected local ports, and the Persephone MCP guide request timed out.

## Concerns / open questions

- Browser profiles use Electron partition clearing and native file dialogs, so model disposal
  must not leave renderer-event subscriptions active or update an unmounted view.
- The work is structural only: no persisted setting key, generated MCP configuration format, or
  user-visible feature behavior should change.

## Acceptance criteria

- `SettingsView.tsx` is a small page composer, with section implementations in
  `settings/sections/`.
- Browser profiles, MCP, and default-browser operations each use a focused component model.
- Default-browser registration status is fetched after mount, not during render.
- Existing toggles, port validation, profile/bookmark actions, MCP config copying, and all
  settings persistence retain their behavior.
- `npm run typecheck`, `npm run lint`, and `git diff --check` pass.
