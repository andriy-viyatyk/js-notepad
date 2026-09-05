[← API Reference](./index.md)

# app.settings

Application configuration. Read and write settings with change notifications.

```javascript
const theme = app.settings.theme;
app.settings.set("theme", "monokai");
```

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `theme` | `string` | Current theme name. Read-only (use `set("theme", ...)` to change). |
| `onChanged` | `IEvent<{ key, value }>` | Fires when any setting changes. |

## Methods

### get(key) → `T`

Get a setting value by key. Returns `undefined` for unknown keys.

```javascript
const searchExtensions = app.settings.get("search-extensions");
const searchExclusions = app.settings.get("search-exclude");
const mcpEnabled = app.settings.get("mcp.enabled");
```

### set(key, value)

Set a setting value. Changes are persisted automatically (debounced).

```javascript
app.settings.set("theme", "monokai");
app.settings.set("search-exclude", ["node_modules", ".git", "dist"]);
app.settings.set("mcp.enabled", true);
```

`app.settings.set()` is the regular script API and can change the MCP settings. When the same
operation is reached through `app.call("settings.set", ...)`, attempts to disable the MCP server
or change its port are refused because they would disconnect the current caller. Make those
changes from the Settings page or from the direct `app.settings.set()` script API when that is
what you intend.

## Finding a setting in the Settings page

The live object model exposes a catalog of the Settings page through `app.call()`. Read the
sections to discover the rows, then highlight a supported key; highlighting opens or activates
the Settings page and points at that section without changing the setting.

```javascript
const sections = await app.call("settings.sections");
await app.call("settings.highlight", { args: ["mcp.enabled"] });
```

The catalog has 13 sections and 25 Settings-page rows:

| Section | Rows |
|---------|------|
| Theme | `theme` |
| Window Behavior | `window.close-to-tray` |
| Browser Profiles | `browser-profiles`, `browser-default-profile`, `browser-default-bookmarks-file`, `browser-incognito-bookmarks-file`, `tor.exe-path`, `tor.socks-port`, `tor.bookmarks-file` |
| Links | `link-open-behavior` |
| Default Browser | *(no setting row)* |
| File Search | `search-extensions`, `search-exclude` |
| MCP Server / Mneme | `mcp.enabled`, `mcp.port`, `mcp.browser-tools.enabled`, `main.scripting.enabled`, `mneme.enabled`, `mneme.port` |
| Git Integration | `git.enabled` |
| Board Environment Variables | `board-vars.file` |
| Script Library | `script-library.path` |
| Drawing Library | `drawing.library-path` |
| Video Player | `vlc-path`, `video-stream.port` |
| Terminal | `terminal.command` |

Five real settings have no Settings-page row because their controls live elsewhere:
`tab-recent-languages`, `search-max-file-size`, `pinned-editors`, `visualizer-effect`, and
`audio-shuffle`. They remain available through `app.settings.get()` and `app.settings.set()`.

## Common Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `theme` | `string` | `"default-dark"` | Color theme name |
| `mcp.enabled` | `boolean` | `false` | Enable the MCP HTTP server for AI agent integration. When `true`, external tools (e.g., Claude Desktop, Claude Code, ChatGPT) can connect to persephone and run scripts, read content, and list open tabs. The server listens on `http://127.0.0.1:{mcp.port}/mcp`. See [What's New](../whats-new.md) for details. |
| `mcp.port` | `number` | `7865` | Port for the MCP HTTP server. The server URL will be `http://127.0.0.1:{port}/mcp`. Changing this setting requires toggling `mcp.enabled` off and on to take effect. |
| `mcp.browser-tools.enabled` | `boolean` | `false` | Allow connected AI agents to use browser automation and interact with Persephone's own window. This is an opt-in setting under Settings → MCP Server. |
| `main.scripting.enabled` | `boolean` | `false` in packaged builds | Allow the MCP `call` tool to run code in Persephone's main process. This can freeze the app; enable it only for trusted MCP clients. Development builds enable it by default. |
| `script-library.path` | `string` | `""` | Path to the Script Library folder. When set, a "Script Library" entry appears in the sidebar for quick access to reusable scripts. |
| `board-vars.file` | `string` | `""` | Path to the board environment-variables file (`.env.json`) — stores per-board variables/secrets outside board folders. Empty means not configured yet. May be encrypted with a password via the file's own encryption menu. See [Boards — Environment variables](../boards.md#environment-variables--secrets-outside-the-board-folder). |

Settings are stored in `appSettings.json`. You can open this file via Settings → "View Settings File".

## Events

### onChanged

Subscribe to setting changes:

```javascript
const release = app.settings.onChanged.subscribe(({ key, value }) => {
    console.log(`${key} changed to`, value);
});

// To stop listening later:
release();
```
