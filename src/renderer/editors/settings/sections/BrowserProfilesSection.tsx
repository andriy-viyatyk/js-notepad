import { settings } from "../../../api/settings";
import { fpBasename } from "../../../core/utils/file-path";
import { useComponentModel } from "../../../core/state/model";
import color from "../../../theme/color";
import { DEFAULT_BROWSER_COLOR, TAG_COLORS } from "../../../theme/palette-colors";
import { IncognitoIcon, TorIcon } from "../../../theme/language-icons";
import { Button } from "../../../uikit/Button";
import { Dot } from "../../../uikit/Dot";
import { IconButton } from "../../../uikit/IconButton";
import { Input } from "../../../uikit/Input";
import { Panel } from "../../../uikit/Panel";
import { Text } from "../../../uikit/Text";
import { WithMenu } from "../../../uikit/Menu";
import type { MenuItem } from "../../../uikit/Menu";
import { BrowserProfilesSectionModel, defaultBrowserProfilesSectionState } from "./BrowserProfilesSectionModel";

const labelTextStyle: React.CSSProperties = { fontSize: 11, color: color.text.light };
const fieldLabelStyle: React.CSSProperties = { fontSize: 11, color: color.text.dark, minWidth: 42, flexShrink: 0 };
const linkStyle: React.CSSProperties = { cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const placeholderStyle: React.CSSProperties = { fontStyle: "italic", cursor: "pointer" };
const defaultBadgeStyle: React.CSSProperties = { fontSize: 10, color: color.text.light, textTransform: "uppercase", letterSpacing: 0.5, padding: "1px 6px", border: `1px solid ${color.border.default}`, borderRadius: 3 };

// Menu items retain their icon until the menu consumes them, so each construction must own a fresh node.
function createTagColorIcon(tagColor: string): HTMLSpanElement {
    const element = document.createElement("span");
    element.dataset.type = "dot";
    element.style.setProperty("--dot-size", "10px");
    element.style.setProperty("--dot-color", tagColor);
    return element;
}

function BookmarksFileLine({ filePath, onBrowse, onClear }: { filePath: string; onBrowse: () => void; onClear: () => void }) {
    const filename = filePath ? fpBasename(filePath) : "";
    return <Panel direction="row" align="center" gap="md" paddingTop="xs" paddingRight="md" paddingBottom="sm" paddingLeft="xxl">
        {filename && <span style={labelTextStyle}>Bookmark file:</span>}
        <span style={labelTextStyle}>📁</span>
        {filename ? <span style={{ ...labelTextStyle, ...linkStyle }} title={filePath} onClick={onBrowse}>{filename}</span>
            : <span style={{ ...labelTextStyle, ...placeholderStyle }} onClick={onBrowse}>No bookmarks file</span>}
        {filename && <IconButton size="sm" icon="close" title="Remove bookmarks file" onClick={onClear} />}
    </Panel>;
}

function TorProfileRow({ model, torPortValue }: { model: BrowserProfilesSectionModel; torPortValue: string | null }) {
    const torExeFilename = model.props.torExePath ? fpBasename(model.props.torExePath) : "";

    return <Panel direction="column" rounded="sm" background="dark">
        <Panel direction="row" align="center" gap="md" paddingX="md" paddingY="xs"><TorIcon style={{ width: 14, height: 14, flexShrink: 0 }} /><Panel flex><Text size="sm">Tor</Text></Panel></Panel>
        <Panel direction="row" align="center" gap="md" paddingTop="xs" paddingRight="md" paddingBottom="sm" paddingLeft="xxl">
            <span style={fieldLabelStyle}>tor.exe:</span>
            {torExeFilename ? <span style={{ ...labelTextStyle, ...linkStyle }} title={model.props.torExePath} onClick={() => void model.handleBrowseTorExe()}>{torExeFilename}</span>
                : <span style={{ ...labelTextStyle, ...placeholderStyle }} onClick={() => void model.handleBrowseTorExe()}>Not configured</span>}
            {torExeFilename && <IconButton size="sm" icon="close" title="Remove tor.exe path" onClick={model.handleClearTorExe} />}
        </Panel>
        <Panel direction="row" align="center" gap="md" paddingTop="xs" paddingRight="md" paddingBottom="sm" paddingLeft="xxl">
            <span style={fieldLabelStyle}>Port:</span><Input size="sm" width={56} type="text" value={torPortValue ?? String(model.props.torSocksPort)} onChange={model.setTorPortValue} onBlur={model.handleTorPortBlur} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} />
        </Panel>
        <BookmarksFileLine filePath={model.props.torBookmarksFile} onBrowse={() => void model.handleBrowseTorBookmarks()} onClear={model.handleClearTorBookmarks} />
    </Panel>;
}

export function BrowserProfilesSection() {
    const profiles = settings.use("browser-profiles");
    const defaultProfile = settings.use("browser-default-profile");
    const defaultBookmarksFile = settings.use("browser-default-bookmarks-file");
    const incognitoBookmarksFile = settings.use("browser-incognito-bookmarks-file");
    const torExePath = settings.use("tor.exe-path");
    const torSocksPort = settings.use("tor.socks-port");
    const torBookmarksFile = settings.use("tor.bookmarks-file");
    const model = useComponentModel({ profiles, defaultProfile, torExePath, torSocksPort, torBookmarksFile }, BrowserProfilesSectionModel, defaultBrowserProfilesSectionState);
    const { newName, newColor, clearedProfile, torPortValue } = model.state.use((state) => ({
        newName: state.newName,
        newColor: state.newColor,
        clearedProfile: state.clearedProfile,
        torPortValue: state.torPortValue,
    }));
    const getColorMenuItems = (profileName: string, currentColor: string): MenuItem[] => TAG_COLORS.map((tagColor) => ({
        label: tagColor.name, icon: createTagColorIcon(tagColor.hex), selected: currentColor === tagColor.hex,
        onClick: () => model.handleColorChange(profileName, tagColor.hex),
    }));

    return <>
        <Panel paddingBottom="lg"><Text bold size="sm">Browser Profiles</Text></Panel>
        <Panel paddingBottom="md"><Text color="light" size="xs">Isolated browsing sessions with separate cookies, storage, and cache</Text></Panel>
        <Panel direction="column" gap="sm" paddingBottom="lg">
            <Panel direction="column" rounded="sm" background="dark">
                <Panel direction="row" align="center" gap="md" paddingX="md" paddingY="xs">
                    <Dot size="md" color={DEFAULT_BROWSER_COLOR} bordered /><Panel flex><Text size="sm">Default</Text></Panel>
                    {defaultProfile === "" ? <span style={defaultBadgeStyle}>default</span> : <Button variant="ghost" size="sm" background="light" onClick={() => model.handleSetDefault("")}>set default</Button>}
                    {clearedProfile === "" && <Text color="success" size="xs">Cleared</Text>}
                    <Button variant="ghost" size="sm" background="light" onClick={() => void model.handleClearData("")}>clear data</Button>
                </Panel>
                <BookmarksFileLine filePath={defaultBookmarksFile} onBrowse={() => void model.handleBrowseDefaultBookmarks()} onClear={() => settings.set("browser-default-bookmarks-file", "")} />
            </Panel>
            {profiles.map((profile) => <Panel key={profile.name} direction="column" rounded="sm" background="dark">
                <Panel direction="row" align="center" gap="md" paddingX="md" paddingY="xs">
                    <WithMenu items={getColorMenuItems(profile.name, profile.color)}>{(setOpen) => <Dot size="md" color={profile.color} bordered title="Change color" onClick={(event) => setOpen(event.currentTarget)} />}</WithMenu>
                    <Panel flex><Text size="sm">{profile.name}</Text></Panel>
                    {defaultProfile === profile.name ? <span style={defaultBadgeStyle}>default</span> : <Button variant="ghost" size="sm" background="light" onClick={() => model.handleSetDefault(profile.name)}>set default</Button>}
                    {clearedProfile === profile.name && <Text color="success" size="xs">Cleared</Text>}
                    <Button variant="ghost" size="sm" background="light" onClick={() => void model.handleClearData(profile.name)}>clear data</Button>
                    <IconButton size="sm" icon="close" title="Remove profile" onClick={() => void model.handleRemoveProfile(profile.name)} />
                </Panel>
                <BookmarksFileLine filePath={profile.bookmarksFile || ""} onBrowse={() => void model.handleBrowseProfileBookmarks(profile.name)} onClear={() => model.handleClearProfileBookmarks(profile.name)} />
            </Panel>)}
            <Panel direction="column" rounded="sm" background="dark"><Panel direction="row" align="center" gap="md" paddingX="md" paddingY="xs"><IncognitoIcon style={{ width: 14, height: 14, flexShrink: 0 }} /><Panel flex><Text size="sm">Incognito</Text></Panel></Panel><BookmarksFileLine filePath={incognitoBookmarksFile} onBrowse={() => void model.handleBrowseIncognitoBookmarks()} onClear={() => settings.set("browser-incognito-bookmarks-file", "")} /></Panel>
            <TorProfileRow model={model} torPortValue={torPortValue} />
        </Panel>
        <Panel direction="column" gap="md"><Panel direction="row" align="center" gap="md"><Panel flex><Input size="sm" placeholder="Profile name" value={newName} onChange={model.setNewName} onKeyDown={model.handleKeyDown} /></Panel><Button variant="default" size="sm" background="light" disabled={!model.canAdd} onClick={model.handleAddProfile}>Add</Button></Panel><Text color="light" size="xs">Profile color:</Text><Panel direction="row" wrap gap="md">{TAG_COLORS.map((tagColor) => <Dot key={tagColor.hex} size="lg" color={tagColor.hex} selected={newColor === tagColor.hex} title={tagColor.name} onClick={() => model.setNewColor(tagColor.hex)} />)}</Panel></Panel>
    </>;
}
