# EPIC-058 close-out review

Scope: `c9453d3a..HEAD` (`src/`), reviewed against EPIC-058, US-1025 through US-1038, and the architecture and standards documents listed in the task. The six defect classes already recorded in EPIC-058 were treated as regression checks, not new findings.

## Findings

### P1 — Git Diff side-selection indicator does not repaint

`src/renderer/components/git-tree/GitTreeView.ts:270` reads `this.props.sideSelect?.selectionKey` inside `onUpdate`, but `VanillaView.update()` has already replaced `this.props` at `src/renderer/uikit/shared/vanilla-view.ts:76`. Consequently `previousSideKey` is the new key, so the condition at `src/renderer/components/git-tree/GitTreeView.ts:280` is always false. `sideSelectRef.current` is updated, but the grid is not refreshed; after choosing a different left/right revision in Git Diff, the side-select cells keep showing the old active glyph until an unrelated grid repaint. This violates the renderer's explicit refresh contract at `src/renderer/components/git-tree/side-select-cell.ts:46-48`.

### P2 — FileSearch disposal leaves its worker running

`src/renderer/components/file-search/FileSearchModel.ts:377-379` marks the model disposed and clears `currentSearchId` before calling `cancelSearch()`. `cancelSearch()` immediately returns at `src/renderer/components/file-search/FileSearchModel.ts:249`, so no `SearchChannel.cancel` IPC message is sent. The main-process cancellation handler at `src/main/search-service.ts:164-166` is therefore never reached. Disposing a search view during an active search leaves that view's worker continuing its CPU/IO search until completion or replacement by another search, while the model has already removed its IPC listeners at `src/renderer/components/file-search/FileSearchModel.ts:380-383`.

## Clean categories

- No additional read-after-store-write race recurrence was found beyond the three instances already documented in EPIC-058.
- No additional UIKit primitive `data-type` override was found.
- No additional Emotion-to-CSS property-loss, containing-block, vendor-prefix, or pointer-event regression was found.
- No new hardcoded-color, `require("fs")`/`require("path")`, hand-rolled error-stringification, or React-facing prop-signature violation was found.
- No additional disposal/listener leak or `fillSlot` misuse was found beyond the FileSearch worker issue above.
