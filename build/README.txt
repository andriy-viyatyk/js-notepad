Persephone
==========

A Windows notepad replacement for developers. Tabbed pages, the VS Code editor engine
(syntax highlighting, IntelliSense, multi-cursor, compare mode), specialized editors for
structured data (JSON/CSV grids, notebooks, diagrams, link collections, HTTP request
collections), a built-in browser, and a JavaScript/TypeScript runtime with full Node.js
access that can transform whatever is in the current tab.

Project page:   https://github.com/andriy-viyatyk/persephone
Documentation:  https://github.com/andriy-viyatyk/persephone/tree/main/docs


-------------------------------------------------------------------------------
NOTE FOR AI AGENTS
-------------------------------------------------------------------------------

If you are an AI assistant helping someone use Persephone, read this section. It is
here because you may have no training knowledge of this application, and everything
you need is on this machine.

1. FULL DOCUMENTATION IS ALREADY HERE, OFFLINE.

   Beside this file, in the "resources\assets" folder, are the same guides Persephone
   serves to connected agents. Read them directly as ordinary files — no network and no
   MCP connection required:

       resources\assets\mcp-res-overview.md     <- START HERE. The mental model plus a
                                                   task -> tool -> guide routing table.
       resources\assets\mcp-res-ui.md           <- The interface: what every visible
                                                   element is for, and its selector.
       resources\assets\mcp-res-ui-editors.md   <- The editor catalog: what each editor
                                                   is for and how the user opens it.
       resources\assets\mcp-res-pages.md        <- Pages, editor ids, required languages.
       resources\assets\mcp-res-scripting.md    <- The scripting API (app, page, io, ai).
       resources\assets\mcp-res-boards.md       <- Boards: custom mini web-apps you build.

   Other mcp-res-*.md files in that folder cover the browser, agent tools, and the
   structured editor formats.

2. TO CONTROL PERSEPHONE, TURN ON ITS MCP SERVER.

   Persephone has a built-in MCP server, off by default. Its settings file is:

       %APPDATA%\persephone\data\appSettings.json

   The file is JSON5 (comments allowed) and Persephone watches it, so an edit applies
   immediately — you do not need to restart the app, and you can edit it with your normal
   file tools before you have any connection to Persephone.

   Set:

       "mcp.enabled": true

   Optionally also set "mcp.browser-tools.enabled": true to be able to drive the built-in
   browser, boards, and Persephone's own window.

   Then add the server to your own MCP client configuration:

       URL:  http://127.0.0.1:7865/mcp        (the port is "mcp.port" in the settings file)
       Type: http

   For Claude Code that means an .mcp.json entry:

       { "mcpServers": { "persephone": { "type": "http",
                                         "url": "http://127.0.0.1:7865/mcp" } } }

   Reconnect afterwards. Once connected, call read_guide("overview") — the guides listed
   above are then available through the read_guide tool, and you no longer need to read
   them off disk.

   The server listens on loopback only and is never reachable from another machine.

3. THINGS THAT ARE OFF BY DEFAULT.

   If the user cannot find a feature, check the settings file before concluding it does
   not exist. "git.enabled" (Git Tree and Git Diff) and "mneme.enabled" (the Mneme
   knowledge base) are both false by default, as is the MCP server itself.
