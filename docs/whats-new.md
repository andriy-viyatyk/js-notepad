[← Home](./index.md)

# What's New

Release notes and changelog for js-notepad.

---

## Version 1.0.5 (Upcoming)

### New Features

- **Image Viewer**: View binary images directly in the application
  - Supported formats: PNG, JPG, GIF, WEBP, BMP, ICO
  - Zoom with mouse wheel or +/- buttons
  - Pan by dragging when zoomed in
  - Click zoom indicator to reset to fit view
  - Automatic fit-to-window on open

- **SVG Preview**: Preview SVG files as rendered graphics
  - Open SVG in Monaco text editor by default
  - Switch to "Preview" mode using toolbar button
  - Same zoom/pan controls as Image Viewer
  - Shows live preview of unsaved changes

### Improvements

- **Application Structure Refactoring**: Major reorganization of codebase for better maintainability
  - New folder structure: `/core`, `/store`, `/editors`, `/components`, `/features`
  - All editors now in unified `/editors` folder
  - Better separation of concerns

- **Editor Registry Pattern**: New declarative system for editor registration
  - Single place to register editors (`register-editors.ts`)
  - Adding new editors now requires only one file change
  - Automatic file type detection by extension or filename patterns
  - Priority-based editor resolution
  - See [Editor Guide](/doc/standards/editor-guide.md) for details

### Documentation

- New developer documentation structure
- Architecture documentation
- Coding standards and guides
- Task tracking system
- User documentation with guides

---

## Version 1.0.4

### Improvements

- File operations improvements

---

## Version 1.0.3

### Features

- Grid improvements for JSON/CSV viewing
- Better file operation handling

---

## Version 1.0.2

### Bug Fixes

- Various stability improvements

---

## Version 1.0.1

### Features

- Initial public release
- Monaco Editor integration
- JavaScript script execution
- JSON/CSV Grid view
- Markdown preview
- PDF viewer
- Tab management
- File encryption

---

## Planned Features

See [GitHub Issues](https://github.com/andriy-viyatyk/js-notepad/issues) for planned features and known issues.

### Coming Soon

- Testing infrastructure
- Keyboard shortcut customization
