import { debounce } from "../../shared/utils";
import { TModel } from "../core/state/model";
import { TGlobalState } from "../core/state/state";
import { parseJSON5 } from "../core/utils/parse-utils";
import { filesModel } from "./files-store";
import { FileWatcher } from "../core/services/file-watcher";

const settingsFileName = "appSettings.json";

export type AppSettingsKey = "tab-recent-languages";

const settingsComments: Record<AppSettingsKey, string> = {
    "tab-recent-languages":
        "Recently selected languages.\nMore recent languages will appear on top of 'change language' menu.",
};

const defaultAppSettingsState = {
    settings: {
        "tab-recent-languages": ["plaintext"],
    },
};

type AppSettingsState = typeof defaultAppSettingsState;

class AppSettings extends TModel<AppSettingsState> {
    private fileWatcher: FileWatcher | undefined;

    constructor() {
        super(new TGlobalState(defaultAppSettingsState));
        this.init();
    }

    get = (
        key: AppSettingsKey
    ): AppSettingsState["settings"][AppSettingsKey] => {
        return this.state.get().settings[key];
    };

    set = (
        key: AppSettingsKey,
        value: AppSettingsState["settings"][AppSettingsKey]
    ): void => {
        this.state.update((s) => {
            s.settings[key] = value;
        });
        this.saveSettingsDebounced();
    };

    use = (
        key: AppSettingsKey
    ): AppSettingsState["settings"][AppSettingsKey] => {
        return this.state.use((s) => s.settings[key]);
    };

    get settingsFilePath(): string {
        return this.fileWatcher?.filePath || "";
    }

    private init = async () => {
        await filesModel.prepareDataFile(settingsFileName, "{}");
        this.fileWatcher = new FileWatcher(
            await filesModel.dataFileName(settingsFileName),
            this.fileChanged
        );
        await this.loadSettings();
    };

    private fileChanged = () => {
        this.loadSettings();
    };

    private loadSettings = async () => {
        const content = parseJSON5(await this.fileWatcher?.getTextContent());
        if (content) {
            const newSettings = {
                ...defaultAppSettingsState.settings,
                ...content,
            };
            this.state.update((s) => {
                s.settings = newSettings;
            });
        }
    };

    private saveSettings = () => {
        const content = JSON.stringify(this.state.get().settings, null, 4);
        const lines = content.split("\n");

        // Loop backward through lines
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            const trimmedLine = line.trimStart();

            // Check if line starts with any setting key
            for (const key of Object.keys(
                settingsComments
            ) as AppSettingsKey[]) {
                // Check if trimmed line starts with "key":
                if (trimmedLine.startsWith(`"${key}":`)) {
                    const comment = settingsComments[key];
                    // Get the indentation from the original line
                    const indent = line.substring(
                        0,
                        line.length - trimmedLine.length
                    );

                    // Split comment by newlines and insert each line
                    const commentLines = comment.split("\n");
                    for (let j = commentLines.length - 1; j >= 0; j--) {
                        lines.splice(i, 0, `${indent}// ${commentLines[j]}`);
                    }

                    break; // Found a match, no need to check other keys
                }
            }
        }

        const contentWithComments = lines.join("\n");
        filesModel.saveDataFile(settingsFileName, contentWithComments);
    };

    private saveSettingsDebounced = debounce(this.saveSettings, 300);
}

export const appSettings = new AppSettings();
