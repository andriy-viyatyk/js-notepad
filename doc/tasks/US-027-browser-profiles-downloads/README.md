# US-027: Browser Profiles, Incognito & Downloads

## Status

**Status:** Planned
**Priority:** Medium
**Started:** —
**Completed:** —
**Depends on:** US-026 (Browser Internal Tabs)

## Summary

Add named browser profiles (each with its own isolated storage/cookies), incognito mode (ephemeral session cleared on close), and file download support to the browser editor.

## Why

- Different profiles allow separate logins (e.g., personal vs work accounts)
- Incognito mode for private browsing without persistent state
- Download support is essential for a usable browser experience

## Profile Architecture

### Partition Mapping

Each profile maps to an Electron session partition:

| Mode | Partition | Persistence |
|------|-----------|-------------|
| Default profile | `persist:browser-default` | Persists across restarts |
| Named profile "work" | `persist:browser-work` | Persists across restarts |
| Named profile "dev" | `persist:browser-dev` | Persists across restarts |
| Incognito | `browser-incognito-<id>` | Cleared when tab closes |

- All internal tabs within a single browser page share the same profile
- Profile is selected per js-notepad tab (browser editor instance)
- Incognito partitions use no `persist:` prefix, so Electron discards them on session end

### Profile Management

- Profiles are stored in app settings (list of profile names)
- Profile selector dropdown in browser toolbar
- Changing profile on an existing tab reloads all internal tabs with the new partition
- Default profile can be configured in Settings

## Acceptance Criteria

- [ ] Profile selector dropdown in browser toolbar
- [ ] Multiple named profiles with isolated sessions (cookies, storage, cache)
- [ ] Profile list managed in app settings (add/remove profiles)
- [ ] Incognito mode — ephemeral partition cleared on tab close
- [ ] Visual indicator for incognito mode (icon or toolbar style change)
- [ ] Profile per js-notepad browser tab (all internal tabs share same profile)
- [ ] File downloads work via main-process `session.on('will-download')`
- [ ] Download progress indicator (toolbar badge or notification)
- [ ] Downloads can be cancelled
- [ ] Default download directory configurable in Settings
- [ ] Documentation updated
- [ ] No regressions in existing functionality

## Files to Modify

### New Files

- `src/renderer/editors/browser/BrowserProfileSelector.tsx` — Profile dropdown component
- `src/main/browser-downloads.ts` — Main-process download handling via session `will-download`

### Modified Files

- `src/renderer/editors/browser/BrowserPageModel.ts` — Add profile/partition state, incognito flag
- `src/renderer/editors/browser/BrowserPageView.tsx` — Pass partition to webview elements
- `src/renderer/editors/browser/BrowserToolbar.tsx` — Add profile selector, download indicator, incognito badge
- `src/renderer/store/app-settings.ts` — Add browser profiles list, default profile, download directory
- `src/renderer/editors/settings/SettingsPage.tsx` — Add browser settings section (profiles, downloads)
- `src/ipc/api-types.ts` — Add IPC endpoints for download events
- `src/main/index.ts` or `src/main/open-window.ts` — Register download handlers on browser sessions

## Implementation Progress

### Phase 1: Profile Support
- [ ] Add browser profiles to app settings (list of names, default profile)
- [ ] Create profile selector dropdown component
- [ ] Map profile name to partition string
- [ ] Pass partition to webview element
- [ ] Handle profile change (reload webviews with new partition)
- [ ] Save/restore profile selection in session state

### Phase 2: Incognito Mode
- [ ] Add incognito option to profile selector
- [ ] Generate unique non-persist partition for incognito tabs
- [ ] Visual incognito indicator (toolbar style or icon)
- [ ] Clean up incognito partition when tab closes

### Phase 3: Downloads
- [ ] Register `will-download` handler on browser session partitions in main process
- [ ] IPC events: download started, progress, completed, failed, cancelled
- [ ] Download progress indicator in browser toolbar
- [ ] Cancel download action
- [ ] Default download directory in app settings
- [ ] Settings page section for browser preferences (profiles, download dir)

## Notes

### 2026-02-19
- Split from original US-021 vision. This task adds profiles and downloads on top of US-025/US-026's browsing foundation.
- Electron sessions are per-partition. Each unique partition string creates an isolated session with its own cookies, localStorage, cache.
- Downloads require main-process handling because `session.on('will-download')` only works in the main process. IPC is needed to report progress to the renderer.
- Tor network support is a future consideration (not in scope for this task).

## Related

- Depends on: [US-025 Basic Browser Editor](../US-025-basic-browser-editor/README.md)
- Depends on: [US-026 Browser Internal Tabs](../US-026-browser-internal-tabs/README.md)
- Next: [US-028 Browser Bookmarks](../US-028-browser-bookmarks/README.md)
