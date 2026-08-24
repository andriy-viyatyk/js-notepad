import type { HTMLAttributes } from "react";
import * as monaco from "monaco-editor";
import {
    applyRestProps,
    clearRestListeners,
    createRestPropsState,
    type RestPropsState,
} from "../../uikit/shared/react-compat";
import { VanillaView } from "../../uikit/shared/vanilla-view";

// =============================================================================
// JSON Monarch Grammar
// =============================================================================
// Monaco's JSON language uses a web worker for tokenization, which loads
// asynchronously. The `colorize()` API needs a synchronous monarch grammar.
// Register a basic one so JSON colorization works immediately.
// The worker-based tokenizer takes precedence in the actual editor.

monaco.languages.setMonarchTokensProvider("json", {
    tokenizer: {
        root: [
            [/\s+/, "white"],
            [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number.float.json"],
            [/\b(?:true|false|null)\b/, "keyword.json"],
            [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "string.key.json"],
            [/"(?:[^"\\]|\\.)*"/, "string.value.json"],
            [/[{}]/, "delimiter.bracket.json"],
            [/[[\]]/, "delimiter.array.json"],
            [/[,:]/, "delimiter.json"],
        ],
    },
});

export interface ColorizedCodeProps extends HTMLAttributes<HTMLElement> {
    /** Source code text to colorize. */
    code: string;
    /** Monaco language ID (e.g. "json", "javascript", "typescript"). */
    language: string;
    /** Tab size for colorization. Default: 4. */
    tabSize?: number;
}

export class ColorizedCodeView extends VanillaView<ColorizedCodeProps> {
    private readonly restPropsState: RestPropsState = createRestPropsState();
    private requestGeneration = 0;
    private currentCode = "";
    private currentLanguage = "";
    private currentTabSize = 4;

    public constructor(props: ColorizedCodeProps) {
        super(props, document.createElement("code"));
    }

    protected onMount(): void {
        this.applyResidualProps(this.props);
        this.startColorization(this.props);
    }

    protected onUpdate(props: ColorizedCodeProps): void {
        this.applyResidualProps(props);
        const tabSize = props.tabSize ?? 4;
        if (
            props.code === this.currentCode
            && props.language === this.currentLanguage
            && tabSize === this.currentTabSize
        ) return;
        this.startColorization(props);
    }

    protected onDispose(): void {
        this.requestGeneration += 1;
        clearRestListeners(this.root, this.restPropsState);
    }

    private applyResidualProps(props: ColorizedCodeProps): void {
        const { code: _code, language: _language, tabSize: _tabSize, ...rest } = props;
        applyRestProps(this.root, rest as Record<string, unknown>, this.restPropsState);
    }

    private startColorization(props: ColorizedCodeProps): void {
        const tabSize = props.tabSize ?? 4;
        this.currentCode = props.code;
        this.currentLanguage = props.language;
        this.currentTabSize = tabSize;
        const generation = ++this.requestGeneration;
        this.root.textContent = props.code;

        monaco.editor.colorize(props.code, props.language, { tabSize }).then((html) => {
            if (generation !== this.requestGeneration || !html) return;
            // Safe exception: Monaco escapes source text (< and >) and emits only code-owned
            // <span class="mtk-*"> markup; this is not a general runtime-data innerHTML path.
            // Roadmap section 3.4; source escaping: node_modules/monaco-editor/esm/vs/editor/common/viewLayout/viewLineRenderer.js:856-860.
            if (this.root.innerHTML !== html) this.root.innerHTML = html;
        });
    }
}
