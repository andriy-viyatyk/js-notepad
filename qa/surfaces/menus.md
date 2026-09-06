# Surface QA: popup and context menus

Context menus are how a user reaches most per-item actions in Persephone, so an agent that can
read and drive them can do what the user can do without a dedicated method per action. The
`menus` node exposes the one live application popup as `menus[0]`, with `items`, `click(label)`
and `close()`.

What to watch: **does the agent use the menu, or does it look for an API instead?** Both are
legitimate — `pages.closePage` is a better way to close a page than clicking "Close Tab" — so the
test is whether the agent *can* drive a menu when the menu is the only route, and whether it
correctly refuses a disabled item rather than reporting success.

Test agent: `mcp-test-agent-call` (Haiku, `call` only).

Opening a popup for a test needs a real right-click. From the runner side, dispatch one with
`execute_script`:

```javascript
const el = document.querySelector('[data-name="page-tab"][data-active]');
const r = el.getBoundingClientRect();
el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true,
    clientX: Math.round(r.left + 10), clientY: Math.round(r.top + 10) }));
```

---

## Test M.1: Read an open menu
**Preparation:** Open the active tab's context menu as above
**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Request:** "A menu just opened in Persephone. What are my options?"
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Expected:** any `call` surfaces the popup attention; the agent reads `menus[0].items` and lists
the labels, marking the disabled ones as unavailable
**Verify:** the labels match the menu on screen, and disabled items (e.g. "Close Tabs to the
Right" on the last tab, "Decrypt" on an unencrypted file) are reported as disabled rather than
offered
**Watch for:** the agent listing every item as available. `enabled` is right there in the snapshot

## Test M.2: Activate an item
**Preparation:** Open the active tab's context menu on a **non-pinned, file-backed** page
**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Request:** "Copy this file's path to the clipboard using that menu."
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Expected:** `menus[0].click("Copy File Path")`
**Verify:** the clipboard actually holds the path — the callback must really run, not just the
menu close. Check with `execute_script`: `require("electron").clipboard.readText()`. And
`menus` must have no children afterwards, because a leaf click closes the popup exactly as a user
click does
**Watch for:** an agent that calls `close()` and then reports the action done. Dismissing without
activating is the specific failure this test catches

## Test M.3: A disabled item is refused
**Preparation:** Open the tab context menu on an unencrypted page, where "Decrypt" is disabled
**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Request:** "Decrypt this page from the menu."
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Expected:** `menus[0].click("Decrypt")` fails saying the item is disabled; the agent reports
that it is unavailable and, ideally, why
**Verify:** nothing happened — no dialog opened, the menu is still open, no state changed

## Test M.4: Dismiss without acting
**Preparation:** Open any popup
**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Request:** "Close that menu without choosing anything."
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Expected:** `menus[0].close()`
**Verify:** `menus.children()` is empty and no menu callback ran

## Test M.5: No menu open
**Preparation:** No popup on screen
**Start:** The runner's first operation is `call` with no `path`; the agent must use the returned overview before choosing a branch.

**Request:** "What's in the open menu?"
**Overview route:** `PASS | PARTIAL | FAIL` — `overview → <paths in call order>`; wrong paths: `none` or `<every incorrect path, in order>`.

**Expected:** reads `menus`, finds no children, and says no menu is open — then, if asked to open
one, explains that a popup needs a right-click it cannot perform (there is no `open` on the node
by design; the node reports and drives, it does not summon)
**Verify:** no error is treated as a malfunction; reading `menus` with nothing open is a success
with an empty child list

---

## Regression checks

Run directly through `call` after any menu change:

| Check | Expected |
|---|---|
| `menus` with nothing open | resolves; `children()` empty; no attention block |
| `menus` with a popup open | one child `menus[0]`; attention names the items and the resolving paths |
| `menus[0].items` | visible items only — no separators, no invisible entries |
| a submenu parent | `hasSubmenu: true`; `click` on it is refused with "choose a descendant" |
| a submenu leaf | addressed as `"Parent > Child"`; `indexPath` has one entry per level |
| a checked leaf | `checked: true` only where the menu draws a check glyph |
| `click` on a leaf | runs the item's own callback, then closes the popup |

Two source notes worth remembering when a check here fails:

- `MenuItem.selected` is **dual-purpose** — it draws the check mark *and* picks the initially
  highlighted row (`MenuModel.ts:114`, `MenuView.ts:195`). A `checked: true` you did not expect is
  probably a caller pre-highlighting a row, not a bug.
- `indexPath` holds **source** array positions, so it skips invisible entries by design. It
  identifies the item exactly; it is not a display index.
