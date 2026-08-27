import type { SvgIconComponent, SvgIconProps } from "../../theme/icons";
import { ArchiveIcon } from "../../theme/icons";
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
import { subscribeBoardIconChanges } from "../../editors/board/board-icon-cache";

// =============================================================================
// Language â†’ Icon mapping
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
// Compound file extension â†’ Icon mapping (overrides language icons)
// =============================================================================

const filePatternIcons: Array<{ pattern: RegExp; icon: SvgIconComponent }> = [
    { pattern: /\.note\.json$/i, icon: NotebookIcon },
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
    private readonly pendingExtensions = new Set<string>();

    constructor() {
        super(new TGlobalState(defaultSystemIconState));
    }

    prepareIcon = async (fileName: string) => {
        const ext = fpExtname(fileName).toLowerCase();
        if (!ext || this.state.get().iconCache.has(ext) || this.pendingExtensions.has(ext)) return;

        this.pendingExtensions.add(ext);
        try {
            const iconDataUrl = await api.getFileIcon(fileName);
            const newMap = new Map(this.state.get().iconCache);
            newMap.set(ext, iconDataUrl);
            this.state.update((s) => {
                s.iconCache = newMap;
            });
        } finally {
            this.pendingExtensions.delete(ext);
        }
    };
}

const systemIconModel = new SystemIconModel();

export type ResolvedFileIcon =
    | { kind: "component"; Icon: SvgIconComponent }
    | { kind: "board"; boardRoot: string }
    | { kind: "system"; url: string }
    | { kind: "default" };

export function resolveFileIcon(fileName: string, language?: string): ResolvedFileIcon {
    const ext = fpExtname(fileName).toLowerCase();
    const lang = getLanguageById(language || "") || (ext ? getLanguageByExtension(ext) : undefined);
    const staticIcon = getFilePatternIcon(fileName) || (lang ? languageIconMap[lang.id] : undefined);
    const boardMatches = customEditorRegistry.getBoardsForFile(fileName);
    const boardRoot = boardMatches.length
        ? parseBoardEditorId(resolveEditorIdForFile(fileName) ?? "")
        : null;
    if (boardRoot) return { kind: "board", boardRoot };
    if (staticIcon) return { kind: "component", Icon: staticIcon };
    const url = ext ? systemIconModel.state.get().iconCache.get(ext) : undefined;
    if (url) return { kind: "system", url };
    return { kind: "default" };
}

export function prepareFileIcon(fileName: string): void { void systemIconModel.prepareIcon(fileName); }

/** Subscribe native icon owners to system-cache and trusted-board association changes. */
export function subscribeFileIconChanges(listener: () => void): () => void {
    const unsubSystem = systemIconModel.state.subscribe(listener);
    const unsubBoards = customEditorRegistry.state.subscribe(listener);
    const unsubBoardIcons = subscribeBoardIconChanges(listener);
    return () => {
        unsubSystem();
        unsubBoards();
        unsubBoardIcons();
    };
}

export interface FileTypeIconProps extends SvgIconProps {
    /** Monaco language ID (e.g., "json", "javascript"). */
    language?: string;
    /** File name or page title (e.g., "test.note.json"). */
    fileName?: string;
}

// =============================================================================
// FileTypeIcon â€” unified icon component
// =============================================================================
