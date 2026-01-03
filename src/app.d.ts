import { Endpoint, EventEndpoint } from "./ipc/api-types";

declare global {
    interface Window {
        electron: {
            ipcRenderer: {
                sendMessage(
                    channel: Endpoint | EventEndpoint,
                    ...args: unknown[]
                ): void;
                on(
                    channel: Endpoint | `${Endpoint}_${number}` | EventEndpoint,
                    func: (...args: unknown[]) => void
                ): () => void;
                once(
                    channel: Endpoint | `${Endpoint}_${number}`,
                    func: (...args: unknown[]) => void
                ): void;
            };
        };

        utils: {
            uuid: () => string;
            path: {
                join: (...paths: string[]) => string;
                resolve: (...paths: string[]) => string;
                extname: (path: string) => string;
                dirname: (path: string) => string;
                basename: (path: string) => string;
            };
            fs: {
                listFiles: (dirPath: string, pattern?: string | RegExp) => string[];
                loadStringFile: (filePath: string) => string;
                saveStringFile: (filePath: string, content: string) => void;
                fileExists: (filePath: string) => boolean;
                deleteFile: (filePath: string) => boolean;
                preparePath: (dirPath: string) => boolean;
            };
        };
    }
}

export {};
