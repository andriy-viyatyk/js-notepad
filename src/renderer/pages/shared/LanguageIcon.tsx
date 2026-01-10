import { ReactNode, useMemo } from "react";
import { SvgIconComponent, SvgIconProps } from "../../theme/icons";
import {
    getLanguageByExtension,
    getLanguageById,
} from "../../model/language-mapping";
import {
    CIcon,
    ClojureIcon,
    CoffeescriptIcon,
    CppIcon,
    CSharpIcon,
    CssIcon,
    DartIcon,
    DefaultIcon,
    DockerfileIcon,
    ElixirIcon,
    FshartIcon,
    GoIcon,
    GraphqlIcon,
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

const languageIconMap: { [key: string]: SvgIconComponent } = {
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
};

export interface LanguageIconProps extends SvgIconProps {
    language?: string;
    ext?: string;
    getIcon?: () => ReactNode;
}

export function LanguageIcon({ language, ext, getIcon, ...props }: LanguageIconProps) {
    const lang = useMemo(() => {
        return (
            getLanguageById(language || "") ||
            (ext ? getLanguageByExtension(ext) : undefined)
        );
    }, [language, ext]);

    if (getIcon) {
        return <>{getIcon()}</>;
    }

    const Icon = languageIconMap[lang?.id || ""] || DefaultIcon;
    return <Icon {...props} />;
}
