import styled from "@emotion/styled";
import { TextFileModel } from "../text/TextPageModel";
import color from "../../theme/color";

const NotebookEditorRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 16,
    color: color.text.light,
    fontSize: 14,
    "& .title": {
        fontSize: 24,
        color: color.text.default,
    },
    "& .subtitle": {
        color: color.text.light,
    },
});

interface NotebookEditorProps {
    model: TextFileModel;
}

export function NotebookEditor({ model }: NotebookEditorProps) {
    const filePath = model.state.use((s) => s.filePath);

    return (
        <NotebookEditorRoot>
            <div className="title">Notebook Editor</div>
            <div className="subtitle">
                {filePath ? `File: ${filePath}` : "New notebook"}
            </div>
            <div className="subtitle">Coming soon...</div>
        </NotebookEditorRoot>
    );
}
