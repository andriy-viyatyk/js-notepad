import { TComponentState } from "../../core/state/state";
import { HtmlEditor, defaultHtmlEditorState } from "./HtmlEditor";
import { HtmlBodyView } from "./HtmlBodyView";
import { TextChrome } from "../base/TextChrome";
import { IconButton, WithMenu } from "../../uikit";
import { mountVanilla } from "../../uikit/shared/mount";
import type { MenuItem } from "../../uikit";
import { CopyIcon, SaveIcon, MoreVertIcon, OpenFileIcon } from "../../theme/icons";
import { DrawIcon } from "../../theme/language-icons";
import { savePngViaDialog } from "../shared/image-export";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

/** Delay before a menu-triggered capture so `WithMenu` closes and repaints first —
 *  otherwise the still-open menu is included in the screenshot. */
const MENU_CLOSE_DELAY_MS = 250;

function HtmlToolbarBits({ model }: { model: HtmlEditor }) {
    const capturing = model.state.use((s) => s.capturing ?? false);

    // Run a menu action only after the menu has visually closed.
    const afterMenuClose = (run: () => void) => {
        setTimeout(run, MENU_CLOSE_DELAY_MS);
    };

    const menuItems: MenuItem[] = [
        { label: "Save as PNG", icon: <SaveIcon />, onClick: () => afterMenuClose(() => void savePngViaDialog(model)) },
        { label: "Open in Image View", icon: <OpenFileIcon />, onClick: () => afterMenuClose(() => void model.openInImageView()) },
        { label: "Edit Image", icon: <DrawIcon />, onClick: () => afterMenuClose(() => void model.editImage()) },
    ];

    return (
        <>
            <IconButton
                name="html-copy"
                size="sm"
                title="Copy image to clipboard"
                icon={<CopyIcon />}
                disabled={capturing}
                onClick={() => void model.copyImageToClipboard()}
            />
            <WithMenu name="html-image-menu" items={menuItems}>
                {(setOpen) => (
                    <IconButton
                        name="html-more"
                        size="sm"
                        title="More image actions"
                        icon={<MoreVertIcon />}
                        disabled={capturing}
                        onClick={(e) => setOpen(e.currentTarget)}
                    />
                )}
            </WithMenu>
        </>
    );
}

function HtmlEditorView({ model }: { model: EditorModel }) {
    const html = model as HtmlEditor;
    return (
        <TextChrome model={model} rightToolbarContributions={<HtmlToolbarBits model={html} />}>
            {mountVanilla(HtmlBodyView, { model: html })}
        </TextChrome>
    );
}

export const htmlModule: EditorModule = {
    createEditor: () =>
        new HtmlEditor(new TComponentState({ ...defaultHtmlEditorState })),
    Component: HtmlEditorView,
    BodyView: HtmlBodyView,
};

export { HtmlEditor, defaultHtmlEditorState };
export type { HtmlEditorState, HtmlQueueEvent } from "./HtmlEditor";
