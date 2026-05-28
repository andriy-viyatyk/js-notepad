import { ReactNode, useMemo } from "react";
import { NoteItemEditModel } from "./NoteItemEditModel";
import { IconButton } from "../../../uikit/IconButton";
import { Panel } from "../../../uikit/Panel";
import { SegmentedControl, type ISegment } from "../../../uikit/SegmentedControl";
import { WithMenu, type MenuItem } from "../../../uikit/Menu";
import { RunAllIcon, RunIcon } from "../../../theme/icons";
import { editorRegistry } from "../../base/editorRegistry";
import { LanguageIcon } from "../../../components/icons/LanguageIcon";
import { monacoLanguages } from "../../../core/utils/monaco-languages";
import { settings } from "../../../api/settings";
import { isScriptLanguage } from "../../../scripting/transpile";
import { EditorView } from "../../../../shared/types";

// =============================================================================
// Component
// =============================================================================

interface NoteItemToolbarProps {
    model: NoteItemEditModel;
    children?: ReactNode;
    /** When false, the right-side extras (run buttons, segmented control, editor
     *  toolbar slots) fade to opacity 0. Default: true. */
    extrasVisible?: boolean;
}

const slotStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
};

export function NoteItemToolbar({ model, children, extrasVisible = true }: NoteItemToolbarProps) {
    const { hasSelection } = model.editor.state.use((s) => ({
        hasSelection: s.hasSelection,
    }));

    const { language, editor } = model.state.use((s) => ({
        language: s.language,
        editor: s.editor,
    }));

    // Get switch options for current language
    const switchOptions = useMemo(() => {
        return editorRegistry.getSwitchOptions(language || "plaintext", undefined);
    }, [language]);

    // Pre-shape segments for SegmentedControl (no getLabel prop in UIKit per Rule 3)
    const segments = useMemo<ISegment[]>(
        () =>
            switchOptions.options.map((opt) => ({
                value: opt,
                label: switchOptions.getOptionLabel(opt),
            })),
        [switchOptions],
    );

    // Language menu items
    const activeLanguages = settings.use("tab-recent-languages");
    const languageMenuItems = useMemo((): MenuItem[] => {
        const setActiveLanguage = (langId: string) => {
            const currentActive = settings.get("tab-recent-languages");
            const newActive = [
                langId,
                ...currentActive.filter((l) => l !== langId),
            ];
            settings.set("tab-recent-languages", newActive);
        };

        const menuItems: MenuItem[] = monacoLanguages
            .map((lang) => ({
                id: lang.id,
                label: lang.aliases[0] || lang.id,
                icon: <LanguageIcon language={lang.id} />,
                onClick: () => {
                    model.changeLanguage(lang.id);
                    setActiveLanguage(lang.id);
                },
                selected: language === lang.id,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));

        const firstItem = menuItems.find((item) => item.id === "plaintext");
        const activeItems = menuItems.filter(
            (item) =>
                item.id !== "plaintext" && activeLanguages.includes(item.id)
        );
        activeItems.sort((a, b) => {
            return (
                activeLanguages.indexOf(a.id) - activeLanguages.indexOf(b.id)
            );
        });
        const inactiveItems = menuItems.filter(
            (item) =>
                item.id !== "plaintext" && !activeLanguages.includes(item.id)
        );

        return [
            ...(firstItem ? [firstItem] : []),
            ...activeItems,
            ...inactiveItems,
        ];
    }, [language, activeLanguages, model]);

    // Build extras (hidden by default, shown when extrasVisible)
    const extras: ReactNode[] = [];

    // Run script buttons for JavaScript/TypeScript
    if (isScriptLanguage(language)) {
        extras.push(
            <IconButton
                key="run-script"
                size="sm"
                icon={<RunIcon />}
                title={hasSelection ? "Run Selected Script" : "Run Script"}
                onClick={() => model.runScript()}
            />
        );
        if (hasSelection) {
            extras.push(
                <IconButton
                    key="run-all-script"
                    size="sm"
                    icon={<RunAllIcon />}
                    title="Run All Script"
                    onClick={() => model.runScript(true)}
                />
            );
        }
    }

    // Editor toolbar slots (for custom editors to inject content)
    if (editor && editor !== "monaco") {
        extras.unshift(
            <div
                key="editor-toolbar-first"
                ref={model.setEditorToolbarRefFirst}
                style={slotStyle}
            />
        );
        extras.push(
            <div
                key="editor-toolbar-last"
                ref={model.setEditorToolbarRefLast}
                style={slotStyle}
            />
        );
    }

    // Editor switch buttons
    if (segments.length > 0) {
        extras.push(
            <SegmentedControl
                key="editor-switch"
                items={segments}
                value={editor || "monaco"}
                onChange={(v) => model.changeEditor(v as EditorView)}
                size="sm"
            />
        );
    }

    return (
        <Panel direction="row" align="center" gap="sm" flex={1}>
            {/* Language selector — always visible */}
            <WithMenu items={languageMenuItems}>
                {(setOpen) => (
                    <IconButton
                        size="sm"
                        icon={<LanguageIcon language={language} />}
                        title={language}
                        onClick={(e) => setOpen(e.currentTarget)}
                    />
                )}
            </WithMenu>

            {/* Title or other content — takes remaining space */}
            {children}

            {/* Editor extras — hidden by default, fade in when `extrasVisible` */}
            {extras.length > 0 && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        opacity: extrasVisible ? 1 : 0,
                        transition: "opacity 0.5s ease",
                    }}
                >
                    {extras}
                </div>
            )}
        </Panel>
    );
}
