[← Home](./index.md)

# JavaScript Scripting

js-notepad lets you run JavaScript to transform and process content.

## Quick Start

1. Open a file with JavaScript code (or set language to JavaScript)
2. Press `F5` to run
3. Output appears in a new grouped tab

## Running Scripts

### Run File Content
- Set file language to JavaScript
- Press `F5` to run entire file
- Or select text and press `F5` to run selection

### Script Panel
- Open Script Panel from toolbar or context menu
- Write scripts that operate on any file type
- Press `F5` in Script Panel to run

## The `page` Object

Scripts have access to `page` representing the current file:

```javascript
// Read content
const text = page.content;

// Write content
page.content = "new content";

// Get/set language
console.log(page.language);  // "javascript"
page.language = "json";

// Get/set editor type
page.editor = "grid-json";  // Switch to grid view

// Custom data storage
page.data.myValue = 123;
```

## Grouped Pages (Output)

When a script runs, the result is displayed in a grouped (side-by-side) output page:

- **On success:** The return value is written to the output page
- **On error:** The error message with stack trace is displayed
- **No return value:** Shows "undefined"

```javascript
// Return value is written to grouped page
return { result: "data" };
```

You can configure the output page before returning:

```javascript
// Set language and editor type for the output
page.grouped.language = "json";
page.grouped.editor = "grid-json";
return result.recordset;
```

**Note:** Currently, any value assigned to `page.grouped.content` will be overwritten by the script's return value. Use `return` to set the output content.

## Examples

### Transform JSON

```javascript
// Parse, filter, and format
const data = JSON.parse(page.content);
return data.filter(item => item.active);
```

### Process CSV Lines

```javascript
const lines = page.content.split('\n');
const filtered = lines.filter(line => line.includes('important'));
return filtered.join('\n');
```

### Convert JSON to CSV

```javascript
const data = JSON.parse(page.content);
const headers = Object.keys(data[0]);
const csv = [
  headers.join(','),
  ...data.map(row => headers.map(h => row[h]).join(','))
];
return csv.join('\n');
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

// Display as grid
page.grouped.language = 'json';
page.grouped.editor = 'grid-json';
return result.recordset;
```

### Fetch API Data

```javascript
const https = require('https');

const data = await new Promise((resolve, reject) => {
  https.get('https://api.example.com/users', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => resolve(JSON.parse(body)));
  }).on('error', reject);
});

return data;
```

## Node.js Access

Scripts have full Node.js access:

```javascript
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Read other files
const config = fs.readFileSync('config.json', 'utf8');

// Use npm packages (from your node_modules)
const _ = require(path.join('D:\\myproject\\node_modules', 'lodash'));
```

## Output Types

| Return Type | Result |
|-------------|--------|
| String | Written as-is |
| Number/Boolean | Converted to string |
| Object/Array | JSON formatted |
| Error | Error message + stack |
| undefined | "undefined" |

## Tips

1. **Use async/await** for asynchronous operations
2. **Return values** to set output content (assignments to `page.grouped.content` are overwritten)
3. **Set language** on grouped page for syntax highlighting: `page.grouped.language = 'json'`
4. **Use grid view** for tabular data: `page.grouped.editor = 'grid-json'`
