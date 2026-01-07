const path = require("path");
import styled from "@emotion/styled";
import { List } from "../../controls/List";
import color from "../../theme/color";
import { LanguageIcon } from "../shared/LanguageIcon";

const FileListRoot = styled(List)({
    "& .list-item": {
        boxSizing: "border-box",
        borderRadius: 4,
        border: `1px solid transparent`,
        userSelect: "none",
        "& svg": {
            width: 16,
            height: 16,
        },
        "&:hover": {
            backgroundColor: color.background.dark,
            borderColor: color.border.default,
        },
        "&.selected": {
            backgroundColor: color.background.default,
            borderColor: color.border.default,
        },
    },
});

export interface FileListItem {
    filePath: string;
    title: string;
}

const getFileLabel = (item: FileListItem) => item.title;
const getFileIcon = (item: FileListItem) => {
    const extension = path.extname(item.filePath);
    return <LanguageIcon ext={extension} />;
};
const getTooltip = (item: FileListItem) => item.filePath;

interface FileListProps {
    items: FileListItem[];
    onClick: (item: FileListItem) => void;
}

export function FileList(props: FileListProps) {
    return (
        <FileListRoot
            options={props.items}
            getLabel={getFileLabel}
            getIcon={getFileIcon}
            selectedIcon={<span />}
            rowHeight={28}
            onClick={props.onClick}
            itemMarginY={1}
            getTooltip={getTooltip}
        />
    );
}