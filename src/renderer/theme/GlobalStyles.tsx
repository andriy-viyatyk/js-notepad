import { css, Global } from "@emotion/react";
import color from "./color";
import { getResolvedColor } from "./themes";

function buildGlobalStyles() {
    const arrowColor = encodeURIComponent(
        getResolvedColor("--color-text-light")
    );

    return css`
        body {
            background-color: ${color.background.default};
            color: ${color.text.default};
            font-family: Consolas, monospace, "Courier New";
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

        #root {
            overflow: hidden;
            position: absolute;
            top: 2px;
            bottom: 2px;
            left: 2px;
            right: 2px;
            display: flex;
            flex-direction: column;
            outline: 1px solid ${color.border.default};
            border-radius: 8px;
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

        .monaco-editor.no-user-select {
            outline: none;
        }
    `;
}

export function GlobalStyles() {
    return <Global styles={buildGlobalStyles()} />;
}
