import styled from "@emotion/styled";
import { EditorPageModule } from "../custom-editors/types";
import { PageModel } from "../model/page-model";
import { useEffect, useState } from "react";
import { CircularProgress } from "../controls/CircularProgress";

const ProgressRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
});

export interface AsyncEditorProps {
    getEditorModule: () => Promise<EditorPageModule>;
    model: PageModel;
}

export function AsyncEditor({ getEditorModule, model }: AsyncEditorProps) {
    const [EditorModule, setEditorModule] = useState<EditorPageModule | null>(
        null
    );

    useEffect(() => {
        getEditorModule().then(setEditorModule);
    }, [getEditorModule]);

    if (!EditorModule) {
        return (
            <ProgressRoot>
                <CircularProgress size={16}/>
            </ProgressRoot>
        );
    }

    return <EditorModule.Editor model={model} />;
}

export type AsyncEditorComponent = typeof AsyncEditor;