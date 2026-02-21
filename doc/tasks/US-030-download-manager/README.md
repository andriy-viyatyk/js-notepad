# US-030: Download Manager

## Status

**Status:** Planned
**Priority:** Medium
**Started:** —
**Completed:** —
**Depends on:** US-025 (Basic Browser Editor)

## Summary

Add a standalone Download Manager as a separate page-editor. It tracks file downloads initiated from the browser editor (and potentially other editors), shows progress, and allows cancelling or opening completed downloads. Designed as a reusable component that any editor can integrate with.

## Why

- File downloads are essential for a usable browser experience
- A standalone download manager page (separate editor) allows reuse across the app — not just the browser
- Other editors could trigger downloads (e.g., clicking links in Markdown preview, downloading files from URLs)
- Centralizes download state and history in one place

## Acceptance Criteria

- [ ] Download Manager as a page-editor (opens as a js-notepad tab)
- [ ] Main-process `session.on('will-download')` handling for browser webview sessions
- [ ] Download list showing: filename, URL, progress, status (downloading/completed/failed/cancelled)
- [ ] Progress indicator per download (progress bar or percentage)
- [ ] Cancel active downloads
- [ ] Open completed downloads (open file or show in folder)
- [ ] Default download directory configurable in Settings
- [ ] IPC events: download started, progress, completed, failed, cancelled
- [ ] Integration with browser editor — downloads triggered from webview "just work"
- [ ] Programmatic download API for other editors to use
- [ ] Documentation updated
- [ ] No regressions in existing functionality

## Architecture

### Process Flow

```
Main Process                          IPC                       Renderer
─────────────                    ──────────────          ────────────────────────
session.on('will-download')      download:start      →   DownloadManager page
  → downloadItem events          download:progress   →     updates list UI
    progress, done, failed        download:complete   →
                                  download:cancel     ←   User clicks cancel
```

### Key Design Decisions

- **Separate page-editor:** Download Manager is its own editor type (like Settings, About), not embedded in the browser toolbar
- **Main-process owned:** Downloads are managed in the main process via Electron's `session.on('will-download')` API
- **Session-aware:** Must listen on the correct session partition (ties into browser profiles from US-027)
- **Reusable API:** Provide a `startDownload(url, options?)` IPC endpoint that any renderer code can call

## Files to Create

- `src/renderer/editors/download/DownloadManager.tsx` — Download Manager page-editor component and model
- `src/main/download-service.ts` — Main-process download handling via session `will-download`
- `src/ipc/download-ipc.ts` — IPC channel names and type definitions for download events

## Files to Modify

- `src/renderer/editors/register-editors.ts` — Register download manager editor
- `src/renderer/store/page-actions.ts` — Add `showDownloadManager()` action
- `src/renderer/store/app-settings.ts` — Add default download directory setting
- `src/main/main-setup.ts` or `src/main/browser-service.ts` — Wire up download handlers on browser sessions
- `src/shared/types.ts` — Add `downloadManager` page type

## Implementation Progress

### Phase 1: Main-Process Download Handling
- [ ] Create `download-service.ts` with `will-download` listener
- [ ] Define IPC channels and types in `download-ipc.ts`
- [ ] Track active downloads with progress, status, filename, path
- [ ] Send download events to renderer via IPC

### Phase 2: Download Manager Page
- [ ] Create DownloadManager page-editor (component + model)
- [ ] Register as a page-editor in `register-editors.ts`
- [ ] Add `showDownloadManager()` to page-actions
- [ ] Download list UI: filename, URL, progress bar, status, actions (cancel, open)
- [ ] Auto-open or notify when a download starts

### Phase 3: Settings & Integration
- [ ] Default download directory in app settings
- [ ] Settings page section for download preferences
- [ ] Browser editor integration (downloads from webview)
- [ ] Programmatic download API for other editors

## Notes

- Extracted from US-027 to keep download functionality separate and reusable
- Electron's `downloadItem` API provides: `getFilename()`, `getTotalBytes()`, `getReceivedBytes()`, `cancel()`, `setSavePath()`, `on('updated')`, `on('done')`
- Must handle multiple concurrent downloads
- Download history could be persisted (future consideration)

## Related

- Depends on: [US-025 Basic Browser Editor](../US-025-basic-browser-editor/README.md)
- Integrates with: [US-027 Browser Profiles & Incognito](../US-027-browser-profiles-downloads/README.md) (session partitions)
- Related: [US-028 Browser Bookmarks](../US-028-browser-bookmarks/README.md)
