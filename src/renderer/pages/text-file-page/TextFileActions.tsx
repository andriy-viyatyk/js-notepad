import { ReactNode, useMemo } from "react";
import { TextFileModel } from "./TextFilePage.model";
import { Button } from "../../controls/Button";
import { RunAllIcon, RunIcon } from "../../theme/icons";
import { SwitchButtons } from "../../controls/SwitchButtons";
import { PageEditor } from "../../../shared/types";
import { FlexSpace } from "../../controls/Elements";
import styled from "@emotion/styled";
import { getLanguageSwitchOptions } from "../../model/resolve-editor";

const EditorToolbarRoot = styled.div({
    display: "flex",
    alignItems: "center",
    gap: 4,
});

interface TextFileActionsProps {
    model: TextFileModel;
    setEditorToolbarRefFirst?: (ref: HTMLDivElement | null) => void;
    setEditorToolbarRefLast?: (ref: HTMLDivElement | null) => void;
}

export function TextFileActions({ model, setEditorToolbarRefFirst, setEditorToolbarRefLast }: TextFileActionsProps) {
    const actions: ReactNode[] = [];
    const { hasSelection } = model.editor.state.use((s) => ({
        hasSelection: s.hasSelection,
    }));

    const { language, editor } = model.state.use((s) => ({
        language: s.language,
        editor: s.editor,
    }));

    const switchOptions = useMemo(() => {
        return getLanguageSwitchOptions(language || "plaintext");
    }, [language]);

    if (language === "javascript") {
        actions.push(
            <Button
                key="run-script"
                type="icon"
                size="small"
                title={
                    hasSelection
                        ? "Run Selected Script (F5)"
                        : "Run Script (F5)"
                }
                onClick={() => model.runScript()}
            >
                <RunIcon />
            </Button>
        );
        if (hasSelection) {
            actions.push(
                <Button
                    key="run-all_script"
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

    actions.push(<FlexSpace key="flex-space" />);

    if (editor && editor !== "monaco") {
        actions.unshift(
            <EditorToolbarRoot key="editor-toolbar-first" ref={setEditorToolbarRefFirst} />
        );
        actions.push(
            <EditorToolbarRoot key="editor-toolbar-last" ref={setEditorToolbarRefLast} />,
        )
    }

    const lastItems: ReactNode[] = [];
    if (switchOptions.options.length) {
        lastItems.push(
            <SwitchButtons
                key="json-editor-switch"
                options={switchOptions.options}
                value={editor || "monaco"}
                onChange={model.changeEditor}
                getLabel={switchOptions.getOptionLabel}
                style={{ margin: 1 }}
            />
        );
    }

    if (lastItems.length > 0) {
        actions.push(
            ...lastItems
        )
    }

    return <>{actions}</>;
}
