import {
    CSSProperties,
    ForwardedRef,
    forwardRef,
    ReactElement,
    ReactNode,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
} from "react";
import clsx from "clsx";
import styled from "@emotion/styled";

import RenderGrid from "./RenderGrid/RenderGrid";
import RenderGridModel from "./RenderGrid/RenderGridModel";
import { Percent, RenderCellFunc } from "./RenderGrid/types";
import { defaultOptionGetLabel } from "./utils";
import { CheckIcon } from "../theme/icons";
import { CircularProgress } from "./CircularProgress";
import color from "../theme/color";
import { OverflowTooltipText } from "./OverflowTooltipText";
import { highlightText, useHighlightedText } from "./useHighlightedText";
import { windowUtils } from "../common/utils";
import { Tooltip } from "./Tooltip";

const NoRowsRoot = styled.div({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    "& >": {
        marginRight: 4,
    },
    "& .loading-indicator": {
        width: 16,
        height: 16,
        margin: 4,
        "& svg": {
            color: `${color.icon.light} !important`,
        },
    },
});

const ItemRoot = styled.div({
    paddingLeft: 4,
    cursor: "pointer",
    color: color.text.default,
    flexDirection: "row",
    columnGap: 6,
    display: "inline-flex",
    alignItems: "center",
    overflow: "hidden",
    "&.selected)": {
        backgroundColor: color.background.selection,
        color: color.text.selection,
    },
    "&.hovered": {
        backgroundColor: color.background.selection,
        color: color.text.selection,
    },
    "& .item-text": {
        flex: "1 1",
        whiteSpace: "nowrap",
    },
    "& .selectedCheckIcon": {
        position: "absolute",
        right: 6,
        top: 4,
        width: 16,
        height: 16,
    },
});

const RenderGridRoot = styled(RenderGrid)({});

export const listItemHeight = 24;

interface OptionProps<O> {
    index: number;
    key: string | number;
    style: CSSProperties;
    onClick: (row: O, index?: number, e?: React.MouseEvent<Element>) => void;
    row: O;
    selected: boolean;
    hovered: boolean;
    onMouseHover?: (value: O, index?: number) => void;
    selectedIcon?: ReactNode;
    itemMarginY?: number;
    getTooltip?: (value: O, index?: number) => string | undefined;
}

export type ListOptionRenderer<O> = (props: OptionProps<O>) => ReactNode;

export interface ListProps<O> {
    options: readonly O[];
    getLabel?: (value: O, index?: number) => React.ReactNode;
    getIcon?: (value: O, index?: number) => React.ReactNode;
    getSelected?: (value: O) => boolean;
    onClick?: (value: O, index?: number, e?: React.MouseEvent<Element>) => void;
    getOptionClass?: (value: O, index?: number) => string;
    emptyMessage?: string | ReactElement;
    getHovered?: (value: O) => boolean;
    onMouseHover?: (value: O, index?: number) => void;
    loading?: boolean;
    rowHeight?: number;
    rowRenderer?: ListOptionRenderer<O>;
    className?: string;
    growToHeight?: CSSProperties["height"];
    whiteSpaceY?: number;
    selectedIcon?: ReactNode;
    itemMarginY?: number;
    getTooltip?: (value: O, index?: number) => string | undefined;
}

const columnWidth = () => "100%" as Percent;

export interface ListRef {
    getGrid: () => RenderGridModel | null;
}

function DefaultCell({
    style,
    optionClass,
    selected,
    hovered,
    onClick: propsOnClick,
    onMouseHover,
    row,
    index,
    icon,
    label,
    selectedIcon,
    itemMarginY,
    getTooltip,
    ...other
}: OptionProps<any> & {
    optionClass?: string;
    onMouseHover?: (value: any, index?: number) => void;
    index: number;
    icon?: React.ReactNode;
    label?: React.ReactNode;
}) {
    const highlight = useHighlightedText();
    const id = useMemo(() => windowUtils.uuid(), []);

    const onMouseEnter = useCallback(() => {
        onMouseHover?.(row, index);
    }, [onMouseHover, row, index]);

    const onClick = useCallback((e: React.MouseEvent<Element>) => {
        propsOnClick(row, index, e);
    }, [index, propsOnClick, row]);

    const tooltip = useMemo(() => getTooltip?.(row, index), [getTooltip, row, index]);

    const { top, height, ...restStyle } = style;
    const adjustedTop = itemMarginY ? (top as number) + itemMarginY : (top as number);
    const adjustedHeight = itemMarginY ? (height as number) - itemMarginY * 2 : (height as number);

    return (
        <ItemRoot
            key={other.key}
            style={{ ...restStyle, top: adjustedTop, height: adjustedHeight }}
            className={clsx(
                {
                    selected,
                    hovered,
                },
                "list-item",
                optionClass
            )}
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            data-tooltip-id={id}
        >
            {Boolean(icon) && icon}
            <OverflowTooltipText className="item-text">
                {typeof label === "string" ? highlightText(highlight, label) : label}
            </OverflowTooltipText>
            {selected && (selectedIcon ?? <CheckIcon className="selectedCheckIcon" />)}
            {Boolean(tooltip) && (<Tooltip id={id}>{tooltip}</Tooltip>)}
        </ItemRoot>
    );
}

function ListComponent<O = any>(
    props: Readonly<ListProps<O>>,
    ref: ForwardedRef<ListRef>
) {
    const gridRef = useRef<RenderGridModel | null>(null);
    const {
        options,
        rowHeight,
        getSelected,
        getHovered,
        rowRenderer,
        onClick,
        getIcon,
        getLabel: getLabelProps,
        getOptionClass,
        loading,
        emptyMessage,
        onMouseHover,
        className,
        growToHeight,
        whiteSpaceY,
        selectedIcon,
        itemMarginY,
        getTooltip,
    } = props;

    useEffect(() => {
        gridRef.current?.update({ all: true });
    }, [
        options,
        rowHeight,
        getSelected,
        getHovered,
        rowRenderer,
        onClick,
        getIcon,
        getLabelProps,
        getOptionClass,
        loading,
        emptyMessage,
        onMouseHover,
        className,
        itemMarginY,
        getTooltip,
    ]);

    const getLabel = useCallback(
        (option: O, index: number) => {
            return getLabelProps
                ? getLabelProps(option, index)
                : defaultOptionGetLabel(option);
        },
        [getLabelProps]
    );

    const optionClick = useCallback(
        (row: O, index?: number, e?: React.MouseEvent<Element>) => {
            onClick?.(row, index, e);
            gridRef.current?.update({ all: true });
        },
        [onClick]
    );

    useImperativeHandle(
        ref,
        () => ({
            getGrid: () => gridRef.current,
        }),
        []
    );

    const renderCell = useCallback<RenderCellFunc>(
        ({ row: index, key, style }) => {
            const isSelected = getSelected
                ? getSelected(options[index])
                : false;
            const isHovered = getHovered?.(options[index]) ?? false;
            const icon = getIcon?.(options[index], index);
            const label = getLabel(options[index], index);
            const optionClass = getOptionClass?.(options[index], index);

            const res = rowRenderer?.({
                index,
                key,
                style,
                onClick: optionClick,
                row: options[index],
                selected: isSelected,
                hovered: isHovered,
                onMouseHover,
                selectedIcon,
                itemMarginY,
                getTooltip,
            });
            return (
                res ?? (
                    <DefaultCell
                        key={key}
                        style={style}
                        optionClass={optionClass}
                        selected={isSelected}
                        hovered={isHovered}
                        onClick={optionClick}
                        onMouseHover={onMouseHover}
                        row={options[index]}
                        index={index}
                        icon={icon}
                        label={label}
                        selectedIcon={selectedIcon}
                        itemMarginY={itemMarginY}
                        getTooltip={getTooltip}
                    />
                )
            );
        },
        [
            getSelected,
            options,
            getHovered,
            getIcon,
            getLabel,
            getOptionClass,
            rowRenderer,
            optionClick,
            onMouseHover,
            itemMarginY,
        ]
    );

    if (loading) {
        return (
            <NoRowsRoot>
                <CircularProgress className="loading-indicator" /> Loading...
            </NoRowsRoot>
        );
    }

    if (!options.length) {
        return <NoRowsRoot>{emptyMessage ?? "No rows"}</NoRowsRoot>;
    }

    return (
        <RenderGridRoot
            ref={gridRef}
            columnCount={1}
            rowCount={options.length}
            columnWidth={columnWidth}
            rowHeight={rowHeight || listItemHeight}
            renderCell={renderCell}
            overscanRow={2}
            fitToWidth
            className={className}
            growToHeight={growToHeight}
            whiteSpaceY={whiteSpaceY}
        />
    );
}

export const List = forwardRef(ListComponent) as <O = any>(
    props: React.PropsWithoutRef<ListProps<O>> & React.RefAttributes<ListRef>
) => React.ReactElement | null;
