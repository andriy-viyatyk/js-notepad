export interface MonacoLanguage {
    aliases: string[];
    extensions: string[];
    id: string;
}

export type TMessageType = "info" | "success" | "warning" | "error";

export interface LoadedTextFile {
    content: string;
    encoding: string;
}