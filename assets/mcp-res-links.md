# Links Editor Format (`link-view`)

**IMPORTANT: Read this guide BEFORE creating or updating links pages. Incorrect JSON structure will result in an empty or broken editor.**

## Creating a Links Page

```
create_page({
  title: "Bookmarks.link.json",
  editor: "link-view",
  language: "json",
  content: JSON.stringify(linksData)
})
```

**Required:** `language: "json"`, title ending with `.link.json`

## Root Structure

```json
{
  "links": [ ...LinkItem objects... ],
  "state": {}
}
```

| Field | Type | Description |
|-------|------|-------------|
| `links` | LinkItem[] | Array of link items |
| `state` | object | UI state (view modes, pinned links); use empty `{}` when creating |

## LinkItem Structure

Every field is **required** unless marked optional:

```json
{
  "id": "unique-id-1",
  "title": "Google",
  "href": "https://www.google.com",
  "category": "Search Engines",
  "tags": ["search", "daily"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | **yes** | Unique identifier (use UUID or any unique string) |
| `title` | string | **yes** | Display title for the link |
| `href` | string | **yes** | URL (must include protocol, e.g., `https://`) |
| `category` | string | **yes** | Category name (use `""` for uncategorized) |
| `tags` | string[] | **yes** | Array of tag strings (use `[]` for no tags) |
| `imgSrc` | string | optional | Preview image URL for tile view |

**Common mistake:** Omitting `tags` or `category` will break the editor. Always include them, even as empty (`[]` and `""`).

## Full Example

A links collection with 3 bookmarks in 2 categories:

```json
{
  "links": [
    {
      "id": "link-1",
      "title": "Google",
      "href": "https://www.google.com",
      "category": "Search Engines",
      "tags": ["search"]
    },
    {
      "id": "link-2",
      "title": "GitHub",
      "href": "https://github.com",
      "category": "Development",
      "tags": ["code", "git"]
    },
    {
      "id": "link-3",
      "title": "Stack Overflow",
      "href": "https://stackoverflow.com",
      "category": "Development",
      "tags": ["code", "q&a"]
    }
  ],
  "state": {}
}
```

## Categories and Tags

- **Categories** are hierarchical strings separated by `/` (e.g., `"Development"`, `"Development/Tools"`)
- **Tags** are flat strings for cross-category labeling
- The left panel shows categories as a tree and tags as a flat list
- Links can be viewed in list mode or tile mode (with preview images)

## Errors & verification

- **`create_page` / `set_page_content` accept broken content silently** — the tool returns
  success; unparseable JSON shows a parse error in the editor, and valid JSON missing required
  LinkItem fields renders a broken/empty editor or crashes it (`Editor crashed` + exception).
- **Verify**: `JSON.parse` your content before sending; include `tags: []` and `category: ""`
  even when empty; to confirm the render, activate the page and
  `window.screen.snapshot()`.
- **Fixing a broken page**: content survives — `get_page_content`, repair, `set_page_content`.
