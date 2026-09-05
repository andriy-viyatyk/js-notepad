# Surface QA: Monaco/text editor

Manual scenarios for `pages[i].editor` after narrowing `editor.id` to `"monaco"`. Run through
`call` only; do not add or run automated tests or a test harness for this surface. Leave pinned tabs
untouched and close only pages created by the scenario.

## Test T.1: Two same-kind pages and scoped inventories

**Preparation:** Open two same-kind Monaco pages, preferably one script-language page and one
plaintext page, and obtain both ids from `pages`.

**Call:** Read `pages[firstId].editor.elements` and `pages[secondId].editor.elements`.

**Verify:** Every selector contains its own `[data-page-id="id"]`; the active page's rendered
controls report literal visibility and the inactive page's retained slot reports invisible. The
four existing text controls and all eight script-panel declarations are present in both static
inventories even when their conditional views are absent. `page-editor-switch` and `page-nav-panel`
are absent from both editor inventories and remain under `editorSwitches` and `panels`.

## Test T.2: Script-language and selection-dependent controls

**Preparation:** Use a JavaScript or TypeScript page, first with no selection, then select text in
Monaco. Also restart or restore the page before making a new selection.

**Call:** Read `editor.elements` after each state and call `editor.highlight("text-run-script")` and
`editor.highlight("text-run-all-script")` where applicable.

**Verify:** `text-run-script` is visible for a script language; `text-run-all-script` is absent and
reports `visible: false` without a selection, becomes visible with a selection, and is absent again
after restore until selection state is rebuilt. The highlight result is not fabricated for an absent
control. On a non-script page, `text-run-script` and `text-run-all-script` stay `visible: false`.

## Test T.3: HTML resources and grouped compare

**Preparation:** Open an HTML text page, a non-HTML text page, and a grouped pair with a text page
on the left. Ensure the compare capability is available, then remove the left partner.

**Call:** Read each page's `editor.elements` and highlight `text-show-resources` and
`text-compare-left` in the states where they are absent and present.

**Verify:** `text-show-resources` is visible only for HTML text; `text-compare-left` is visible only
when its owner has the eligible left grouped page. Missing HTML or compare controls return the normal
not-found result and never `found: true`.

## Test T.4: Related script panel inventory and actions

**Preparation:** On a text page with a script host, inspect the editor state with the related panel
closed, then call `editor.toggleScriptPanel()`.

**Call:** Read `editor.scriptPanelOpen`, `scriptHasSelection`, `scriptSelectedScript`, `scriptDirty`,
`scriptAvailableScripts`, and `elements`. Select related-script text, then read the inventory again.

**Verify:** Before opening, the toggle is present and all panel-only elements are absent. While open,
`script-panel-splitter`, `script-run`, `script-select`, `script-save`, `script-open-tab`, and
`script-close` are visible; `script-run-all` appears only after related-script selection. The state
getters reflect the live panel state, and a disabled `script-save` is still visible when `scriptDirty`
is false. Call `editor.selectScript()` for ad-hoc content and a returned path, `saveScript()`,
`openScriptInTab()`, and `closeScriptPanel()` only on pages created for this test.

## Test T.5: Encryption privacy and menu/dialog paths

**Preparation:** Use a file-backed text page and open its page-tab popup menu.

**Call:** Read `editor.encrypted`, `decrypted`, and `withEncryption`, then inspect `menus[0].items`.
Use the menu's encryption action or `editor.showEncryptionDialog()` and inspect `dialogs[0]`.

**Verify:** Encryption state is read-only and contains no password. The menu exposes enabled state
for Decrypt, Encrypt or Change Password, and Make Unencrypted; menu items are not duplicated in
`editor.elements`. The password dialog exposes buttons and cancel only: no `value`, `password`, or
password-bearing facade member resolves. `encryptWithCurrentPassword()` and `makeUnencrypted()` are
the only non-dialog encryption actions and are reported with caution.

## Test T.6: File actions and native find/replace

**Preparation:** Use a scratch file-backed text page.

**Call:** Read the editor member hints, then call `openFind()`, `openReplace()`, `saveFile()`,
`promptRename()`, and `openSearchInNavPanel()` as appropriate.

**Verify:** Find and replace open Monaco's native widgets; no persistent find selector is declared.
The editor member hints mark replacement, save, rename, and UI-opening actions with caution and name
their dialogs. Save/rename operations reach the normal native/input flows and do not silently claim
success when cancelled.

## Test T.7: Script output and suppressed errors

**Preparation:** Use a script-language page and a related script. Run both page and related scripts,
including a script that produces output and one that throws while output is suppressed.

**Call:** Use `runScript()`, `runScript(true)`, `runRelatedScript()`, and `runRelatedScript(true)`.

**Verify:** Output follows the normal grouped-page/output contract. A suppressed error opens the
read-only `Script Error` dialog and is resolved through `dialogs[i]`; the action does not fabricate a
successful output result. All execution members carry caution.

## Test T.8: Inactive-page highlight activation

**Preparation:** Keep a script-language text page inactive beside another page.

**Call:** Call `pages[inactiveId].editor.highlight("text-run-script", "show this control")` and
repeat for a rendered related-script control after opening its panel.

**Verify:** The requested page activates, the call waits for its slot layout, and the result is
`found: true` only for a rendered control on that page. The selector in the result is the same
page-scoped selector returned by `elements`; the other page's matching control is not highlighted.

## Test T.9: Detached host never fabricates state or success

**Preparation:** Catch a Monaco facade while its host is detached during an editor switch or before
host restoration, if the lifecycle makes this interval observable.

**Call:** Read all encryption and `script*` state getters, then call each host-backed action.

**Verify:** Every host-backed state getter returns `undefined`, never `false` or an empty success
value. Every host-backed action rejects or throws with `Text editor action unavailable: no text host
attached`; no call resolves silently. Conditional `elements.visible: false` remains a separate DOM
observation and is not changed by this contract.

## Test T.10: Missing conditional controls are not success

**Preparation:** On an ordinary plaintext page with no compare partner, no selection, and the related
script panel closed, read the complete editor inventory.

**Call:** Attempt highlights for `text-compare-left`, `text-run-script`, `text-run-all-script`,
`text-show-resources`, `script-panel-splitter`, `script-run`, `script-run-all`, `script-select`,
`script-save`, `script-open-tab`, and `script-close`.

**Verify:** Each absent control remains `visible: false`; each highlight returns the normal not-found
result. No missing conditional is reported as found, visible, enabled, or successfully activated.
