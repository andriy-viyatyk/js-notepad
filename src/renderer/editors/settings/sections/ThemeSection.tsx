import { settings } from "../../../api/settings";
import { applyTheme, getAvailableThemes } from "../../../theme/themes";
import color from "../../../theme/color";
import { Panel } from "../../../uikit/Panel";
import { Text } from "../../../uikit/Text";

interface ThemePreviewProps {
    bgDefault: string;
    bgDark: string;
    textDefault: string;
    accentColor: string;
}

function ThemePreview({ bgDefault, bgDark, textDefault, accentColor }: ThemePreviewProps) {
    return (
        <div style={{
            width: 80, height: 48, borderRadius: 4,
            border: `1px solid ${color.border.default}`,
            display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
            <div style={{ height: 12, backgroundColor: bgDark }} />
            <div style={{
                flex: 1, padding: "4px 6px", display: "flex",
                flexDirection: "column", gap: 2, backgroundColor: bgDefault,
            }}>
                <div style={{ height: 3, borderRadius: 1, opacity: 0.6, backgroundColor: accentColor, width: "60%" }} />
                <div style={{ height: 3, borderRadius: 1, opacity: 0.6, backgroundColor: textDefault, width: "80%" }} />
                <div style={{ height: 3, borderRadius: 1, opacity: 0.6, backgroundColor: textDefault, width: "45%" }} />
            </div>
        </div>
    );
}

export function ThemeSection() {
    const currentThemeId = settings.use("theme");
    const themes = getAvailableThemes();
    const darkThemes = themes.filter((theme) => theme.isDark);
    const lightThemes = themes.filter((theme) => !theme.isDark);

    const handleThemeChange = (themeId: string) => {
        applyTheme(themeId);
        settings.set("theme", themeId);
    };

    const renderThemeGrid = (sectionThemes: typeof themes) => (
        <Panel direction="row" wrap gap="lg" justify="center" paddingBottom="xl">
            {sectionThemes.map((theme) => (
                <div key={theme.id} onClick={() => handleThemeChange(theme.id)} style={{ cursor: "pointer" }}>
                    <Panel
                        direction="column"
                        align="center"
                        justify="center"
                        gap="md"
                        paddingY="lg"
                        paddingX="md"
                        width={160}
                        height={100}
                        background="dark"
                        border
                        borderColor={currentThemeId === theme.id ? "active" : "default"}
                        rounded="md"
                    >
                        <ThemePreview
                            bgDefault={theme.colors["--color-bg-default"]}
                            bgDark={theme.colors["--color-bg-dark"]}
                            textDefault={theme.colors["--color-text-default"]}
                            accentColor={theme.colors["--color-misc-blue"]}
                        />
                        <Text size="sm" align="center">{theme.name}</Text>
                    </Panel>
                </div>
            ))}
        </Panel>
    );

    return (
        <>
            <Panel paddingBottom="lg"><Text bold size="sm">Theme</Text></Panel>
            <Panel paddingBottom="md">
                <Text variant="uppercased" color="light" bold size="xs">Dark</Text>
            </Panel>
            {renderThemeGrid(darkThemes)}
            <Panel paddingBottom="md">
                <Text variant="uppercased" color="light" bold size="xs">Light</Text>
            </Panel>
            {renderThemeGrid(lightThemes)}
        </>
    );
}
