import { useEffect, useMemo } from "react";
import { ArchiveIcon, SvgIconComponent, SvgIconProps } from "../../theme/icons";
import { api } from "../../../ipc/renderer/api";
import { TModel } from "../../core/state/model";
import { TGlobalState } from "../../core/state/state";
import {
    getLanguageByExtension,
    getLanguageById,
} from "../../core/utils";
import {
    CIcon,
    ClojureIcon,
    CoffeescriptIcon,
    CppIcon,
    CSharpIcon,
    CssIcon,
    CsvIcon,
    DartIcon,
    DefaultIcon,
    DockerfileIcon,
    DrawIcon,
    ElixirIcon,
    FshartIcon,
    GoIcon,
    GraphqlIcon,
    GraphIcon,
    GridIcon,
    HclIcon,
    HtmlIcon,
    JavaIcon,
    JavascriptIcon,
    JsonIcon,
    JsonlIcon,
    KotlinIcon,
    LessIcon,
    LiquidIcon,
    LuaIcon,
    MarkdownIcon,
    MermaidIcon,
    NotebookIcon,
    RestClientIcon,
    TodoIcon,
    LinkIcon,
    EnvVarsIcon,
    PascalIcon,
    PerlIcon,
    PhpIcon,
    PowershellIcon,
    PugIcon,
    PythonIcon,
    RIcon,
    RubyIcon,
    RustIcon,
    ScalaIcon,
    ScssIcon,
    ShellIcon,
    SqlIcon,
    SwiftIcon,
    TypescriptIcon,
    WindowsIcon,
    XmlIcon,
    YamlIcon,
} from "../../theme/language-icons";

import { fpExtname } from "../../core/utils/file-path";
import {
    customEditorRegistry,
    parseBoardEditorId,
    resolveEditorIdForFile,
} from "../../editors/board/custom-editor-registry";
import { BoardGlyph } from "../../editors/board/BoardGlyph";

// =============================================================================
// Language → Icon mapping
// =============================================================================

export const languageIconMap: { [key: string]: SvgIconComponent } = {
    bat: WindowsIcon,
    c: CIcon,
    csharp: CSharpIcon,
    cpp: CppIcon,
    clojure: ClojureIcon,
    coffeescript: CoffeescriptIcon,
    css: CssIcon,
    dart: DartIcon,
    dockerfile: DockerfileIcon,
    go: GoIcon,
    graphql: GraphqlIcon,
    hcl: HclIcon,
    elixir: ElixirIcon,
    html: HtmlIcon,
    java: JavaIcon,
    javascript: JavascriptIcon,
    kotlin: KotlinIcon,
    less: LessIcon,
    lua: LuaIcon,
    liquid: LiquidIcon,
    markdown: MarkdownIcon,
    mysql: SqlIcon,
    "objective-c": CIcon,
    pascal: PascalIcon,
    perl: PerlIcon,
    pgsql: SqlIcon,
    php: PhpIcon,
    powershell: PowershellIcon,
    pug: PugIcon,
    python: PythonIcon,
    fsharp: FshartIcon,
    r: RIcon,
    ruby: RubyIcon,
    rust: RustIcon,
    scala: ScalaIcon,
    scss: ScssIcon,
    shell: ShellIcon,
    sql: SqlIcon,
    swift: SwiftIcon,
    typescript: TypescriptIcon,
    xml: XmlIcon,
    yaml: YamlIcon,
    json: JsonIcon,
    jsonl: JsonlIcon,
    csv: CsvIcon,
    mermaid: MermaidIcon,
    plaintext: DefaultIcon,
};

// =============================================================================
// Compound file extension → Icon mapping (overrides language icons)
// =============================================================================

const filePatternIcons: Array<{ pattern: RegExp; icon: SvgIconComponent }> = [
    { pattern: /\.note\.json$/i, icon: NotebookIcon },
    { pattern: /\.todo\.json$/i, icon: TodoIcon },
    { pattern: /\.grid\.json$/i, icon: GridIcon },
    { pattern: /\.grid\.csv$/i, icon: GridIcon },
    { pattern: /\.link\.json$/i, icon: LinkIcon },
    { pattern: /\.env\.json$/i, icon: EnvVarsIcon },
    { pattern: /\.fg\.json$/i, icon: GraphIcon },
    { pattern: /\.rest\.json$/i, icon: RestClientIcon },
    { pattern: /\.excalidraw$/i, icon: DrawIcon },
    // Archive-specific extensions (not ZIP-based documents like .docx, .xlsx, .epub)
    { pattern: /\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar|war)$/i, icon: ArchiveIcon },
];

function getFilePatternIcon(fileName: string): SvgIconComponent | undefined {
    for (const { pattern, icon } of filePatternIcons) {
        if (pattern.test(fileName)) return icon;
    }
    return undefined;
}

// =============================================================================
// System file icon cache (fetched from Windows via IPC)
// =============================================================================

const defaultSystemIconState = {
    iconCache: new Map<string, string>(),
};

type SystemIconState = typeof defaultSystemIconState;

class SystemIconModel extends TModel<SystemIconState> {
    constructor() {
        super(new TGlobalState(defaultSystemIconState));
    }

    prepareIcon = async (fileName: string) => {
        const ext = fpExtname(fileName).toLowerCase();
        if (!ext || this.state.get().iconCache.has(ext)) return;

        const iconDataUrl = await api.getFileIcon(fileName);
        const newMap = new Map(this.state.get().iconCache);
        newMap.set(ext, iconDataUrl);
        this.state.update((s) => {
            s.iconCache = newMap;
        });
    };
}

const systemIconModel = new SystemIconModel();

// =============================================================================
// FileTypeIcon — unified icon component
// =============================================================================

export interface FileTypeIconProps extends SvgIconProps {
    /** Monaco language ID (e.g., "json", "javascript"). */
    language?: string;
    /** File name or page title (e.g., "test.note.json"). */
    fileName?: string;
}

/**
 * Unified file type icon component.
 *
 * Resolution order:
 * 1. Determine language from `language` prop or file extension
 * 2. Get icon from language map
 * 3. Check compound file extension patterns (overrides language icon)
 * 4. Trusted custom-editor board icon (a board whose `fileMasks` claim this file)
 * 5. Fall back to Windows system icon (async)
 * 6. Fall back to DefaultIcon
 */
export function FileTypeIcon({ language, fileName, ...props }: FileTypeIconProps) {
    const ext = useMemo(
        () => (fileName ? fpExtname(fileName).toLowerCase() : ""),
        [fileName],
    );

    // Step 1: Determine language
    const lang = useMemo(() => {
        return (
            getLanguageById(language || "") ||
            (ext ? getLanguageByExtension(ext) : undefined)
        );
    }, [language, ext]);

    // Step 2: Language icon
    const langIcon = lang ? languageIconMap[lang.id] : undefined;

    // Step 3: Compound extension override
    const patternIcon = fileName ? getFilePatternIcon(fileName) : undefined;

    const resolvedIcon = patternIcon || langIcon;

    // Step 4: Custom-editor board icon — a trusted board that is the DEFAULT editor for this
    // file (its `editorPriority` beats the built-in claimant, e.g. the DrawIO board wins
    // *.drawio over the xml language). When the board wins the file-open it wins the ICON too,
    // OVER the language/pattern icon, so the file's icon matches the editor that actually opens
    // it. `resolveEditorIdForFile` applies the exact same priority + local-path rules as the
    // open path, so a board that does NOT win keeps the built-in icon. Reactive (via
    // `useBoardsForFile`) so a trust/mask change updates the icon live.
    const boardMatches = customEditorRegistry.useBoardsForFile(fileName || "");
    const boardRoot = useMemo(() => {
        if (!fileName || boardMatches.length === 0) return undefined;
        return parseBoardEditorId(resolveEditorIdForFile(fileName) ?? "") ?? undefined;
    }, [fileName, boardMatches]);

    // Step 5: System icon fallback (async) — only fetch if neither a static icon
    // nor a winning board applies.
    useEffect(() => {
        if (!resolvedIcon && !boardRoot && fileName && ext) {
            systemIconModel.prepareIcon(fileName);
        }
    }, [resolvedIcon, boardRoot, fileName, ext]);

    const iconCache = systemIconModel.state.use((s) => s.iconCache);

    // Step 4 result: board icon — wins OVER the language/pattern icon (the board is the file's
    // default editor). Sized from the numeric width prop; the tab / sidebar render the same
    // `BoardGlyph`, so the file icon matches the board's tab icon.
    if (boardRoot) {
        const size = typeof props.width === "number" ? props.width : 16;
        return <BoardGlyph boardRoot={boardRoot} size={size} />;
    }

    if (resolvedIcon) {
        const Icon = resolvedIcon;
        return <Icon {...props} />;
    }

    // Step 5 result: system icon
    const systemIconUrl = ext ? iconCache.get(ext) : undefined;
    if (systemIconUrl) {
        const { width = 14, height = 14 } = props;
        return <img src={systemIconUrl} style={{ width, height }} />;
    }

    // Step 6: Default
    return <DefaultIcon {...props} />;
}

// Backward-compatible alias for language menu items (language-only, no fileName)
export { FileTypeIcon as LanguageIcon };
export type { FileTypeIconProps as LanguageIconProps };
