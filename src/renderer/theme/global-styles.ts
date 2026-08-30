import color from "./color";
import { resolveColor } from "./themes";
import { themeState } from "./theme-state";

function buildGlobalStyles(): string {
    const arrowColor = encodeURIComponent(
        resolveColor("--color-text-light")
    );

    return `
        body {
            background-color: ${color.background.default};
            color: ${color.text.default};
            font-family: var(--p-font-family);
            font-size: 14px;
            font-weight: normal;
            overflow: hidden;
        }

        input,
        textarea,
        select,
        button {
            font-family: var(
                --vscode-editor-font-family,
                Consolas,
                monospace,
                "Courier New"
            );
            font-size: var(--vscode-editor-font-size, 14px);
            font-weight: var(--vscode-editor-font-weight, normal);
        }

        /* Include the custom scrollbar styles */
        ::-webkit-scrollbar {
            width: 16px;
            height: 16px;
        }

        ::-webkit-scrollbar-thumb {
            background-color: ${color.background.scrollBarThumb};
            border-radius: 6px;
            border: 3px solid transparent;
            background-clip: content-box;
            cursor: default;
        }

        ::-webkit-scrollbar-track {
            background-color: ${color.background.light};
            border-radius: 6px;
        }

        ::-webkit-scrollbar-corner {
            background-color: ${color.background.light};
        }

        /* Style the scrollbar buttons */
        ::-webkit-scrollbar-button {
            background-color: ${color.background.scrollBar};
            border: none;
            height: 16px;
            width: 16px;
            cursor: default;
        }

        /* Scrollbar button arrows (data URIs require resolved colors, not CSS variables) */
        ::-webkit-scrollbar-button:vertical:decrement {
            background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${arrowColor}"><polygon points="8,4 12,8 4,8"/></svg>')
                no-repeat center;
        }

        ::-webkit-scrollbar-button:vertical:increment {
            background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${arrowColor}"><polygon points="4,8 12,8 8,12"/></svg>')
                no-repeat center;
        }

        ::-webkit-scrollbar-button:horizontal:decrement {
            background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${arrowColor}"><polygon points="8,4 8,12 4,8"/></svg>')
                no-repeat center;
        }

        ::-webkit-scrollbar-button:horizontal:increment {
            background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${arrowColor}"><polygon points="8,4 8,12 12,8"/></svg>')
                no-repeat center;
        }

        ::selection {
            background: ${color.background.selection};
            color: ${color.text.selection};
        }

        .highlighted-text {
            color: ${color.misc.blue};
        }

        .highlighted-text-active {
            color: ${color.misc.blue};
            background-color: ${color.highlight.activeMatch};
            border-radius: 2px;
        }

        .monaco-editor.no-user-select {
            outline: none;
        }

        /* VSCode-like scrollbar: hidden by default, thumb fades in on hover.
         *
         * The second selector covers av-grid's scroll container, which RenderGrid builds itself.
         * The retired uikit/VirtualGrid fork added scroll-container to its own container inside
         * VirtualGridView, so every grid built on it inherited this treatment and no consumer
         * could forget it. We no longer own that class, so the single place that cannot be
         * forgotten is this rule -- and putting the selector here, rather than restating the
         * declarations in DataGrid.css, keeps one definition of what a scrollbar looks like.
         *
         * This deliberately covers the DataGrid too: av-grid ships no scrollbar styling of its
         * own, so those grids had the browser default. Every grid in the app now scrolls the
         * same way.
         *
         * No backticks in this comment on purpose -- the whole block is a template literal, and
         * one would end it. */
        .scroll-container,
        [data-type="render-grid-scroll"] {
            scrollbar-color: transparent transparent;
            scrollbar-width: thin;
            transition: scrollbar-color 0.3s ease;
        }
        .scroll-container:hover,
        [data-type="render-grid-scroll"]:hover {
            scrollbar-color: ${color.background.scrollBarThumb} transparent;
        }

        /* Suppress all scrollbar rendering for surfaces paired with an
         * external indicator (e.g. minimap). Set via Panel scrollbar="hidden". */
        [data-scrollbar="hidden"] {
            scrollbar-color: transparent transparent;
            scrollbar-width: none;
        }
        [data-scrollbar="hidden"]::-webkit-scrollbar {
            display: none;
            width: 0;
            height: 0;
        }

        /* Portal mount target for full-area overlays (e.g. NotebookEditor's
         * expanded note view). Hidden when no portal content is present so the
         * background color does not blanket the editor. */
        .editor-overlay {
            position: absolute;
            inset: 0;
            z-index: 5;
            background-color: ${color.background.default};
            display: flex;
            flex-direction: column;
        }
        .editor-overlay:empty {
            display: none;
        }

        /* TextFooter portal target — hidden when the secondary view pushes
         * no footer content. The :has() rule also hides the leading Divider
         * so the user does not see two adjacent dividers with nothing
         * between them. */
        .footer-portal-target:empty {
            display: none;
        }
        [data-type="divider"]:has(+ .footer-portal-target:empty) {
            display: none;
        }
    `;
}

export function installGlobalStyles(): () => void {
    const style = document.createElement("style");
    style.dataset.name = "global-styles";
    document.head.append(style);
    style.textContent = buildGlobalStyles();

    // Global style installation owns this process-lifetime subscription; it updates the
    // singleton stylesheet and is not a resource of any view/model.
    const unsubscribe = themeState.subscribe(
        () => {
            style.textContent = buildGlobalStyles();
        },
        (s) => s.id
    );

    return () => {
        unsubscribe();
        style.remove();
    };
}
