import { toImageResult } from "../tool-results";
import { IMcpToolDef } from "../types";
import { IToolContext } from "./params";

// Browser automation (Playwright-compatible). Registered only when the browser tools
// setting is on — the server factory filters this group in or out.

export function browserTools(ctx: IToolContext): IMcpToolDef[] {
    const { z, windowIndex, browserPageId: pageId, browserProfile: profileName } = ctx;
    const target = { pageId, profileName, windowIndex };
    return [
        {
            name: "browser_navigate",
            description: "Navigate the browser to a URL. Returns the page accessibility snapshot after loading.",
            schema: {
                url: z.string().describe("URL to navigate to."),
                ...target,
            },
        },
        {
            name: "browser_snapshot",
            description: "Get the accessibility snapshot of the current page. Returns a YAML-like tree of elements with roles, names, and ref IDs for interaction. Preferred over screenshots — structured, fast, deterministic.",
            schema: { ...target },
        },
        {
            name: "browser_click",
            description: "Click an element on the page. Accepts a CSS selector or a ref from the accessibility snapshot. Returns updated accessibility snapshot.",
            schema: {
                selector: z.string().optional().describe("CSS selector for the target element."),
                ref: z.string().optional().describe("Element ref from accessibility snapshot (e.g., 'e52')."),
                element: z.string().optional().describe("Human-readable element description (used as CSS selector)."),
                ...target,
            },
        },
        {
            name: "browser_hover",
            description: "Hover over an element on the page. Triggers mouseenter and mouseover events — useful for revealing tooltips, dropdown menus, and hover-dependent UI. Returns updated accessibility snapshot.",
            schema: {
                selector: z.string().optional().describe("CSS selector for the target element."),
                ref: z.string().optional().describe("Element ref from accessibility snapshot (e.g., 'e52')."),
                element: z.string().optional().describe("Human-readable element description (used as CSS selector)."),
                ...target,
            },
        },
        {
            name: "browser_type",
            description: "Type text into editable element. Clears existing content first. Works on inputs, textareas, and contentEditable elements. By default fills text at once; use slowly for character-by-character typing. Returns updated accessibility snapshot.",
            schema: {
                selector: z.string().optional().describe("CSS selector for the target element."),
                ref: z.string().optional().describe("Element ref from accessibility snapshot (e.g., 'e52')."),
                text: z.string().describe("Text to type into the element."),
                submit: z.boolean().optional().describe("Whether to press Enter after typing (e.g. to submit a form)."),
                slowly: z.boolean().optional().describe("Whether to type one character at a time. Useful for triggering key handlers in the page. By default entire text is filled in at once."),
                ...target,
            },
        },
        {
            name: "browser_select_option",
            description: "Select an option in a <select> element by value. Returns updated accessibility snapshot.",
            schema: {
                selector: z.string().optional().describe("CSS selector for the <select> element."),
                ref: z.string().optional().describe("Element ref from accessibility snapshot."),
                value: z.string().optional().describe("Option value to select."),
                values: z.array(z.string()).optional().describe("Array of option values to select (Playwright-compatible). First value is used for single-select."),
                ...target,
            },
        },
        {
            name: "browser_press_key",
            description: "Press a keyboard key. Returns updated accessibility snapshot.",
            schema: {
                key: z.string().describe("Key to press (e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown')."),
                ...target,
            },
        },
        {
            name: "browser_evaluate",
            description: "Run JavaScript in the browser page and return the result. Supports async expressions.",
            schema: {
                expression: z.string().optional().describe("JavaScript expression to evaluate in the page."),
                function: z.string().optional().describe("JavaScript function to call, e.g. '() => document.title'. Playwright-compatible alias for 'expression'."),
                ...target,
            },
        },
        {
            name: "browser_tabs",
            description: "Manage browser tabs: list all tabs, open a new tab, close a tab, or switch to a tab.",
            schema: {
                action: z.enum(["list", "new", "close", "select"]).optional()
                    .describe("Operation to perform: 'list' (default), 'new', 'close', 'select'."),
                index: z.number().optional()
                    .describe("Tab index (0-based) for 'close' or 'select'. If omitted for 'close', closes the active tab."),
                url: z.string().optional()
                    .describe("URL to open in the new tab (for 'new' action)."),
                ...target,
            },
        },
        {
            name: "browser_navigate_back",
            description: "Navigate back in browser history. Returns updated accessibility snapshot.",
            schema: { ...target },
        },
        {
            name: "browser_wait_for",
            description: "Wait for an element or text to appear/disappear, or wait a fixed time. Returns accessibility snapshot.",
            schema: {
                selector: z.string().optional().describe("CSS selector to wait for."),
                text: z.string().optional().describe("Text content to wait for on the page."),
                textGone: z.string().optional().describe("Wait until this text is no longer visible on the page (Playwright-compatible)."),
                time: z.number().optional().describe("Time to wait in seconds (Playwright-compatible). E.g. 2 = 2 seconds."),
                timeout: z.number().optional().describe("Max wait time in ms (default 30000). Applies to selector/text/textGone modes."),
                ...target,
            },
        },
        {
            name: "browser_take_screenshot",
            description: "Take a screenshot of the current page. Returns a base64-encoded PNG image.",
            schema: { ...target },
            toResult: toImageResult,
        },
        {
            name: "browser_network_requests",
            description: "Get the network request log for the current browser tab. Returns array of { url, method, statusCode, resourceType, requestHeaders, responseHeaders }.",
            schema: { ...target },
        },
        {
            name: "browser_close",
            description: "Close the active browser tab.",
            schema: { ...target },
        },
    ];
}
