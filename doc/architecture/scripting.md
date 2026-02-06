# Scripting System

## Overview

js-notepad includes a JavaScript execution environment that allows users to:
- Transform content programmatically
- Automate repetitive tasks
- Connect to databases and APIs
- Process data with full Node.js access

## Execution Modes

### 1. Run Script (F5)

For files with `javascript` language:
- Runs selected text, or entire content if nothing selected
- Output appears in grouped page

### 2. Script Panel

Available on any text file:
- Open via toolbar or context menu
- Write scripts that operate on the page content
- Scripts have access to `page` variable

## Script Context

Scripts execute with access to these globals:

### `page` Object

```typescript
interface PageContext {
  // Content
  content: string;      // Read/write page content

  // Language
  language: string;     // Read/write language mode

  // Editor type
  editor: PageEditor;   // "monaco" | "grid-json" | "grid-csv" | "md-view"

  // Custom data
  data: any;            // Persistent data storage for scripts

  // Grouped page
  grouped: PageContext; // Access/create grouped page
}
```

### `React`

The React library is available for advanced use cases.

### Full Node.js Access

With `nodeIntegration: true`, scripts can use:

```javascript
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load npm packages
const sql = require(path.join('D:\\packages\\node_modules', 'mssql'));
const axios = require(path.join('D:\\packages\\node_modules', 'axios'));
```

## Examples

### Transform JSON

```javascript
// Parse, filter, and format JSON
const data = JSON.parse(page.content);
return data.filter(item => item.active).map(item => ({
  name: item.name,
  email: item.email,
}));
```

### Query Database

```javascript
const path = require('path');
const sql = require(path.join('D:\\packages\\node_modules', 'mssql'));

const config = {
  user: 'sa',
  password: '123',
  server: 'localhost',
  database: 'MyDB',
  options: { encrypt: false, trustServerCertificate: true }
};

await sql.connect(config);
const result = await sql.query(page.content);
await sql.close();

page.grouped.language = 'json';
page.grouped.editor = 'grid-json';
return result.recordset;
```

### Fetch API Data

```javascript
const https = require('https');

const data = await new Promise((resolve, reject) => {
  https.get('https://api.example.com/data', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => resolve(JSON.parse(body)));
  }).on('error', reject);
});

return data;
```

### Process CSV

```javascript
const lines = page.content.split('\n');
const headers = lines[0].split(',');
const rows = lines.slice(1).map(line => {
  const values = line.split(',');
  return headers.reduce((obj, header, i) => {
    obj[header.trim()] = values[i]?.trim();
    return obj;
  }, {});
});
return rows;
```

## Grouped Pages

When a script accesses `page.grouped`:
1. If no grouped page exists, one is automatically created
2. The new page is grouped (side-by-side) with the source page
3. Script return value is written to the grouped page

```javascript
// This automatically creates and groups a new page
page.grouped.content = 'Output here';
page.grouped.language = 'json';
```

## Script Output

The script's return value is processed:

| Return Type | Output |
|-------------|--------|
| `string` | Written as-is |
| `number`, `boolean` | Converted to string |
| `object`, `array` | JSON.stringify with formatting |
| `Error` | Error message + stack trace |
| `undefined` | "undefined" |

## Implementation Details

### ScriptRunner

Located in `/core/services/scripting/ScriptRunner.ts`:
- Wraps script in async function
- Provides script context via proxy
- Handles errors and async results
- Formats output for display

### ScriptContext

Located in `/core/services/scripting/ScriptContext.ts`:
- Creates the `page` wrapper object
- Provides read-only `globalThis` proxy
- Manages grouped page creation

## Security Considerations

Scripts have full Node.js access. This is by design for power users, but means:
- Scripts can access filesystem
- Scripts can make network requests
- Scripts can execute any Node.js code

This is appropriate for a developer tool where the user writes/controls the scripts.

## Future Enhancements

Planned improvements (see `/doc/tasks/`):
- Script hooks (run on language change, file open)
- Toolbar builder API for scripts
- Expanded `app` context for script capabilities
