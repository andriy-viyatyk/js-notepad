import styled from "@emotion/styled";
import { useComponentModel } from "../../core/state/model";
import { getRowKey } from "./utils/grid-utils";
import { useCallback, useEffect, useState } from "react";
import AVGrid from "../../components/data-grid/AVGrid/AVGrid";
import { FiltersProvider } from "../../components/data-grid/AVGrid/filters/useFilters";
import { FilterBar } from "../../components/data-grid/AVGrid/filters/FilterBar";
import { createPortal } from "react-dom";
import { TextField } from "../../components/basic/TextField";
import { CloseIcon, ColumnsIcon } from "../../theme/icons";
import { Button } from "../../components/basic/Button";
import color from "../../theme/color";
import { showColumnsOptions } from "./components/ColumnsOptions";
import {
    defaultGridPageState,
    GridPageModel,
    GridPageProps,
} from "./GridPageModel";
import { showCsvOptions } from "./components/CsvOptions";
import { pagesModel } from "../../store/pages-store";

const GridPageRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    height: 200,
    position: "relative",
});

const ErrorRoot = styled.div({
    whiteSpace: "pre",
    margin: "auto",
    top: "50%",
    transform: "translateY(-50%)",
    color: color.misc.yellow,
});

const SearchFieldRoot = styled(TextField)({
    "& input": {
        color: color.misc.blue,
    },
});

export function GridEditor(props: GridPageProps) {
    const { model } = props;
    const pageModel = useComponentModel(
        props,
        GridPageModel,
        defaultGridPageState
    );
    const state = model.state.use();
    const pageState = pageModel.state.use();
    const [, /* unused */ setRefresh] = useState(0);

    useEffect(() => {
        pageModel.init();
        const focusSubscription = pagesModel.onFocus.subscribe(pageModel.pageFocused);
        return () => {
            focusSubscription.unsubscribe();
            pageModel.dispose();
        };
    }, []);

    useEffect(() => {
        pageModel.reload();
    }, [pageState.csvDelimiter, pageState.csvWithColumns]);

    useEffect(() => {
        pageModel.updateContent(state.content || "");
    }, [state.content]);

    const onVisibleRowsChanged = useCallback(() => {
        Promise.resolve().then(() => {
            setRefresh(new Date().getTime());
        });
    }, []);

    if (pageState.error) {
        return <ErrorRoot>{pageState.error}</ErrorRoot>;
    }

    return (
        <>
            {Boolean(model.editorToolbarRefLast) &&
                createPortal(
                    <SearchFieldRoot
                        value={pageState.search}
                        onChange={pageModel.setSearch}
                        placeholder="Search..."
                        endButtons={[
                            <Button
                                size="small"
                                type="icon"
                                key="clear-search"
                                title="Clear Search"
                                onClick={pageModel.clearSearch}
                                invisible={!pageState.search}
                            >
                                <CloseIcon />
                            </Button>,
                        ]}
                    />,
                    model.editorToolbarRefLast
                )}
            {Boolean(model.editorToolbarRefFirst) &&
                createPortal(
                    <>
                        <Button
                            size="small"
                            type="flat"
                            title="Edit Columns"
                            onClick={(e) => {
                                if (pageModel.gridRef) {
                                    showColumnsOptions(
                                        e.currentTarget,
                                        pageModel.gridRef,
                                        state.editor === "grid-csv",
                                        pageModel.onUpdateRows
                                    );
                                }
                            }}
                        >
                            <ColumnsIcon />
                        </Button>
                        {Boolean(model.state.get().editor === "grid-csv") && (
                            <Button
                                size="small"
                                type="icon"
                                color="light"
                                key="csv-options"
                                className="csv-options-button"
                                title="Csv Options"
                                onClick={(e) => {
                                    showCsvOptions(e.currentTarget, pageModel);
                                }}
                            >
                                ⚒-csv
                            </Button>
                        )}
                    </>,
                    model.editorToolbarRefFirst
                )}
            <GridPageRoot>
                <FiltersProvider
                    filters={pageState.filters}
                    setFilters={pageModel.setFilters}
                    onGetOptions={pageModel.onGetOptions}
                >
                    <FilterBar
                        className="filter-bar"
                        gridModel={pageModel.gridRef}
                    />
                    <AVGrid
                        ref={pageModel.setGridRef}
                        columns={pageState.columns}
                        rows={pageState.rows}
                        getRowKey={getRowKey}
                        focus={pageState.focus}
                        setFocus={pageModel.setFocus}
                        searchString={pageState.search}
                        filters={pageState.filters}
                        onVisibleRowsChanged={onVisibleRowsChanged}
                        editRow={pageModel.editRow}
                        onAddRows={pageModel.onAddRows}
                        setColumns={pageModel.setColumns}
                        onAddColumns={pageModel.onAddColumns}
                        onDeleteRows={pageModel.onDeleteRows}
                        onDeleteColumns={pageModel.onDeleteColumns}
                        onDataChanged={pageModel.onDataChanged}
                    />
                </FiltersProvider>
            </GridPageRoot>
            {Boolean(model.editorFooterRefLast) &&
                createPortal(
                    <span className="records-count">
                        {pageModel.recordsCount}
                    </span>,
                    model.editorFooterRefLast
                )}
        </>
    );
}

const moduleExport = {
    Editor: GridEditor,
};

export default moduleExport;

// Re-export with old name for backward compatibility
export { GridEditor as GridPage };
