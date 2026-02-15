import { useCallback, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { NavPanelModel } from "./nav-panel-store";
import { FileExplorer, FileExplorerRef } from "../../components/file-explorer";
import { MenuItem } from "../../components/overlay/PopupMenu";
import { Button } from "../../components/basic/Button";
import { ArrowUpIcon, CloseIcon, CollapseAllIcon, RefreshIcon } from "../../theme/icons";
import color from "../../theme/color";
import { pagesModel } from "../../store";

const path = require("path");

const NavigationPanelRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    backgroundColor: color.background.default,

    "& .nav-header": {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        padding: "4px 4px 4px 4px",
        borderBottom: `1px solid ${color.border.light}`,
        flexShrink: 0,
    },

    "& .nav-header-title": {
        flex: "1 1 auto",
        fontSize: 12,
        fontWeight: 600,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: color.text.light,
    },
});

interface NavigationPanelProps {
    model: NavPanelModel;
    pageId: string;
}

export function NavigationPanel({ model, pageId }: NavigationPanelProps) {
    const { rootFilePath, currentFilePath } = model.state.use();
    const fileExplorerRef = useRef<FileExplorerRef>(null);

    const parentPath = path.dirname(rootFilePath);
    const canNavigateUp = parentPath !== rootFilePath;

    const handleFileClick = useCallback((filePath: string) => {
        if (filePath.toLowerCase() === currentFilePath?.toLowerCase()) return;
        // Save scroll position before navigation triggers remount
        model.scrollTop = fileExplorerRef.current?.getScrollTop() ?? 0;
        pagesModel.navigatePageTo(pageId, filePath);
    }, [pageId, currentFilePath, model]);

    // Restore scroll position after remount (navigation transfers NavPanelModel)
    useEffect(() => {
        if (model.scrollTop > 0) {
            const saved = model.scrollTop;
            model.scrollTop = 0;
            // Tree rebuild is deferred via setTimeout(0) in TreeViewModel.setProps,
            // so we retry until the container is scrollable and scroll takes effect.
            const tryRestore = (retries: number) => {
                fileExplorerRef.current?.setScrollTop(saved);
                const actual = fileExplorerRef.current?.getScrollTop() ?? 0;
                if (actual === 0 && retries > 0) {
                    requestAnimationFrame(() => tryRestore(retries - 1));
                }
            };
            requestAnimationFrame(() => tryRestore(10));
        }
    }, []);

    const handleRefresh = useCallback(() => {
        fileExplorerRef.current?.refresh();
    }, []);

    const handleCollapseAll = useCallback(() => {
        fileExplorerRef.current?.collapseAll();
    }, []);

    const handleNavigateUp = useCallback(() => {
        if (!canNavigateUp) return;
        const currentState = fileExplorerRef.current?.getState();
        const expandedPaths = [...(currentState?.expandedPaths ?? [])];
        // Add old root to expanded paths so it stays expanded as a subfolder
        const rootLower = rootFilePath.toLowerCase();
        if (!expandedPaths.some(p => p.toLowerCase() === rootLower)) {
            expandedPaths.push(rootFilePath);
        }
        model.fileExplorerState = { expandedPaths };
        model.state.update((s) => {
            s.rootFilePath = parentPath;
        });
    }, [canNavigateUp, rootFilePath, parentPath, model]);

    const handleMakeRoot = useCallback((folderPath: string) => {
        if (folderPath.toLowerCase() === rootFilePath.toLowerCase()) return;
        const currentState = fileExplorerRef.current?.getState();
        const folderLower = folderPath.toLowerCase() + path.sep;
        const expandedPaths = (currentState?.expandedPaths ?? [])
            .filter(p => p.toLowerCase().startsWith(folderLower));
        model.fileExplorerState = { expandedPaths };
        model.state.update((s) => {
            s.rootFilePath = folderPath;
        });
    }, [rootFilePath, model]);

    const getExtraMenuItems = useCallback((filePath: string, isFolder: boolean): MenuItem[] => {
        if (!isFolder || filePath.toLowerCase() === rootFilePath.toLowerCase()) return [];
        return [{
            startGroup: true,
            label: "Make Root",
            onClick: () => handleMakeRoot(filePath),
        }];
    }, [rootFilePath, handleMakeRoot]);

    return (
        <NavigationPanelRoot>
            <div className="nav-header">
                <Button
                    type="icon"
                    size="small"
                    title={canNavigateUp ? `Up to ${path.basename(parentPath)}` : "Already at root"}
                    onClick={handleNavigateUp}
                    disabled={!canNavigateUp}
                >
                    <ArrowUpIcon width={14} height={14} />
                </Button>
                <span className="nav-header-title" title={rootFilePath}>
                    {path.basename(rootFilePath)}
                </span>
                <Button
                    type="icon"
                    size="small"
                    title="Collapse All"
                    onClick={handleCollapseAll}
                >
                    <CollapseAllIcon width={14} height={14} />
                </Button>
                <Button
                    type="icon"
                    size="small"
                    title="Refresh"
                    onClick={handleRefresh}
                >
                    <RefreshIcon width={14} height={14} />
                </Button>
                <Button
                    type="icon"
                    size="small"
                    title="Close Panel"
                    onClick={model.close}
                >
                    <CloseIcon width={14} height={14} />
                </Button>
            </div>
            <FileExplorer
                ref={fileExplorerRef}
                key={rootFilePath}
                id={`nav-${pageId}`}
                rootPath={rootFilePath}
                selectedFilePath={currentFilePath}
                onFileClick={handleFileClick}
                onFolderDoubleClick={handleMakeRoot}
                enableFileOperations
                showOpenInNewTab
                initialState={model.fileExplorerState}
                onStateChange={model.setFileExplorerState}
                getExtraMenuItems={getExtraMenuItems}
            />
        </NavigationPanelRoot>
    );
}
