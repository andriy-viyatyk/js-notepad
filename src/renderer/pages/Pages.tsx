import styled from "@emotion/styled";
import clsx from "clsx";
import { CSSProperties, useCallback, useMemo, useRef, useState } from "react";
import { Spliter } from "../controls/Spliter";
import { PageModel } from "../model/page-model";
import { pagesModel } from "../model/pages-model";
import color from "../theme/color";
import { RenderEditor } from "./RenderEditor";

const GroupedPagesRoot = styled.div({
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
});

function RenderGroupedPages({
    model,
    isActive,
}: {
    model: PageModel;
    isActive: boolean;
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
        return <RenderEditor key={`p-${model.id}`} model={model} isActive={isActive} />;
    }

    return (
        <GroupedPagesRoot className={clsx({ isActive })} ref={setContainerRef}>
            <div
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
                <RenderEditor key={`p-${model.id}`} model={model} isActive={isActive} />
            </div>
            <Spliter
                type="vertical"
                className="page-spliter"
                initialWidth={typeof leftWidth === "number" ? leftWidth : 200}
                onChangeWidth={resizeWidth}
                onDoubleClick={splitterDubleClick}
            />
            <div className="page-container" style={{ flex: "1 1 auto" }}>
                <RenderEditor key={`p-${groupedModel.id}`} model={groupedModel} isActive={isActive} />
            </div>
        </GroupedPagesRoot>
    );
}

export function Pages() {
    const { pages: pgs, rightLeft } = pagesModel.state.use();
    const activePage = pagesModel.activePage;
    const groupedPage = pagesModel.groupedPage;

    const pagesToRender = useMemo(() => {
        return pgs?.filter((p) => !rightLeft.has(p.id));
    }, [pgs, rightLeft]);

    return pagesToRender ? (
        <>
            {pagesToRender.map((page) => {
                return (
                    <RenderGroupedPages
                        key={`group-page-${page.id}`}
                        model={page}
                        isActive={page === activePage || page === groupedPage}
                    />
                );
            })}
        </>
    ) : null;
}
