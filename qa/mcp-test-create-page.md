# MCP Test: Create Page

Tests for creating pages with different editors via MCP.

---

## Test 1.1: Simple text page
**Request:** "Create a new page with some sample JavaScript code"
**Expected:** New page created with `editor: monaco`, `language: javascript`, contains JS code
**Verify:** Check page exists in list_pages, content is valid JS

## Test 1.2: Markdown preview page
**Request:** "Create a page with a markdown document about cats and show it in preview mode"
**Expected:** New page with `editor: md-view`, `language: markdown`, title suggests markdown, content is markdown about cats
**Verify:** Page has correct editor and language pairing

## Test 1.3: Mermaid diagram page
**Request:** "Generate a simple flowchart mermaid diagram and show it in a new page with diagram preview"
**Expected:** New page with `editor: mermaid-view`, `language: mermaid`, contains valid mermaid flowchart syntax
**Verify:** Page renders as diagram (correct editor+language), content is valid mermaid

## Test 1.4: JSON grid page
**Request:** "Create a grid page with a table of 5 countries: name, capital, population"
**Expected:** New page with `editor: grid-json`, `language: json`, title ends with `.grid.json`, content is JSON array of objects
**Verify:** Grid renders properly (not raw JSON text)

## Test 1.5: CSV grid page
**Request:** "Create a CSV grid with columns: Product, Price, Quantity. Add 3 sample rows"
**Expected:** New page with `editor: grid-csv`, `language: csv`, content is valid CSV
**Verify:** Grid renders with proper columns and rows

## Test 1.6: Notebook page
**Request:** "Create a notebook page with 3 notes: one about today's meeting, one TODO, one idea"
**Expected:** Agent reads `persephone://guides/notebook` BEFORE creating, creates page with `editor: notebook-view`, `language: json`, title ends `.note.json`, content has correct NoteItem structure (id, title, category, tags[], content.language, content.content, createdDate, updatedDate)
**Verify:** Notebook editor renders with 3 note items (no crash)

## Test 1.8: Links page
**Request:** "Create a bookmarks page with 5 useful developer links: GitHub, Stack Overflow, MDN, npm, and TypeScript docs"
**Expected:** Agent reads `persephone://guides/links` BEFORE creating, creates with `editor: link-view`, `language: json`, title ends `.link.json`, content has correct LinkItem structure (id, title, href, category, tags[])
**Verify:** Links editor renders with 5 link items

## Test 1.9: Force graph page
**Request:** "Create a graph showing a microservices architecture: API Gateway connects to Auth Service, User Service, and Order Service. Order Service connects to Payment Service and Inventory Service."
**Expected:** Agent reads `persephone://guides/graph` BEFORE creating, creates with `editor: graph-view`, `language: json`, title ends `.fg.json`, content has `type: "force-graph"`, nodes with `title`/`level`/`shape`, links, and options
**Verify:** Graph renders with correct node labels, shapes, and connections

## Test 1.10: SVG page
**Request:** "Create an SVG page with a simple red circle on white background"
**Expected:** New page with `editor: svg-view`, `language: xml`, title ends `.svg`, content is valid SVG
**Verify:** SVG renders visually

## Test 1.11: HTML page
**Request:** "Create an HTML page with a styled heading and a paragraph"
**Expected:** New page with `editor: html-view`, `language: html`, content is valid HTML
**Verify:** HTML renders in preview mode

## Test 1.12: Rest Client page
**Request:** "Create a REST request collection page with two requests: GET users and POST create user, for the API at https://api.example.com"
**Expected:** Agent reads the pages guide (rest-client format lives there), creates with `editor: rest-client`, `language: json`, title ends `.rest.json`, content has `type: "rest-client"` and a `requests` array with unique ids
**Verify:** Rest Client editor renders both requests grouped in a collection

## Test 1.13: JSONL grid page
**Request:** "Create a page showing these log records as a grid: three JSON lines with fields time, level, message"
**Expected:** New page with `editor: grid-jsonl`, `language: jsonl`, content is newline-delimited JSON objects
**Verify:** Grid renders 3 rows with the 3 columns

## Test 1.14: Standalone editor refusal
**Request:** "Create a new page with the browser-view editor showing google.com"
**Expected:** If the agent tries `create_page` with `editor: browser-view`, it gets the standalone-editor error with a hint, and recovers by calling `open_url` instead (best: it uses open_url directly)
**Verify:** A browser page with google.com exists; agent did not loop on create_page errors
