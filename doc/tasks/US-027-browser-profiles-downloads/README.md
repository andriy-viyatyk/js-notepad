# US-027: Browser Profiles & Incognito Mode

## Status

**Status:** Completed
**Priority:** Medium
**Started:** 2026-02-21
**Completed:** 2026-02-21
**Depends on:** US-026 (Browser Internal Tabs)

## Summary

Add named browser profiles (each with its own isolated storage/cookies) and incognito mode (ephemeral session cleared on close) to the browser editor.

## Why

- Different profiles allow separate logins (e.g., personal vs work accounts)
- Incognito mode for private browsing without persistent state

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

- Profiles are stored in app settings (list of `{ name, color }` entries)
- Profiles are assigned when creating a new browser page (via quick add menu), not changed afterward
- Default profile can be configured in Settings

### Profile Colors

Profile colors come from the `TAG_COLORS` palette in `palette-colors.ts` (shared with ToDo tags) — 11 named browser colors. The built-in default profile uses `DEFAULT_BROWSER_COLOR` (cyan `#4DD0E1`), also defined in `palette-colors.ts`. When a user creates a profile, they pick a name and a color. The color appears as the page tab icon tint. Profile colors can be changed after creation by clicking the color dot in Settings (opens a popup menu with the color palette).

## UI Design

### Page Tab Icon

The js-notepad page tab icon changes based on the profile:

| Mode | Page Tab Icon |
|------|---------------|
| Default profile (no name) | GlobeIcon tinted with `DEFAULT_BROWSER_COLOR` or the default profile's color |
| Named profile | GlobeIcon tinted with the profile's color |
| Incognito | IncognitoIcon (spy hat + glasses) |

The `resolvedColor` getter on `BrowserPageModel` resolves the color chain: explicit profile → default profile setting → `DEFAULT_BROWSER_COLOR`.

**Important:** Favicons are shown only in the internal browser tabs panel (left side), NOT in the js-notepad page tab. The page tab always shows the globe or incognito icon.

### Quick Add Menu

The "+" quick add menu in the page tabs bar:

| Item | Action |
|------|--------|
| **Browser** | Opens a new browser page with the default profile (existing behavior) |
| **Browser profile...** ▸ | Submenu with profile options (see below) |

**"Browser profile..." submenu:**

| Item | Action |
|------|--------|
| **Incognito** | Opens a new browser page in incognito mode |
| *User profile 1* | Opens a new browser page with this profile |
| *User profile 2* | Opens a new browser page with this profile |
| --- | Separator |
| **Manage profiles...** | Opens Settings page scrolled to Browser Profiles section |

**Default state** (no user-created profiles): The submenu shows only "Incognito" and "Manage profiles...".

### Settings Page — Browser Profiles Section

A "Browser Profiles" section in the Settings page:

- Non-removable "Default" profile row at top (cyan color dot, "set default" / "default" badge)
- List of user-created profiles, each showing: clickable color dot (opens color picker popup), name, "set default" / "default" badge, "clear data" button (hover-visible), remove button (hover-visible)
- Add profile form: name input + Add button + "Profile color:" label + inline color palette
- "Clear data" button per profile (including Default) — confirmation dialog, clears cookies/storage/cache via IPC
- Deleting a profile shows confirmation dialog and also clears all data from disk

### Incognito Indicator

Incognito pages show an IncognitoIcon inside the URL bar's left edge (using the `startButtons` prop on `TextField`), tinted with `color.icon.light`.

## Acceptance Criteria

- [x] Globe icon tinted with profile color for page tabs (cyan for default, profile color for named)
- [x] Incognito icon for incognito mode page tabs
- [x] Favicons shown only in internal tabs panel, not in page tab
- [x] Quick add menu: "Browser" opens default profile (icon reflects default profile color), "Browser profile..." submenu with Incognito/profiles/Manage
- [x] Multiple named profiles with isolated sessions (cookies, storage, cache)
- [x] Profile list managed in app settings (name + color, using TAG_COLORS palette)
- [x] Profile color changeable via popup menu (same pattern as ToDo tag colors)
- [x] Incognito mode — ephemeral partition cleared on tab close
- [x] Incognito icon shown inside URL bar for incognito pages
- [x] Settings page "Browser Profiles" section (add/remove profiles, default profile selector, color picker)
- [x] "Clear data" button per profile (confirmation dialog, clears cookies/storage/cache from disk)
- [x] Confirmation dialog on profile delete (also clears data from disk)
- [x] Profile per js-notepad browser tab (all internal tabs share same profile)
- [x] Save/restore profile selection in session state
- [x] DEFAULT_BROWSER_COLOR constant for built-in default profile (cyan #4DD0E1)
- [x] Documentation updated
- [x] No regressions in existing functionality

## Files Modified

### New Files

- `src/renderer/theme/palette-colors.ts` — `DEFAULT_BROWSER_COLOR` constant and `TAG_COLORS` palette (moved from `todoColors.ts` to avoid circular dependency)

### Modified Files

- `src/renderer/editors/browser/BrowserPageModel.ts` — Added `profileName`, `isIncognito` to state; `partition` getter; `resolvedColor` getter; `getPartitionString()` helper; `getIcon()` returns GlobeIcon/IncognitoIcon; save/restore profile in `getRestoreData`/`applyRestoreData`
- `src/renderer/editors/browser/BrowserPageView.tsx` — Dynamic partition passed to webviews; IncognitoIcon in URL bar via `startButtons`
- `src/renderer/store/app-settings.ts` — Added `BrowserProfile` type, `browser-profiles` and `browser-default-profile` settings keys
- `src/renderer/store/page-actions.ts` — Extended `showBrowserPage()` with `ShowBrowserPageOptions` (`profileName`, `incognito`)
- `src/renderer/editors/settings/SettingsPage.tsx` — Added "Browser Profiles" section (profile list, add form, color picker, clear data, delete confirmation); fixed `justifyContent` scroll bug
- `src/renderer/features/tabs/PageTabs.tsx` — Added "Browser profile..." submenu with reactive default profile color
- `src/renderer/theme/language-icons.tsx` — Added `IncognitoIcon`
- `src/renderer/editors/todo/todoColors.ts` — Re-exports `TAG_COLORS` from `palette-colors.ts`
- `src/renderer/components/basic/TextField.tsx` — Added `startButtons` prop
- `src/ipc/browser-ipc.ts` — Added `clearProfileData` IPC channel
- `src/main/browser-service.ts` — Added `ipcMain.handle` for clearing session data

## Implementation Progress

### Phase 1: Settings & Profile Data Model — Done
- [x] Define profile type (`{ name: string, color: string }`) in app settings
- [x] Add browser profiles list and default profile to app settings store
- [x] Add "Browser Profiles" section to Settings page (add/remove, name + color picker using TAG_COLORS)
- [x] Default profile selector in Settings
- [x] Non-removable "Default" profile row in list

### Phase 2: Profile-Aware Browser Pages — Done
- [x] Add `profileName` and `isIncognito` to BrowserPageModel state
- [x] Map profile name to partition string (`persist:browser-<name>` or `browser-incognito-<id>`)
- [x] Pass dynamic partition to `<webview>` elements
- [x] Extend `showBrowserPage()` to accept `{ profileName?: string, incognito?: boolean }`
- [x] Save/restore profile selection in session state (`getRestoreData`/`applyRestoreData`)

### Phase 3: Icons & UI — Done
- [x] Create `IncognitoIcon` in language-icons
- [x] Change `getIcon()` to return GlobeIcon tinted with profile color, or IncognitoIcon
- [x] Incognito icon inside URL bar (via TextField startButtons) for incognito pages
- [x] Add "Browser profile..." submenu to quick add menu in PageTabs
- [x] Submenu: Incognito, user profiles (with color-tinted globe icon), separator, Manage profiles...
- [x] "Browser" quick add icon reactively shows default profile color
- [x] Profile color changeable via popup menu on color dot

### Phase 4: Incognito Mode — Done
- [x] Generate unique non-persist partition for incognito tabs (`browser-incognito-<uuid>`)
- [x] Incognito icon in page tab
- [x] Visual incognito indicator in URL bar
- [x] Clean up incognito partition when tab closes (Electron handles automatically for non-persist partitions)

### Phase 5: Clear Profile Data — Done
- [x] Add IPC channel for clearing session data (`session.fromPartition(partition).clearStorageData()` + `clearCache()`)
- [x] "Clear data" button per profile row in Settings page (including Default profile)
- [x] Confirmation dialog before clearing
- [x] Visual feedback after clearing (brief "Cleared" text, 2s timeout)
- [x] Confirmation dialog on profile delete (also clears data from disk)

## Notes

### 2026-02-19
- Split from original US-021 vision. This task adds profiles on top of US-025/US-026's browsing foundation.
- Electron sessions are per-partition. Each unique partition string creates an isolated session with its own cookies, localStorage, cache.
- Tor network support is a future consideration (not in scope for this task).

### 2026-02-21
- Downloads extracted to separate task US-030 (Download Manager) — a standalone page-editor reusable across the app, not just the browser.
- Originally planned ChromiumIcon for page tabs, but GlobeIcon looked better at small sizes — reverted to GlobeIcon with profile color tinting.
- Originally planned toolbar profile indicator (name + color dot), but removed as unnecessary — profile color on the page tab icon is sufficient.
- `TAG_COLORS` moved from `todoColors.ts` to `palette-colors.ts` to avoid circular dependency (importing from todo editor in SettingsPage caused "Cannot access 'PageModel' before initialization").
- `partition` is a getter (not a stored field) because `showBrowserPage()` sets profile state after model construction. Each incognito model has a stable `incognitoId` (random UUID) to keep the partition consistent.
- Removed "Light Sea Green" from TAG_COLORS (too close to default cyan). Added `DEFAULT_BROWSER_COLOR` constant.
- Settings page scroll bug fixed: `justifyContent: "center"` on overflow container made top unreachable; replaced with `margin: "auto 0"` on the card.

## Related

- Depends on: [US-025 Basic Browser Editor](../US-025-basic-browser-editor/README.md)
- Depends on: [US-026 Browser Internal Tabs](../US-026-browser-internal-tabs/README.md)
- Related: [US-030 Download Manager](../US-030-download-manager/README.md) (integrates with profile sessions)
- Next: [US-028 Browser Bookmarks](../US-028-browser-bookmarks/README.md)
