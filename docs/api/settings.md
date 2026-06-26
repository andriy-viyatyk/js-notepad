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
const fontSize = app.settings.get("editor.fontSize");
const wordWrap = app.settings.get("editor.wordWrap");
const mcpEnabled = app.settings.get("mcp.enabled");
```

### set(key, value)

Set a setting value. Changes are persisted automatically (debounced).

```javascript
app.settings.set("theme", "monokai");
app.settings.set("editor.fontSize", 16);
app.settings.set("editor.wordWrap", "on");
app.settings.set("mcp.enabled", true);
```

## Common Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `theme` | `string` | `"default-dark"` | Color theme name |
| `editor.fontSize` | `number` | `14` | Editor font size |
| `editor.wordWrap` | `string` | `"off"` | Word wrap mode (`"off"`, `"on"`, `"wordWrapColumn"`, `"bounded"`) |
| `mcp.enabled` | `boolean` | `false` | Enable the MCP HTTP server for AI agent integration. When `true`, external tools (e.g., Claude Desktop, Claude Code, ChatGPT) can connect to persephone and run scripts, read content, and list open tabs. The server listens on `http://127.0.0.1:{mcp.port}/mcp`. See [What's New](../whats-new.md) for details. |
| `mcp.port` | `number` | `7865` | Port for the MCP HTTP server. The server URL will be `http://127.0.0.1:{port}/mcp`. Changing this setting requires toggling `mcp.enabled` off and on to take effect. |
| `script-library.path` | `string` | `""` | Path to the Script Library folder. When set, a "Script Library" entry appears in the sidebar for quick access to reusable scripts. |

Settings are stored in `appSettings.json`. You can open this file via Settings → "View Settings File".

## Events

### onChanged

Subscribe to setting changes:

```javascript
const sub = app.settings.onChanged.subscribe(({ key, value }) => {
    console.log(`${key} changed to`, value);
});

// To unsubscribe later:
sub.dispose();
```
