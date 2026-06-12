import { useCallback } from "react";
import { FileSearch } from "../../components/file-search";
import { app } from "../../api/app";
import { createLinkData } from "../../../shared/link-data";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../ui/secondary-views/SideBarPanelHeader";
import type { ExplorerEditor } from "./ExplorerEditorModel";
import { IconButton } from "../../uikit/IconButton";
import { Text } from "../../uikit/Text";
import { CloseIcon } from "../../theme/icons";
import { fpBasename } from "../../core/utils/file-path";

export default function SearchSecondaryView({ model: rawModel, headerRef, icon }: SecondaryViewProps) {
    const model = rawModel as ExplorerEditor;
    const rootPath = model.rootPath;
    const pageId = model.page?.id ?? "";

    const searchFolder = model.searchState?.searchFolder || rootPath;
    const searchFolderName = fpBasename(searchFolder);

    const handleSearchResultClick = useCallback((filePath: string, lineNumber?: number) => {
        model.setSelectedHref(filePath);
        app.events.openRawLink.sendAsync(createLinkData(filePath, {
            pageId,
            ...(lineNumber ? { revealLine: lineNumber, highlightText: model.searchState?.query } : undefined),
        }));
    }, [pageId, model]);

    return (
        <>
            <SideBarPanelHeader
                headerRef={headerRef}
                icon={icon}
                title={
                    <Text truncate color="light" size="md" title={searchFolder}>
                        Search [{searchFolderName}]
                    </Text>
                }
                actions={
                    <IconButton
                        name="search-secondary-close"
                        size="sm"
                        title="Close Search"
                        icon={<CloseIcon />}
                        onClick={(e) => { e.stopPropagation(); model.closeSearch(); }}
                    />
                }
            />
            <FileSearch
                folder={rootPath}
                state={model.searchState}
                onStateChange={model.setSearchState}
                onResultClick={handleSearchResultClick}
            />
        </>
    );
}
