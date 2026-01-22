import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import styled from "@emotion/styled";
import { TextFileModel } from "../../pages/text-file-page/TextFilePage.model";
import color from "../../theme/color";
import { CheckedIcon, UncheckedIcon } from "../../theme/icons";
import { useState } from "react";
import { Minimap } from "../../controls/Minimap";

const MdViewRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "row",
    overflow: "hidden",
    "& .md-scroll-container": {
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        padding: "0 16px",
        overflowY: "auto",
        overflowX: "hidden",
        fontFamily: "Arial",
        fontSize: 15,
        "&::-webkit-scrollbar": {
            display: "none",
        },
    },
    "& > *": {
        maxWidth: "100%",
        wordWrap: "break-word",
        overflowWrap: "break-word",
    },
    "& pre": {
        maxWidth: "100%",
        whiteSpace: "pre-wrap",
        wordWrap: "break-word",
        padding: "8px 16px",
        backgroundColor: color.background.light,
        borderRadius: 4,
        width: "fit-content",
    },
    "& code": {
        display: "inline-block",
        fontFamily: "monospace",
        backgroundColor: color.background.light,
        padding: "2px 4px",
        borderRadius: 4,
    },
    "& img": {
        maxWidth: "100%",
        height: "auto",
    },
    "& a": {
        color: color.misc.blue,
    },
    "& h1, & h2": {
        borderBottom: `1px solid ${color.border.default}`,
        marginBlockStart: 0,
        marginBlockEnd: 0,
        paddingBlockStart: "0.67em",
        paddingBlockEnd: "0.3em",
    },
    "& h3, & h4, & h5, & h6": {
        marginBlockStart: 0,
        marginBlockEnd: 0,
        paddingBlockStart: "0.67em",
        paddingBlockEnd: "0.3em",
    },
    "& li": {
        marginBlockStart: 4,
        marginBlockEnd: 4,
        lineHeight: 1.4,
    },
    "& table": {
        borderCollapse: "collapse",
        width: "100%",
        marginTop: "1em",
        marginBottom: "1em",
    },
    "& th, & td": {
        border: `1px solid ${color.border.default}`,
        padding: "8px 12px",
        textAlign: "left",
    },
    "& th": {
        backgroundColor: color.background.light,
        fontWeight: "bold",
    },
    "& blockquote": {
        borderLeft: `4px solid ${color.border.default}`,
        color: color.text.light,
        paddingLeft: 16,
    },
    "& b, & strong": {
        color: color.text.strong,
    },
    "& .task-list-item": {
        display: "flex",
        alignItems: "center",
        "& svg": {
            flexShrink: 0,
            marginRight: 6,
        },
    },
    "& hr": {
        border: "none",
        borderBottom: `1px solid ${color.border.default}`,
        width: "100%",
        marginBlockStart: "0.8em",
        marginBlockEnd: "0.8em",
    },
    "& sup": {
        marginLeft: 3,
    },
    "& p": {
        lineHeight: 1.4,
        marginBottom: "1.25rem",
    },
});

const components: Components = {
    input: ({ node, ...props }) => {
        if (props.type === "checkbox") {
            return props.checked ? (
                <CheckedIcon width={14} height={14} />
            ) : (
                <UncheckedIcon width={14} height={14} />
            );
        }
        return <input {...props} />;
    },
};

export interface MdViewProps {
    model: TextFileModel;
}

export function MdView({ model }: MdViewProps) {
    const content = model.state.use((s) => s.content);
    const [container, setContainer] = useState<HTMLDivElement | null>(null);

    return (
        <MdViewRoot>
            <div className="md-scroll-container" ref={setContainer}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={components}
                >
                    {content}
                </ReactMarkdown>
            </div>
            <Minimap scrollContainer={container} className="md-minimap" />
        </MdViewRoot>
    );
}

const moduleExport = {
    Editor: MdView,
};

export default moduleExport;
