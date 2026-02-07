import { ReactNode, useMemo } from "react";
import styled from "@emotion/styled";
import { NoteItemEditModel } from "./NoteItemEditModel";
import { Button } from "../../../components/basic/Button";
import { RunAllIcon, RunIcon } from "../../../theme/icons";
import { SwitchButtons } from "../../../components/form/SwitchButtons";
import { editorRegistry } from "../../registry";
import { LanguageIcon } from "../../base/LanguageIcon";
import { WithPopupMenu } from "../../../components/overlay/WithPopupMenu";
import { MenuItem } from "../../../components/overlay/PopupMenu";
import { monacoLanguages } from "../../../core/utils/monaco-languages";
import { appSettings } from "../../../store";

// =============================================================================
// Styles
// =============================================================================

const ToolbarRoot = styled.div({
    display: "flex",
    alignItems: "center",
    gap: 4,
    flex: 1,
});

const EditorToolbarSlot = styled.div({
    display: "flex",
    alignItems: "center",
    gap: 4,
});

// =============================================================================
// Component
// =============================================================================

interface NoteItemToolbarProps {
    model: NoteItemEditModel;
    children?: ReactNode;
}

export function NoteItemToolbar({ model, children }: NoteItemToolbarProps) {
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

    // Language menu items
    const activeLanguages = appSettings.use("tab-recent-languages");
    const languageMenuItems = useMemo((): MenuItem[] => {
        const setActiveLanguage = (langId: string) => {
            const currentActive = appSettings.get("tab-recent-languages");
            const newActive = [
                langId,
                ...currentActive.filter((l) => l !== langId),
            ];
            appSettings.set("tab-recent-languages", newActive);
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

    // Build extras (hidden by default, shown on hover)
    const extras: ReactNode[] = [];

    // Run script buttons for JavaScript
    if (language === "javascript") {
        extras.push(
            <Button
                key="run-script"
                type="icon"
                size="small"
                title={hasSelection ? "Run Selected Script" : "Run Script"}
                onClick={() => model.runScript()}
            >
                <RunIcon />
            </Button>
        );
        if (hasSelection) {
            extras.push(
                <Button
                    key="run-all-script"
                    type="icon"
                    size="small"
                    title="Run All Script"
                    onClick={() => model.runScript(true)}
                >
                    <RunAllIcon />
                </Button>
            );
        }
    }

    // Editor toolbar slots (for custom editors to inject content)
    if (editor && editor !== "monaco") {
        extras.unshift(
            <EditorToolbarSlot
                key="editor-toolbar-first"
                ref={model.setEditorToolbarRefFirst}
            />
        );
        extras.push(
            <EditorToolbarSlot
                key="editor-toolbar-last"
                ref={model.setEditorToolbarRefLast}
            />
        );
    }

    // Editor switch buttons
    if (switchOptions.options.length > 0) {
        extras.push(
            <SwitchButtons
                key="editor-switch"
                options={switchOptions.options}
                value={editor || "monaco"}
                onChange={model.changeEditor}
                getLabel={switchOptions.getOptionLabel}
                style={{ margin: 1 }}
            />
        );
    }

    return (
        <ToolbarRoot>
            {/* Language selector - always visible */}
            <WithPopupMenu items={languageMenuItems}>
                {(setOpen) => (
                    <Button
                        size="small"
                        type="icon"
                        onClick={(e) => setOpen(e.currentTarget)}
                        title={language}
                    >
                        <LanguageIcon language={language} />
                    </Button>
                )}
            </WithPopupMenu>

            {/* Title or other content - takes remaining space */}
            {children}

            {/* Editor extras - hidden by default, shown on hover via parent CSS */}
            {extras.length > 0 && (
                <div className="editor-extras">{extras}</div>
            )}
        </ToolbarRoot>
    );
}
