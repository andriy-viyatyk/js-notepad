import { FileTypeIcon } from "./LanguageIcon";
import { fpBasename } from "../../core/utils/file-path";

interface FileIconProps {
    path: string;
    width?: number;
    height?: number;
}

export function FileIcon(props: FileIconProps) {
    const fileName = fpBasename(props.path);
    return <FileTypeIcon fileName={fileName} width={props.width} height={props.height} />;
}

export function FolderIcon() {
    return <span style={{ fontSize: 13, paddingBottom: 3 }}>📁</span>;
}
