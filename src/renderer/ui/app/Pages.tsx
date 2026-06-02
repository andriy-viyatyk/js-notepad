import styled from "@emotion/styled";
import { pagesModel } from "../../api/pages";
import { RenderEditor } from "./RenderEditor";
import { CompareEditor } from "../../editors/compare";
import { SecondaryViews } from "../secondary-views/SecondaryViews";
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

function SecondaryViewsWrapper({ page }: { page: PageModel }) {
    const hasSidebar = page.state.use((s) => s.hasSidebar);
    if (!hasSidebar) return null;
    return <SecondaryViewsContent page={page} />;
}

function SecondaryViewsContent({ page }: { page: PageModel }) {
    const nav = page.ensureSecondaryViewsModel();
    const state = nav.state.use();            // open/width/activePanel
    page.state.use((s) => s.version);         // re-derive views on panel attach/detach
    return (
        <SecondaryViews
            views={page.panelEditors}
            state={state}
            setState={page.setSecondaryViewsState}
        />
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
            <SecondaryViewsWrapper page={page} />
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
