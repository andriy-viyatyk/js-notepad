import { useEffect } from "react";
import { api } from "../../../ipc/renderer/api";
import { TModel } from "../../common/classes/model";
import { TGlobalState } from "../../common/classes/state";
import { getLanguageByExtension } from "../../model/language-mapping";
import { LanguageIcon } from "../shared/LanguageIcon";
import styled from "@emotion/styled";
const path = require("path");

const defaultFileIconsState = {
    iconCache: new Map<string, string>(),
}

type FileIconsState = typeof defaultFileIconsState;

class FileIconsModel extends TModel<FileIconsState> {
    constructor() {
        super(new TGlobalState(defaultFileIconsState));
    }

    prepareFileIcon = async (filePath: string) => {
        const ext = path.extname(filePath).toLowerCase();
        if (this.state.get().iconCache.has(ext)) {
            return;
        }

        const iconDataUrl = await api.getFileIcon(filePath);
        const newMap = new Map(this.state.get().iconCache);
        newMap.set(ext, iconDataUrl);
        this.state.update(s => {
            s.iconCache = newMap;
        });
    }
}

const fileIconsModel = new FileIconsModel();

interface FileIconProps {
    path: string;
    width?: number;
    height?: number;
}

export function FileIcon(props: FileIconProps) {
    useEffect(() => {
        fileIconsModel.prepareFileIcon(props.path);
    }, [props.path]);

    const iconCache = fileIconsModel.state.use(s => s.iconCache);
    const ext = path.extname(props.path).toLowerCase();
    const language = getLanguageByExtension(ext);

    if (language) {
        return <LanguageIcon language={language.id} />;
    }

    const iconDataUrl = iconCache.get(ext);
    if (iconDataUrl) {
        const { width = 14, height = 14 } = props;
        return <img src={iconDataUrl} style={{ width, height }} />;
    }

    return <LanguageIcon ext={ext} />;
}

const FolderIconRoot = styled("span")({
    fontSize: 13,
    paddingBottom: 3,
});

export function FolderIcon() {
    return <FolderIconRoot>📁</FolderIconRoot>;
}