import { SettingsEditor } from "./SettingsEditor";
import color from "../../theme/color";
import { settings } from "../../api/settings";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import { Panel } from "../../uikit/Panel";
import { Button } from "../../uikit/Button";
import { Divider } from "../../uikit/Divider";
import { Text } from "../../uikit/Text";
import { BrowserProfilesSection as BrowserProfilesSettingsSection } from "./sections/BrowserProfilesSection";
import { DefaultBrowserSection as DefaultBrowserSettingsSection } from "./sections/DefaultBrowserSection";
import { McpSection as McpSettingsSection } from "./sections/McpSection";
import { ThemeSection } from "./sections/ThemeSection";
import { FileSearchSection } from "./sections/FileSearchSection";
import {
    LinkBehaviorSection as SettingsLinkBehaviorSection,
    WindowBehaviorSection as SettingsWindowBehaviorSection,
    GitIntegrationSection as SettingsGitIntegrationSection,
    BoardVarsSection as SettingsBoardVarsSection,
    ScriptLibrarySection as SettingsScriptLibrarySection,
    DrawingLibrarySection as SettingsDrawingLibrarySection,
    VideoPlayerSection as SettingsVideoPlayerSection,
    TerminalSection as SettingsTerminalSection,
} from "./sections/SettingsSections";

interface SettingsEditorProps {
    model: SettingsEditor;
}

function SettingsView(_props: SettingsEditorProps) {
    const handleOpenSettingsFile = () => {
        const filePath = settings.settingsFilePath;
        if (filePath) {
            app.events.openRawLink.sendAsync(createLinkData(filePath));
        }
    };

    return (
        <Panel name="settings-root" direction="column" align="center" padding="xxxl">
            <Panel
                name="settings-content"
                direction="column"
                width="100%"
                maxWidth={560}
                padding="xxxl"
                background="light"
                rounded="lg"
            >
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: color.text.default, marginBottom: 24 }}>
                    Settings
                </h1>

                <ThemeSection />
                <Panel paddingY="xl"><Divider /></Panel>
                <SettingsWindowBehaviorSection />
                <Panel paddingY="xl"><Divider /></Panel>
                <BrowserProfilesSettingsSection />
                <Panel paddingY="xl"><Divider /></Panel>

                <Panel paddingBottom="lg"><Text bold size="sm">Links</Text></Panel>
                <Panel paddingBottom="md">
                    <Text color="light" size="xs">
                        How external links open from editors (Monaco, Markdown)
                    </Text>
                </Panel>
                <SettingsLinkBehaviorSection />
                <Panel paddingY="xl"><Divider /></Panel>

                <Panel paddingBottom="lg"><Text bold size="sm">Default Browser</Text></Panel>
                <DefaultBrowserSettingsSection />
                <Panel paddingY="xl"><Divider /></Panel>
                <FileSearchSection />
                <Panel paddingY="xl"><Divider /></Panel>
                <McpSettingsSection />
                <Panel paddingY="xl"><Divider /></Panel>
                <SettingsGitIntegrationSection />
                <Panel paddingY="xl"><Divider /></Panel>
                <SettingsBoardVarsSection />
                <Panel paddingY="xl"><Divider /></Panel>
                <SettingsScriptLibrarySection />
                <Panel paddingY="xl"><Divider /></Panel>
                <SettingsDrawingLibrarySection />
                <Panel paddingY="xl"><Divider /></Panel>
                <SettingsVideoPlayerSection />
                <Panel paddingY="xl"><Divider /></Panel>
                <SettingsTerminalSection />
                <Panel paddingY="xl"><Divider /></Panel>

                <Button name="settings-view-file" variant="link" size="sm" background="light" onClick={handleOpenSettingsFile}>
                    View Settings File
                </Button>
            </Panel>
        </Panel>
    );
}

export { SettingsView };
export type { SettingsEditorProps };
