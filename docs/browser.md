[← Editors](./editors.md)

# Browser

A built-in web browser for viewing documentation, APIs, and web resources without leaving persephone.

**Opening:** Click the dropdown arrow (&#9662;) next to the **+** button → **Browser** (if pinned), or open the **Tools & Editors** sidebar panel to find Browser, Browser Incognito, Browser (Tor), and individual browser profiles.

---

## URL Bar

- Type a **URL** and press `Enter` to navigate
- Type a **search term** to search with the selected engine
- **Navigate button** at the end of the input — click to go
- **Paste and Go** — right-click the URL bar for a "Paste and Go" option that pastes clipboard text and navigates immediately
- Press `Ctrl+L` to quickly jump to the URL bar

### URL Suggestions

A dropdown appears when you focus or type in the URL bar:

- **On focus:** shows navigation history (URLs visited in the current tab)
- **On typing:** shows filtered search history with highlighted matches
- Navigate with arrow keys, select with `Enter`, dismiss with `Escape`
- **"Clear" button** removes visible filtered entries from search history

### Search Engine Selector

A clickable label appears in the URL bar on blank pages and search result pages. It is hidden when the input already contains a full URL with a protocol scheme (e.g., `https://`), keeping the toolbar uncluttered during direct navigation.

- **11 engines:** Google (default), Bing, DuckDuckGo, Yahoo, Ecosia, Brave, Startpage, Qwant, Baidu, Perplexity, Gibiru
- Switch engines on a search results page to **re-search the same query** on a different engine
- Selected engine is remembered per browser tab

---

## Navigation

- **Home** — each tab remembers its "home" URL (first URL navigated to); tooltip shows the URL
- **Back / Forward** — standard browser navigation
- **Reload / Stop** — reload the current page or stop a pending load
- **Loading indicator** — animated bar below the toolbar while a page is loading

### Reload and unsaved-changes guards

Some web pages register a `beforeunload` handler to warn when you try to leave with unsaved work (e.g. an online editor or a form with unsaved input). Persephone respects these guards when you reload:

- **Soft reload** (Reload button, `F5`, `Ctrl+R`) — if the page has an unsaved-changes guard, a confirmation dialog appears: **"You have unsaved changes. Leave the page and discard them?"**. Click **Leave** to reload; click **Cancel** to stay on the page. Pages without a guard reload instantly.
- **Hard reload** (`Ctrl+F5` / `Ctrl+Shift+R`) — bypasses the guard and reloads immediately, discarding any unsaved changes without prompting. Use this when you intentionally want to force a fresh load.

---

## Internal Tabs

Multiple browser tabs live within a single persephone tab, shown on a left-side panel.

- Clicking `target="_blank"` links opens a **new internal tab**
- `window.open()` from JavaScript opens a **real popup window** (for OAuth/auth flows)
- **Close Tab** button in the toolbar; **New Tab** (+) button at the bottom of the tabs panel — always adds a new tab at the end of the list
- Right-click a tab for context menu: **Close Tab**, **Close Other Tabs**, **Close Tabs Below**
- **Reorder tabs** — drag and drop internal tabs within the tabs panel to rearrange them
- Resizable tabs panel with splitter; **starts collapsed to icon-only mode**
- Active tab styled with dark background and blue border
- **Compact mode** — when the panel is narrow, hovering a tab shows a floating popup with title and close button
- Closing the last tab opens a fresh blank page
- **Tab activation history** — closing a tab returns focus to the previously active tab (not just the adjacent one)

### Tab Groups

Tabs are automatically organized into visual groups:

- **New group** — created when you click the **+** button, open a bookmark, or navigate to a typed URL
- **Inherited group** — when a link opens in a new tab (via `target="_blank"` or "Open Link in New Tab" from context menu), the new tab belongs to the same group as its parent
- **Visual indicator** — a vertical left border on each tab, with alternating brightness to distinguish adjacent groups
- **Drag behavior** — dragging a tab within its group preserves the group; dragging it into a different group assigns a new group

### Audio Controls

- **Volume icon** appears on tabs playing audio — click to mute/unmute individual tabs
- **Page-level mute** — a sound/mute button appears on the persephone page tab; it is always visible on hover, and stays visible (without hovering) whenever any internal tab is audible. Click to mute/unmute all internal tabs at once.
- Both tab-level and page-level must be unmuted for sound to play

---

## Browser Profiles

Each profile provides an **isolated browsing session** with its own cookies, localStorage, and cache — completely separated from other profiles and from the application itself.

### Managing Profiles

Go to **Settings → Browser Profiles**:

- **Default profile** — always present, cannot be removed
- **Add profiles** — type a name and pick a color from the palette
- **Set default** — the **Browser** quick-add item uses the default profile
- **Profile color** — click the color dot to change; shown on the page tab icon (tinted globe)
- **Clear data** — clears cookies, storage, and cache for a single profile
- **Delete** — confirmation dialog; also clears all data from disk

### Opening a Profiled Browser

- Click &#9662; → **Browser** to open with the default profile
- Click &#9662; → **Browser profile...** → select a named profile or **Incognito**

### Incognito Mode

- Ephemeral browsing — **no data is persisted**
- Incognito icon shown on the page tab and inside the URL bar
- All cookies, storage, and cache are automatically discarded when the tab closes
- Search history is not saved
- Bookmarks still work normally in incognito (only browsing data is ephemeral)

### Tor Mode

Browse through the [Tor network](https://www.torproject.org/) for anonymous, traffic-routed browsing. Like Incognito, Tor mode is ephemeral — no data is persisted after the tab closes.

#### Setup

1. Download the [Tor Expert Bundle](https://www.torproject.org/download/tor/) (contains `tor.exe`)
2. Go to **Settings → Browser Profiles** — find the **Tor** row
3. Set the **tor.exe path** (e.g., `C:\tor\tor.exe`)
4. Optionally adjust the **SOCKS port** (default: `9050`)
5. Optionally set a **bookmarks file** for the Tor profile

#### Using Tor Mode

- Open from the **Tools & Editors** sidebar panel → **Browser (Tor)**
- On launch, persephone starts `tor.exe` and shows a **status overlay** with a live log of the Tor bootstrap process
- Once connected, all traffic is routed through the Tor network via a SOCKS5 proxy
- A **Tor indicator** appears in the URL bar — click it to show or hide the status overlay; a colored dot shows the connection status

#### Nothing loads outside Tor

A Tor page never falls back to your normal internet connection. The proxy is applied to the page
before anything can load, so pages that try to load while Tor is still connecting — or after it
failed to connect — **fail with a proxy error rather than loading directly**.

What that means in practice:

- Opening **Browser (Tor)** with a URL: if Tor is not connected yet, that first page will not
  load. Wait for the indicator dot to turn green, then reload.
- If Tor fails to connect, browsing does not work at all until you click **Reconnect**. This is
  intentional — a page that loaded anyway would have been fetched over your regular connection,
  revealing your real IP address.
- If the Tor daemon stops unexpectedly, the indicator dot turns **red** and requests stop
  working. Click **Reconnect** to restart it.

#### Lifecycle

- `tor.exe` is started automatically when the first Tor browser page opens
- `tor.exe` is stopped automatically when the last Tor browser page closes
- After a **session restore** (app restart), Tor pages show a **"Reconnect"** button instead of auto-connecting — click it to restart `tor.exe` and resume browsing

#### Connection Info and Reconnecting

A **"?" button** appears on the toolbar only in Tor mode. Click it to open the **Tor connection info** dialog:

- Shows the **exit IP address** a remote server actually sees, plus its approximate **country / city** when a geolocation lookup succeeds
- Confirms whether traffic is really exiting through the Tor network
- **Reconnect** restarts the Tor daemon so a fresh circuit — and usually a new exit node — is selected; if the same exit is reused, the dialog says so and you can click Reconnect again
- Reconnecting is **app-wide**: it briefly disconnects every open Tor page, not just the one showing the dialog; the other pages' status indicators follow along and recover automatically
- The IP/location lookup and the reconnect itself both go through the Tor proxy, so nothing about the check reveals your real IP

#### Bookmark Images in Tor Mode

Bookmark thumbnails and preview images in a Tor page's Link Editor (blank-tab bookmarks view, the bookmarks drawer, tooltips, the Edit Link dialog) are fetched **through the Tor connection**, never directly:

- Images load normally once Tor is connected
- While Tor is connecting, disconnected, or in an error state, no image request is made at all — a placeholder icon is shown instead
- Adding a bookmark while browsing in Tor mode does **not** download or save a favicon to disk, unlike normal and Incognito browsing

---

## Bookmarks

Per-profile bookmark management using `.link.json` files. Each browser profile can be associated with a different bookmarks file — configure in **Settings → Browser Profiles**.

### Quick Bookmark (Star Button)

The **star button (☆)** in the URL bar lets you quickly bookmark or edit the current page:

- **Empty star** when URL is not bookmarked; **filled star** when already bookmarked
- Click to open the **Edit Link Dialog** with URL and title prefilled
- **Discovered images** from page meta tags and click tracking are shown in the dialog for choosing a thumbnail
- The dialog opens immediately, even while the page is still loading. If the page can't report its images within a second, the dialog opens without suggestions — the URL, title, and favicon are unaffected

### Bookmarks Panel

Click the **"Open Links" button** on the toolbar to open a sliding bookmarks panel:

- Right-anchored overlay drawer with backdrop
- Full **Link Editor** inside — Collections, Tags, Hostnames sidebar panels plus search and all view modes (list and tile variants)
- Click a link to navigate (in current tab if blank, otherwise new internal tab)
- **Right-click a bookmark** for a context menu: **Open in New Tab**, Edit, Open in Default Browser, browser profiles, Open in Incognito, Copy URL, Pin/Unpin, Delete
- **Hover a link** to see a rich tooltip with title, URL, and thumbnail image
- Drawer closes automatically after clicking a link
- Opens at a usable width the first time and can be resized; Collections/Tags/Hostnames panels are on the left side of the drawer
- Press `Escape` to close

### Context Menu Bookmarking

- Right-click a **link** on a web page → **"Add to Bookmarks"** — captures URL, title, and image
- Right-click an **image** → **"Use Image for Bookmark"** — tracks the image for the next bookmark

### Blank Page

When a bookmarks file is configured for the current profile, new blank tabs display your bookmarks directly instead of an empty page:

- The **Collections, Tags, and Hostnames** panels appear in the left sidebar for filtering
- Click a link to **navigate the current tab**
- `Ctrl+Click` opens the link in a **new internal tab**, keeping bookmarks visible on the original tab
- **Right-click a bookmark** for a context menu: **Open in New Tab**, Edit, Open in Default Browser, browser profiles, Open in Incognito, Copy URL, Pin/Unpin, Delete
- **Hover a link** to see a rich tooltip with title, URL, and thumbnail image
- The toolbar includes **Add Link**, a **view mode switcher** (list or tile layouts), and a **search box** for filtering bookmarks
- Encrypted bookmark files are not unlocked automatically on blank page load — use the star button or bookmarks drawer to trigger decryption, after which the blank page will show the links

### Additional Details

- **Image discovery** — automatically collects images from page meta tags (`og:image`, `twitter:image`), clicked link elements, and context menu items for bookmark thumbnails
- **Encrypted bookmarks** — supports encrypted `.link.json` files; a password dialog appears on first access via the star button or bookmarks drawer
- **Auto-save** — all edits are automatically saved to the `.link.json` file
- If no bookmarks file is associated with the profile, clicking the star or bookmarks button prompts you to select or create a file

---

## Downloads

A download button in the toolbar tracks download progress and provides a download history.

### How It Works

1. Click a download link on a web page
2. A **save dialog** appears — choose where to save the file
3. The download button shows a **circular progress ring** while downloads are active (icon turns active color)
4. Click the button to open the **Downloads popup**

### Downloads Popup

- Scrollable list of all downloads (most recent at top)
- **Active downloads** show a progress bar with received/total bytes and a **Cancel** button
- **Completed downloads** show **"Open"** (launches file with default app) and **"Show in Folder"** (opens Explorer with file selected) buttons
- **Failed or cancelled** downloads show status text
- **"Clear" button** dismisses completed and failed entries

### Persistence

- Download list is **global** — shared across all browser pages and windows
- Last **5 completed downloads** are remembered across app restarts

---

## Page Menu (Toolbar)

The **"..." button** (vertical ellipsis) in the browser toolbar provides page-level actions that are always accessible, even on sites that disable or override the right-click context menu:

- **View Source** — view the raw HTML as fetched from the server (opens in a text tab)
- **View Actual DOM** — view the live rendered DOM after JavaScript execution, including content from all iframes (opens in a text tab)
- **Show Resources** — extract all resource URLs from the current page (images, scripts, stylesheets, media, fonts, iframes, favicons, and links) and open them as a categorized link collection. Also includes all HTTP network requests captured since the page started loading, grouped under **Network/GET**, **Network/POST**, etc. GET requests open directly; non-GET requests open in the Rest Client with the full cURL equivalent (method, headers, body) pre-filled.

---

## Context Menu

Right-click in the web page for contextual actions:

| Context | Actions |
|---------|---------|
| On a link | "Open Link in New Tab", "Copy Link Address", "Add to Bookmarks" |
| On an image | "Open Image in New Tab" (opens in Image Viewer), "Copy Image Address", "Use Image for Bookmark" |
| On selected text | "Copy" |
| On an editable field | "Cut", "Copy", "Paste" |
| On an SVG element | "Open SVG in Editor" (opens in text editor with XML syntax) |
| Always available | "Back", "Forward", "Reload", "View Source", "View Actual DOM", "Show Resources", "Inspect Element" |

- **View Source** — view the raw HTML as fetched from the server (opens in a text tab)
- **View Actual DOM** — view the live rendered DOM after JavaScript execution, including content from all iframes (opens in a text tab)
- **Show Resources** — extract all resource URLs from the current page (images, scripts, stylesheets, media, fonts, iframes, favicons, and links) and open them as a categorized link collection. Also includes all HTTP network requests captured since the page started loading (grouped under **Network/GET**, **Network/POST**, etc.). Non-GET requests open in the Rest Client with the full cURL equivalent pre-filled. Equivalent to the web-scraper toolbar button on HTML text pages.
- **Inspect Element** — opens DevTools focused on the clicked element

---

## Find in Page

Press `Ctrl+F` to open the search bar (works whether focus is on the toolbar or inside the web page):

- **Match counter** — shows "3 of 15" or "No results"
- **Next/Previous** — `Enter` or `F3` for next match, `Shift+Enter` or `Shift+F3` for previous
- **Close** — `Escape` or close button; clears all highlights
- The search bar closes automatically when navigating to a different page or switching internal tabs

---

## Default Browser Registration

persephone can register itself as the **Windows default browser** so that clicking links in other applications (email, chat, documents) opens them in persephone's browser.

### How to Register

1. Go to **Settings → Default Browser**
2. Click **Register** — this writes registry keys to HKCU (no admin privileges required)
3. Click **"Open Windows Default Apps"** — this navigates directly to the persephone page in Windows Settings
4. In Windows Settings, set persephone as the default for HTTP/HTTPS links

### How It Works

- URLs received from the OS always open in the internal browser tab using the **default profile**, regardless of the "Link open behavior" setting
- Works on cold start (via command-line arguments) and when persephone is already running (via the launcher's named pipe)
- To unregister, click **Unregister** in Settings — all registry keys are removed

---

## Link Open Behavior

External links clicked in the **text editor** (Monaco) or **Markdown preview** can open in the default OS browser or in persephone's internal browser.

Configure in **Settings → Links**:

- **Default browser** (default) — opens links in your OS browser
- **Internal browser** — opens links in the active browser page if one is focused, otherwise searches right then left from the active page. Empty browser tabs (`about:blank`) are reused. If no browser tab exists, a new one is created with the default profile

The **Markdown preview** also provides a link context menu with explicit options: "Open in Default Browser", "Open in Internal Browser", browser profiles, and "Open in Incognito".

---

## Popup Blocking

Sites that try to open excessive popups or tabs are automatically rate-limited:

- A **notification bar** appears: "Popups blocked from this site"
- Click **"Allow"** to temporarily permit popups for the current page
- Single user-initiated clicks (OAuth, payment confirmations) are not affected

---

## Session Restore

The browser saves and restores the following across app restarts:

- All internal tabs and their URLs
- Tab groups
- Navigation history per tab
- Profile selection
- Search engine selection and last search query
- Search history (per profile, not saved for incognito or Tor)
- Tabs panel width
- Bookmarks panel width
- Home URL per tab

---

## Scripting & Automation

Browser pages can be controlled from scripts using the `page.asBrowser()` facade. This gives you programmatic control over navigation and lets you query and interact with the loaded page via CSS selectors.

```javascript
const browser = await page.asBrowser();

// Navigate and wait for the page to finish loading
browser.navigate("https://example.com");
await browser.waitForNavigation();
console.log(browser.title);

// Wait for dynamic content to appear before querying
await browser.waitForSelector("#results");
const heading = await browser.getText("h1");
const href = await browser.getAttribute("a.logo", "href");

// Interact with forms (throw if element not found)
await browser.type("#search", "persephone");
await browser.click("#submit-btn");
await browser.select("#country", "US");
await browser.check("#agree-terms");
await browser.clear("#comment");

// Press a key (e.g. submit a form with Enter)
await browser.pressKey("Enter");

// Run arbitrary JavaScript inside the page
const count = await browser.evaluate("document.querySelectorAll('a').length");

// Get an accessibility snapshot (Playwright MCP format)
const snapshot = await browser.snapshot();
// Returns a YAML-like tree, e.g.:
// - heading "Page Title" [level=1] [ref=e40]
// - textbox "Search" [ref=e52]
// - button "Submit" [ref=e65]
```

### Multi-tab automation

All automation methods accept an optional `{ tabId }` option so you can automate tabs in the background without switching to them:

```javascript
// Open a second tab, wait for it to load, then query it
const tabId = browser.addTab("https://other.com");
await browser.waitForNavigation({ tabId });
const otherHeading = await browser.getText("h1", { tabId });

// List all tabs
for (const tab of browser.tabs) {
    console.log(tab.id, tab.url, tab.title);
}

// Switch to a tab or close it
browser.switchTab(tabId);
browser.closeTab(tabId);
```

See the [`page.asBrowser()` API reference](./api/page.md#asbrowserpromiseibrowsereditor) for the full method list.

### MCP browser automation

AI agents connected via the [MCP server](./mcp-setup.md) can control the browser directly using dedicated browser tools — no script needed. Tools include `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_wait_for`, `browser_evaluate`, and more. See [MCP Server Setup → Browser Automation Tools](./mcp-setup.md#browser-automation-tools) for the full list.

> **Privacy note:** MCP browser automation tools are blocked on incognito and Tor browser pages. If the active browser page is in incognito or Tor mode, any `browser_*` tool call returns an error. Use `open_url` (without `incognito` or `tor`) to open a normal browser session before using automation tools. Similarly, `open_url` will not reuse an existing incognito or Tor page for a normal URL — it always opens normal URLs in a separate normal session.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+L` | Focus URL bar |
| `Ctrl+F` | Find in page (open search bar) |
| `F3` | Next match (when find bar is open) |
| `Shift+F3` | Previous match (when find bar is open) |
| `F5` | Soft reload (shows confirmation if page has unsaved-changes guard) |
| `Ctrl+R` | Soft reload (alias for F5) |
| `Ctrl+F5` / `Ctrl+Shift+R` | Hard reload — bypass cache, skip unsaved-changes guard |
| `F12` | Open DevTools |
| `Alt+Left` | Go back |
| `Alt+Right` | Go forward |
| `Alt+Home` | Go to home page |
| `Escape` | Close find bar / stop loading / close bookmarks panel |

These shortcuts work regardless of where focus is within the browser page.

---

## Additional Details

- **Page title** — shown in the persephone tab (reflects the active internal tab)
- **Favicon** — website icon displayed in the internal tabs panel
- **DevTools** — click the gear icon or press `F12` to open the webview's developer tools
- **DRM-protected video** — the browser supports Widevine DRM, so streaming services like Netflix, Disney+, and other DRM-protected platforms work out of the box
- **Isolated storage** — each profile has its own cookies, storage, and cache, separated from the application
- **Automatic cache cleanup** — HTTP cache, compiled code cache, and service worker caches are cleared when a browser page is closed to save disk space; cookies and site data are preserved
- **Security** — navigation to local file protocols (`file://`, `app-asset://`) is blocked
