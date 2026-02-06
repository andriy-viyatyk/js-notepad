# US-007: About Page and Version Check

## Overview

Create an "About" page to display application information and implement automatic version checking to notify users when updates are available.

## Goals

1. **About Page** - A dedicated page (opens as a tab) showing:
   - Application name and current version
   - Electron, Node.js, and Chromium versions
   - "Check for Updates" button
   - Links to GitHub releases and What's New documentation

2. **Version Check System** - Automatic update notification:
   - Check on application startup
   - Check periodically (once per day)
   - Show notification when new version is available
   - No automatic updates - user downloads manually

## Proposed Architecture

### About Page

Create a new page type `aboutPage` with its own editor:

```
/editors/about/
├── index.ts              # EditorModule export
├── AboutPage.tsx         # Main component
└── AboutPageModel.ts     # Page model (minimal state)
```

**Registration:**
```typescript
editorRegistry.register({
    id: "about-view",
    name: "About",
    pageType: "aboutPage",
    category: "page-editor",
    priority: 100,
    loadModule: async () => import("./about"),
});
```

**Opening About Page:**
- Add menu item: Help → About
- Could also add to sidebar or command palette later

### Version Check Approach

**Recommended: GitHub Releases API**

Query the GitHub API to get latest release:
```
GET https://api.github.com/repos/andriy-viyatyk/js-notepad/releases/latest
```

Response includes:
- `tag_name` - Version string (e.g., "v1.0.5")
- `html_url` - Direct link to release page
- `published_at` - Release date
- `body` - Release notes (markdown)

**Why GitHub API:**
- Free, no server infrastructure needed
- Works with public repositories
- Rate limit: 60 requests/hour (more than enough for daily checks)
- Returns all needed information

**Version Service:**
```
/core/services/version/
├── VersionService.ts     # Check logic, comparison, caching
└── version-store.ts      # Store for update state (optional)
```

**Check Logic:**
1. On app start: check if 24+ hours since last check
2. If yes: fetch latest release from GitHub API
3. Compare versions (semver comparison)
4. If newer version available:
   - Store update info
   - Show notification via `alertInfo()`
   - Show details in About page

**Storage:**
- Last check timestamp in `settings-store` or localStorage
- Latest known version info (avoid repeated notifications)

### About Page UI

```
┌─────────────────────────────────────────────────┐
│  [App Icon]                                     │
│                                                 │
│  js-notepad                                     │
│  Version 1.0.5                                  │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  Electron: 39.0.0                               │
│  Node.js: 20.x.x                                │
│  Chromium: 128.x.x                              │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  [Check for Updates]                            │
│                                                 │
│  ✓ You're up to date                            │
│  -- or --                                       │
│  ⚠ New version 1.0.6 available!                 │
│    [Download Latest] [What's New]               │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  [GitHub Repository]  [Report Issue]            │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Version Service
- [ ] Create `VersionService.ts` with GitHub API integration
- [ ] Implement version comparison (semver)
- [ ] Add last check timestamp storage
- [ ] Add `checkForUpdates()` method

### Phase 2: About Page
- [ ] Create `AboutPageModel` (minimal - just page identity)
- [ ] Create `AboutPage.tsx` component
- [ ] Display app version from `package.json`
- [ ] Display runtime versions (Electron, Node, Chromium)
- [ ] Integrate with VersionService for update status
- [ ] Add "Check for Updates" button
- [ ] Add external links (GitHub releases, What's New, Report Issue)

### Phase 3: Registration & Integration
- [ ] Add `aboutPage` to `PageType` in `shared/types.ts`
- [ ] Add `about-view` to `PageEditor` in `shared/types.ts`
- [ ] Register editor in `register-editors.ts`
- [ ] Add menu item to open About page
- [ ] Create helper function to open About page programmatically

### Phase 4: Auto-Check on Startup
- [ ] Add version check to app initialization
- [ ] Show `alertInfo()` notification when update available
- [ ] Make notification clickable to open About page
- [ ] Implement 24-hour check interval

### Phase 5: Documentation
- [ ] Update what's new document
- [ ] Update user documentation
- [ ] Clean up task folder

## Technical Notes

### Getting App Version

In Electron with nodeIntegration:
```typescript
// From package.json
const { version } = require("../../package.json");

// Or via electron
const { app } = require("@electron/remote");
const version = app.getVersion();
```

### Getting Runtime Versions
```typescript
const versions = {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
};
```

### Opening External URLs
```typescript
const { shell } = require("electron");
shell.openExternal("https://github.com/...");
```

### GitHub API Request
```typescript
async function getLatestRelease(): Promise<Release | null> {
    const response = await fetch(
        "https://api.github.com/repos/andriy-viyatyk/js-notepad/releases/latest"
    );
    if (!response.ok) return null;
    return response.json();
}
```

## Acceptance Criteria

- [ ] About page opens as a tab with app and runtime version info
- [ ] "Check for Updates" button fetches latest version from GitHub
- [ ] Update status displayed (up-to-date or new version available)
- [ ] Links to download and what's new work correctly
- [ ] Auto-check runs on startup (if 24+ hours since last check)
- [ ] Notification appears when new version is available
- [ ] No automatic downloads or installations

## Risks & Considerations

1. **Offline Mode**: Handle network errors gracefully - don't show errors, just skip update check
2. **Rate Limiting**: 60 req/hour is plenty, but cache results to be safe
3. **Pre-release Versions**: Decide whether to notify about pre-releases (probably not)
4. **Version Format**: Ensure consistent version format in releases (semver: v1.0.5)

## Dependencies

- None (uses native fetch and Electron APIs)

## Estimated Effort

Medium - 2-3 development sessions

---

*Created: 2026-02*
