export interface ThemeDefinition {
    id: string;
    name: string;
    colors: Record<string, string>;
    monaco: {
        base: "vs-dark" | "vs" | "hc-black";
        colors: Record<string, string>;
    };
}
