import { useEffect, useMemo } from "react";
import { SvgIconComponent, SvgIconProps } from "../../theme/icons";
import { api } from "../../../ipc/renderer/api";
import { TModel } from "../../core/state/model";
import { TGlobalState } from "../../core/state/state";
import {
    getLanguageByExtension,
    getLanguageById,
} from "../../store";
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
    ElixirIcon,
    FshartIcon,
    GoIcon,
    GraphqlIcon,
    GridIcon,
    HclIcon,
    HtmlIcon,
    JavaIcon,
    JavascriptIcon,
    JsonIcon,
    KotlinIcon,
    LessIcon,
    LiquidIcon,
    LuaIcon,
    MarkdownIcon,
    MermaidIcon,
    NotebookIcon,
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

const path = require("path");

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
    csv: CsvIcon,
    mermaid: MermaidIcon,
};

// =============================================================================
// Compound file extension → Icon mapping (overrides language icons)
// =============================================================================

const filePatternIcons: Array<{ pattern: RegExp; icon: SvgIconComponent }> = [
    { pattern: /\.note\.json$/i, icon: NotebookIcon },
    { pattern: /\.grid\.json$/i, icon: GridIcon },
    { pattern: /\.grid\.csv$/i, icon: GridIcon },
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
        const ext = path.extname(fileName).toLowerCase();
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
 * 4. Fall back to Windows system icon (async)
 * 5. Fall back to DefaultIcon
 */
export function FileTypeIcon({ language, fileName, ...props }: FileTypeIconProps) {
    const ext = useMemo(
        () => (fileName ? path.extname(fileName).toLowerCase() : ""),
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

    // Step 4: System icon fallback (async) — only fetch if no static icon found
    useEffect(() => {
        if (!resolvedIcon && fileName && ext) {
            systemIconModel.prepareIcon(fileName);
        }
    }, [resolvedIcon, fileName, ext]);

    const iconCache = systemIconModel.state.use((s) => s.iconCache);

    if (resolvedIcon) {
        const Icon = resolvedIcon;
        return <Icon {...props} />;
    }

    // Step 4 result: system icon
    const systemIconUrl = ext ? iconCache.get(ext) : undefined;
    if (systemIconUrl) {
        const { width = 14, height = 14 } = props;
        return <img src={systemIconUrl} style={{ width, height }} />;
    }

    // Step 5: Default
    return <DefaultIcon {...props} />;
}

// Backward-compatible alias for language menu items (language-only, no fileName)
export { FileTypeIcon as LanguageIcon };
export type { FileTypeIconProps as LanguageIconProps };
