# JS-Notepad

**JS-Notepad** is a high-performance, tabbed text editor built with Electron and Vite. It combines the simplicity of the classic Windows Notepad with the power of the Monaco Editor (VS Code engine), offering a versatile environment for coding, data manipulation, and document viewing.



![Demo Video](https://github.com/user-attachments/assets/c91b35c6-6add-41a7-b815-ab3eb158de53)

## Key Features

### Modern Editor Core
* **Monaco Editor:** Powered by the same engine as VS Code, providing industry-standard syntax highlighting, IntelliSense, and search/replace for over **50 languages**.
* **Advanced Tab Management:** Seamlessly add, rearrange, or **drag tabs out** into entirely new windows for multi-monitor workflows.

### Compare & Grouping Mode
* **Side-by-Side Viewing:** Hold `Ctrl` and select two tabs to view them in a split-pane layout with a custom resizer.
* **Diff Editor:** Activate **Compare Mode** to use a full DiffEditor. Compare two files and merge/restore changes from one side to the other instantly.

### Alternative Viewers
* **JSON Grid Editor:** Switch from raw code to a powerful **Grid View**. Perfect for tabular JSON data, featuring sorting, filtering, and Excel-compatible copy-pasting.
* **Markdown Preview:** Real-time toggle between Markdown source and rendered preview.
* **PDF Support:** Integrated **pdf.js** (Firefox engine) for viewing PDF documents directly within your tabs.

### JavaScript Scripting Engine
* **Standalone Runner:** Write and execute JavaScript directly in a tab. Results are automatically displayed in a grouped "output" page.
* **Context-Aware Scripting:** Open the "Script Panel" on any text file to manipulate data using the `page` variable. 
  * *Example:* `return JSON.parse(page.content).map(i => i.name);`

## Download (Windows)

| Format | Link |
| :--- | :--- |
| **Installer** | [Download .msi](https://github.com/andriy-viyatyk/js-notepad/releases/latest/download/js-notepad.msi) |
| **Portable** | [Download .zip](https://github.com/andriy-viyatyk/js-notepad/releases/latest/download/js-notepad.zip) |

---

## Contributing & Feedback

Contributions, bug reports, and feature requests are more than welcome! 

* **Found a bug?** Please [open an issue](https://github.com/andriy-viyatyk/js-notepad/issues) with a description and steps to reproduce.
* **Want to contribute?** Feel free to fork the repository and submit a pull request. Whether it's a new "Alternative Editor," a bug fix, or a typo in the documentation, every bit helps!
* **Ideas?** If you have a "cool idea" for a tool that should be built into JS-Notepad, jump into the [discussions](https://github.com/andriy-viyatyk/js-notepad/discussions) and let's talk about it.
---
Licensed under the MIT License.