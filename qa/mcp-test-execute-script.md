# MCP Test: Execute Script

Tests for script execution via MCP.

---

## Test 3.1: Simple expression
**Request:** "Calculate 2 + 2 using the notepad's script executor"
**Expected:** execute_script called with simple JS, returns result
**Verify:** Correct result returned

## Test 3.2: Read active page content
**Preparation:** Open a page with some known text content
**Request:** "Read the content of the current page and tell me how many lines it has"
**Expected:** execute_script with `page.content` access, returns line count
**Verify:** Line count matches actual content

## Test 3.3: Transform page content
**Preparation:** Create a page with a JSON array like `[{"name":"Alice","age":30},{"name":"Bob","age":25}]`
**Request:** "Sort the JSON array in the current page by age in descending order"
**Expected:** execute_script reads page.content, parses JSON, sorts, writes back via page.content
**Verify:** Page content is sorted correctly

## Test 3.4: Create page via script
**Request:** "Use a script to create a new page with today's date as the title and a list of hours"
**Expected:** execute_script using app.pages API to create page
**Verify:** New page exists with correct title and content

## Test 3.5: File system access
**Request:** "List all .md files in the current directory using the notepad's scripting"
**Expected:** execute_script using app.fs or require('fs') to list files
**Verify:** Returns list of markdown files

## Test 3.6: Grid facade
**Preparation:** Create a grid-json page with some data
**Request:** "Add a new column 'status' with value 'active' to all rows in the current grid"
**Expected:** execute_script using page.editor facade, addColumn or manipulate data
**Verify:** Grid has new column with correct values

## Test 3.7: Settings access
**Request:** "What theme is the notepad currently using?"
**Expected:** execute_script using app.settings.get('theme') or similar
**Verify:** Returns current theme name

## Test 3.8: Show toast notification
**Request:** "Show a toast notification saying 'Hello from MCP!'"
**Expected:** execute_script using app.ui.showToast() or similar
**Verify:** Toast appears in notepad

## Test 3.9: TypeScript execution
**Request:** "Run a TypeScript script that defines an interface for a User and creates an array of users"
**Expected:** execute_script with language: "typescript", uses TS syntax (interfaces, type annotations)
**Verify:** Script executes without error, returns result

## Test 3.10: Error handling
**Request:** "Run a script that tries to parse invalid JSON"
**Expected:** execute_script with code that throws, returns isError: true with error message
**Verify:** Error is reported clearly, not swallowed silently
