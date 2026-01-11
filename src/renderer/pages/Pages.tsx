import styled from "@emotion/styled";
import clsx from "clsx";
import {
    CSSProperties,
    useCallback,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    createHtmlPortalNode,
    InPortal,
    OutPortal,
} from "react-reverse-portal";
import { Spliter } from "../controls/Spliter";
import { PageModel } from "../model/page-model";
import { pagesModel } from "../model/pages-model";
import color from "../theme/color";
import { RenderEditor } from "./RenderEditor";

const SinglePageRoot = styled.div(
    {
        flex: "1 1 auto",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
        "&:not(.isActive)": {
            display: "none",
        },
    },
    { label: "SinglePageRoot" }
);

const GroupedPagesRoot = styled.div(
    {
        display: "flex",
        flexDirection: "row",
        flex: "1 1 auto",
        overflow: "hidden",
        "&:not(.isActive)": {
            display: "none",
        },
        "& .page-container": {
            display: "flex",
            flexDirection: "column",
            position: "relative",
            overflow: "hidden",
            width: "50%",
        },
        "& .page-spliter": {
            backgroundColor: color.background.dark,
            width: 8,
            "&:hover": {
                backgroundColor: color.background.light,
            },
        },
    },
    { label: "GroupedPagesRoot" }
);

function RenderGroupedPages({
    model,
    isActive,
    portalNode,
    groupedPortalNode,
}: {
    model: PageModel;
    isActive: boolean;
    portalNode: ReturnType<typeof createHtmlPortalNode>;
    groupedPortalNode: ReturnType<typeof createHtmlPortalNode> | null;
}) {
    const [leftWidth, setLeftWidth] = useState<CSSProperties["width"]>("50%");
    const widthK = useRef<number>(0.5);
    const containerRef = useRef<HTMLDivElement>(null);
    const leftRef = useRef<HTMLDivElement>(null);

    const setLeftRef = useCallback((el: HTMLDivElement | null) => {
        leftRef.current = el;
        if (leftRef.current) {
            setLeftWidth(leftRef.current.clientWidth);
        }
    }, []);

    const setContainerRef = useCallback((el: HTMLDivElement | null) => {
        containerRef.current = el;

        const objserver = new ResizeObserver(() => {
            if (containerRef.current) {
                const newWidth =
                    (containerRef.current.clientWidth - 8) * widthK.current;
                setLeftWidth(newWidth);
            }
        });

        if (containerRef.current) {
            const lWidth = (containerRef.current.clientWidth - 8) / 2;
            setLeftWidth(lWidth);
            objserver.observe(containerRef.current);
        }

        return () => {
            objserver.disconnect();
        };
    }, []);

    const resizeWidth = useCallback((width: number) => {
        setLeftWidth(width);
        if (containerRef.current) {
            widthK.current = width / (containerRef.current.clientWidth - 8);
        }
    }, []);

    const splitterDubleClick = useCallback(() => {
        if (containerRef.current) {
            const newWidth = (containerRef.current.clientWidth - 8) / 2;
            setLeftWidth(newWidth);
            widthK.current = 0.5;
        }
    }, []);

    const groupedModel = pagesModel.getGroupedPage(model.id);
    if (!groupedModel) {
        return (
            <SinglePageRoot
                id={`editor-container-${model.id}`}
                className={clsx({ isActive })}
            >
                <OutPortal node={portalNode} />
            </SinglePageRoot>
        );
    }

    return (
        <GroupedPagesRoot className={clsx({ isActive })} ref={setContainerRef}>
            <div
                id={`editor-container-${model.id}`}
                ref={setLeftRef}
                className="page-container"
                style={{
                    width: leftWidth,
                    minWidth: 100,
                    maxWidth: containerRef.current
                        ? containerRef.current.clientWidth - 100
                        : undefined,
                    flexShrink: 0,
                }}
            >
                <OutPortal node={portalNode} />
            </div>
            <Spliter
                type="vertical"
                className="page-spliter"
                initialWidth={typeof leftWidth === "number" ? leftWidth : 200}
                onChangeWidth={resizeWidth}
                onDoubleClick={splitterDubleClick}
            />
            <div
                id={`editor-container-${groupedModel.id}`}
                className="page-container"
                style={{ flex: "1 1 auto" }}
            >
                {groupedPortalNode && <OutPortal node={groupedPortalNode} />}
            </div>
        </GroupedPagesRoot>
    );
}

export function Pages() {
    const { pages: pgs, rightLeft } = pagesModel.state.use();
    const activePage = pagesModel.activePage;
    const groupedPage = pagesModel.groupedPage;

    const portalNodes = useMemo(() => {
        const nodes = new Map<
            string,
            ReturnType<typeof createHtmlPortalNode>
        >();
        pgs?.forEach((page) => {
            nodes.set(page.id, createHtmlPortalNode({
                attributes: {
                    id: `editor-portal-node-${page.id}`,
                    style: "flex:1 1 auto; height:100%; display:flex; flex-direction:column; overflow:hidden;",
                }
            }));
        });
        return nodes;
    }, [pgs?.map((p) => p.id).join(",")]);

    const pagesToRender = useMemo(() => {
        return pgs?.filter((p) => !rightLeft.has(p.id));
    }, [pgs, rightLeft]);

    const layout = pagesToRender ? (
        <>
            {pagesToRender.map((page) => {
                const groupedModel = pagesModel.getGroupedPage(page.id);
                const portalNode = portalNodes.get(page.id);
                const groupedPortalNode = groupedModel
                    ? portalNodes.get(groupedModel.id)
                    : null;

                if (!portalNode) return null;

                return (
                    <RenderGroupedPages
                        key={`group-page-${page.id}`}
                        model={page}
                        isActive={page === activePage || page === groupedPage}
                        portalNode={portalNode}
                        groupedPortalNode={groupedPortalNode || null}
                    />
                );
            })}
        </>
    ) : null;

    const allEditors = pgs
        ? pgs.map((page) => {
              const portalNode = portalNodes.get(page.id);
              if (!portalNode) return null;

              return (
                  <InPortal key={`editor-portal-${page.id}`} node={portalNode}>
                      <RenderEditor model={page} />
                  </InPortal>
              );
          })
        : null;

    return (
        <>
            {allEditors}
            {layout}
        </>
    );
}
