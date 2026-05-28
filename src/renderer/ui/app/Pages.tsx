import styled from "@emotion/styled";
import { Panel, Splitter } from "../../uikit";
import { pagesModel } from "../../api/pages";
import { RenderEditor } from "./RenderEditor";
import { CompareEditor } from "../../editors/compare";
import { PageNavigator } from "../navigation/PageNavigator";
import { AppPageManager } from "../../components/page-manager/AppPageManager";
import type { PageModel } from "../../api/pages/PageModel";
import { Ornament } from "../../theme/Ornament";
import color from "../../theme/color";

const PageEditorContainer = styled.div(
    {
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        overflowY: "auto",
        minWidth: 100,
    },
    { label: "PageEditorContainer" },
);

const EmptyPageRoot = styled.div({
    flex: "1 1 auto",
    position: "relative",
    overflow: "hidden",
    minWidth: 100,
});

const OrnamentWrapper = styled.div({
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 300,
    height: 252,
    color: color.border.default,
    opacity: 0.5,
    pointerEvents: "none",
});

function NavigationWrapper({ page }: { page: PageModel }) {
    const hasSidebar = page.state.use((s) => s.hasSidebar);
    if (!hasSidebar) return null;
    return <NavigationContent page={page} />;
}

function NavigationContent({ page }: { page: PageModel }) {
    const navModel = page.ensurePageNavigatorModel();
    const { open, width } = navModel.state.use();
    if (!open) return null;

    return (
        <>
            <Panel
                name="page-navigator-container"
                direction="column"
                width={width}
                shrink={false}
                overflow="hidden"
                height="100%"
            >
                <PageNavigator page={page} />
            </Panel>
            <Splitter
                name="page-navigator-splitter"
                orientation="vertical"
                value={width}
                onChange={navModel.setWidth}
                side="before"
                min={120}
                border="after"
                background="default"
                hoverBackground="light"
            />
        </>
    );
}

/** Renders a single page's content (Navigator + Editor), or CompareEditor if in compare mode */
function PageContent({ pageId }: { pageId: string }) {
    // Subscribe to pagesModel.state so re-renders happen when compareGroups
    // changes.
    pagesModel.state.use();
    const page = pagesModel.query.findPage(pageId);
    if (!page) return null;

    page.state.use((s) => ({ mainEditorId: s.mainEditorId, version: s.version }));
    const editor = page.mainEditorInstance;

    const compareInfo = pagesModel.query.isInCompareMode(pageId);

    if (compareInfo.active) {
        // Render CompareEditor only on the LEFT side; right side renders null
        // (the left side's portal paints the diff editor).
        if (compareInfo.leftId === pageId && compareInfo.rightId) {
            const leftHost = pagesModel.query.getTextFileHost(compareInfo.leftId);
            const rightHost = pagesModel.query.getTextFileHost(compareInfo.rightId);
            if (leftHost && rightHost) {
                return (
                    <CompareEditor
                        model={leftHost}
                        groupedModel={rightHost}
                        leftPageId={compareInfo.leftId}
                    />
                );
            }
        }
        // Right side or missing host — render nothing.
        return null;
    }

    return (
        <>
            <NavigationWrapper page={page} />
            {editor ? (
                <PageEditorContainer key={page.id} className="scroll-container">
                    <RenderEditor model={editor} />
                </PageEditorContainer>
            ) : (
                <EmptyPageRoot key={page.id}>
                    <OrnamentWrapper>
                        <Ornament style={{ width: "100%", height: "100%" }} />
                    </OrnamentWrapper>
                </EmptyPageRoot>
            )}
        </>
    );
}

export function Pages() {
    const { pages, leftRight, compareGroups } = pagesModel.state.use();
    const activePage = pagesModel.activePage;
    const groupedPage = pagesModel.groupedPage;

    return (
        <AppPageManager
            pageIds={pages.map((p) => p.id)}
            activeId={activePage?.id ?? ""}
            groupedActiveId={groupedPage?.id}
            grouping={leftRight}
            compareModeIds={compareGroups}
            renderPage={(id) => <PageContent pageId={id} />}
        />
    );
}
