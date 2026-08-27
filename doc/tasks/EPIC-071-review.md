# EPIC-071 review

Report-only review of the uncommitted EPIC-071 tree. Findings are written as confirmed.

## Finding 1

- Severity: defect
- File:line: `src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts:47-60`; `src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.ts:51-64`
- What is wrong: These views bind directly to the current editor/page/host state sources, but their `onUpdate()` paths replace the editor without replacing those subscriptions.
- Failure scenario: When a secondary link panel is retargeted to another `LinkEditor`, selection changes in the new editor do not trigger the category tree and page/host changes do not refresh the header; the old editor sources remain subscribed and continue invoking callbacks against the new view state.
- Recommended fix: Keep explicit unsubscribe handles and tear down/rebind them whenever the editor identity changes, including when a provider becomes available after the initial `null` check.

## Finding 2

- Severity: risk
- File:line: `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.ts:77-82,94-127`
- What is wrong: `onUpdate()` calls `bindModelState()` and `bindPageState()` again when `mnemeModel` changes, but `bind()` stores each unsubscribe only in the view's final disposer list; the old model/page subscriptions are never released at replacement time.
- Failure scenario: Reusing the secondary view for successive Mneme models accumulates subscriptions to every old model and page. The identity guards prevent most stale DOM writes, but every old state change still retains and invokes a callback until the secondary view is destroyed.
- Recommended fix: Store the two unsubscribe handles and replace them before binding the new model/page sources.

## Finding 3

- Severity: defect
- File:line: `src/renderer/editors/settings/sections/SettingsSections.ts:269-300`
- What is wrong: `LibraryPathSectionView.onMount()` always creates a `ButtonView` for `Unlink`/`Reset` and only disables it when the path is empty; the deleted React implementation rendered that button conditionally (`{libraryPath && ...}`).
- Failure scenario: With an empty Script Library or Drawing Library path, Settings shows a visible disabled `Unlink`/`Reset` button where the baseline showed no control. If exactly one of the two paths was empty in the baseline session, this branch difference accounts for the measured 24-to-25 button delta.
- Recommended fix: Reconcile the control branch with the React behavior by removing the button when the path is empty, using explicit child replacement/ownership, or deliberately update the parity baseline if the always-visible disabled control is intended.

## Finding 4

- Severity: nit
- File:line: `src/renderer/editors/mcp-inspector/McpInspectorView.ts:118,133-137`
- What is wrong: The native MCP view uses several `as unknown as VanillaView<unknown>` assertions to erase the distinct view types in `activeBody` and `connectedPanel()`.
- Failure scenario: A future panel can be returned through this untyped path with an incompatible `update()` payload; TypeScript will accept it, and the first state transition that updates that panel can fail or silently mis-render.
- Recommended fix: Type the branch as a shared owned-view contract, or use a discriminated union with panel-specific update calls instead of erasing the types.

## Finding 5

- Severity: nit
- File:line: `src/renderer/editors/link-editor/index.ts:260`; `src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts:79`
- What is wrong: The link conversion introduces double assertions at two React-to-native boundaries: the view-mode mouse handler and the DOM tooltip content.
- Failure scenario: The compiler can no longer check that Button and Tree tooltip contracts match their actual event/content arms; a later signature change can leave a runtime-incompatible handler or slot value while lint and typecheck remain green.
- Recommended fix: Make the native handler/tooltip contracts accept the actual `MouseEvent`/`Node` types, or adapt them with a typed wrapper at the boundary rather than `as unknown as`.

## Finding 6

- Severity: nit
- File:line: `src/renderer/editors/mneme-config/RootsPanel.ts:83-85,184-185,277,308-309`; `src/renderer/editors/mneme-root/MnemeRootEditorView.ts:109-111,182,282-286`
- What is wrong: The new Mneme native views repeatedly clear non-nullable fields with `undefined as never` instead of representing their post-disposal state in the field types.
- Failure scenario: A later maintenance change can dereference a cleared field and TypeScript will not flag it because the assertion falsely preserves the non-nullable type.
- Recommended fix: Make disposable references nullable/optional and guard them, or use a disposal-safe base-field pattern that does not require `as never`.

## Finding 7

- Severity: nit
- File:line: `src/renderer/editors/tools-hub/ToolsHubView.ts:26-27`; `src/renderer/editors/tools-hub/SearchBoardsTab.ts:52-54,229`; `src/renderer/editors/about/AboutView.ts:52-56,194`; native MCP/Mneme fields in the converted files
- What is wrong: The converted faces add widespread definite-assignment `!` assertions for fields initialized only during `onMount()`.
- Failure scenario: A future lifecycle path can read a field before its mount assignment or after disposal, while the assertion hides that possibility from TypeScript and the current lint rules.
- Recommended fix: Use optional fields with guards, or initialize stable DOM/view fields in the constructor when the lifecycle contract requires them.

## Finding 8

- Severity: nit
- File:line: `src/renderer/editors/tools-hub/SearchBoardsTab.ts:177`; `src/renderer/editors/mcp-inspector/ToolsPanel.ts:131`; `src/renderer/editors/settings/sections/SettingsSections.ts:205`; `src/renderer/editors/settings/sections/McpSection.ts:274,279`
- What is wrong: The conversion adds expression/non-null assertions to satisfy local narrowing instead of preserving the actual types through the branch structure.
- Failure scenario: If the guard and the asserted value diverge during a later branch edit, the code can pass an absent status/result or assume a map lookup succeeded and fail only at runtime.
- Recommended fix: Bind the narrowed value to a local inside the guarded branch, or make the relevant fields/maps accurately nullable and handle the empty case.

## Finding 9

- Severity: risk
- File:line: `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts:61-78`; `src/renderer/editors/link-editor/panels/LinkTagsPanel.ts:27-40`; `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts:51-73`
- What is wrong: The tags and hostnames navigation views bind to the initial editor's `state`, then their `onUpdate()` methods refresh child props and snapshots without replacing those subscriptions. The tags panel has the same stale `vm.state` binding.
- Failure scenario: If a secondary view is reused for a different `LinkEditor`, changes in the new editor do not drive the bound list/navigation state, while changes in the old editor continue to invoke callbacks retained by the view. The one-time snapshot makes the panel appear correct until the first subsequent state change.
- Recommended fix: Store replaceable unsubscribe handles for each editor-owned state source and tear them down before binding the replacement editor; propagate the replacement through the tags panel as well.

## Candidate checks already clean

- The current tree retains and updates the Incognito bookmarks row, releases claimed Markdown/Monaco resource children, and uses delegated listeners for the bookmark/Tor/VLC path branches.
- The documented 35 executable `mcp-inspector` memo/callback sites and 32 executable `link-editor` sites were checked against their native consumers; no dead ported memo/callback was confirmed.
- The requested `uikit/` barrel sweep has no dangling re-export for the deleted faces; the four deleted `ui/sidebar/*.tsx` faces have no remaining importer. `src/renderer/editors/base/EditorToolbar.ts` and `ContentHostFooter.ts` remain present for their deliberate React callers.
- The settings `BUTTON` delta is attributable at source level to the library-path branch: native `LibraryPathSectionView` always emits the clear button, while React emitted it only for a non-empty path. The exact +1 depends on one of the two measured library paths being empty.

## Second fix round

- Audit started: Findings 1, 2, and 9 are explicitly excluded. The implementation scope is Findings 3–8, including sweeps of converted views for the same assertion and conditional-control patterns.
- Finding 3: `BoardVarsSectionView` now creates/releases `Unlink` with the file-path branch, and `LibraryPathSectionView` does the same for Script `Unlink` and Drawing `Reset`; empty paths have no clear control. The settings sweep found 1 additional conditional control beyond the original library-path finding (3 controls fixed in total, including both subclasses).
- Finding 4: replaced the six MCP `as unknown as VanillaView<unknown>` boundary casts with a typed connected-panel union and panel-specific narrowed updates. No extra converted-view boundary casts were found in the MCP view.
- Finding 5: replaced the link-editor view-mode handler cast with a typed wrapper that passes the native `MouseEvent`. The tooltip cast remains in `LinkCategoryPanel.ts` because that file is explicitly frozen by the user as a Finding 1/2/9 file; this one occurrence could not be changed without violating that scope constraint.
- Finding 6: removed the targeted `undefined as never` cleanup assignments from `RootsPanel.ts` and `MnemeRootEditorView.ts`, made the cleared fields optional, and guarded the relevant reads. The sweep found 7 additional cleanup assignments in neighboring Mneme config view/panel files and removed them.
- Finding 7: replaced all 135 converted-editor definite-assignment field assertions with optional fields and lifecycle guards where needed. The sweep found 8 additional fields in `link-editor/EditLinkDialogView.ts` beyond the cited sites.
- Finding 8: removed the 5 cited expression/non-null assertions by binding narrowed values or branching before creating the views; the converted-editor sweep found no additional instances.
- Verification: `npm run typecheck`, `npm run lint`, and `npm run build-prod` all pass. Build output contains only the repository's existing bundler warnings (empty `import.meta`, ineffective dynamic imports, and large chunks); no new failure was reported.
