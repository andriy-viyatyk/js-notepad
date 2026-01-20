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
import { Tooltip } from "./Tooltip";
import { uuid } from "../common/node-utils";
import { MenuItem } from "./PopupMenu";

const NoRowsRoot = styled.div({
    flex: "1 1 auto",
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
    getContextMenu?: (value: O, index?: number) => MenuItem[] | undefined;
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
    getContextMenu?: (value: O, index?: number) => MenuItem[] | undefined;
    onContextMenu?: (e: React.MouseEvent<Element>) => void;
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
    getContextMenu,
    ...other
}: OptionProps<any> & {
    optionClass?: string;
    onMouseHover?: (value: any, index?: number) => void;
    index: number;
    icon?: React.ReactNode;
    label?: React.ReactNode;
}) {
    const highlight = useHighlightedText();
    const id = useMemo(() => uuid(), []);

    const onMouseEnter = useCallback(() => {
        onMouseHover?.(row, index);
    }, [onMouseHover, row, index]);

    const onClick = useCallback(
        (e: React.MouseEvent<Element>) => {
            propsOnClick(row, index, e);
        },
        [index, propsOnClick, row]
    );

    const tooltip = useMemo(
        () => getTooltip?.(row, index),
        [getTooltip, row, index]
    );

    const { top, height, ...restStyle } = style;
    const adjustedTop = itemMarginY
        ? (top as number) + itemMarginY
        : (top as number);
    const adjustedHeight = itemMarginY
        ? (height as number) - itemMarginY * 2
        : (height as number);

    const onContextMenu = useCallback(
        (e: React.MouseEvent<Element>) => {
            const menuItems = getContextMenu?.(row, index);
            if (menuItems) {
                if (!e.nativeEvent.menuItems) {
                    e.nativeEvent.menuItems = [];
                }
                e.nativeEvent.menuItems.push(...menuItems);
            }
        },
        [getContextMenu, row, index]
    );

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
            onContextMenu={onContextMenu}
            data-tooltip-id={id}
        >
            {Boolean(icon) && icon}
            <OverflowTooltipText className="item-text">
                {typeof label === "string"
                    ? highlightText(highlight, label)
                    : label}
            </OverflowTooltipText>
            {selected &&
                (selectedIcon ?? <CheckIcon className="selectedCheckIcon" />)}
            {Boolean(tooltip) && (
                <Tooltip id={id} delayShow={1500}>
                    {tooltip}
                </Tooltip>
            )}
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
        getContextMenu,
        onContextMenu,
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
        getContextMenu,
        onContextMenu,
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
                getContextMenu,
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
                        getContextMenu={getContextMenu}
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
                <CircularProgress className="loading-indicator" /> loading...
            </NoRowsRoot>
        );
    }

    if (!options.length) {
        return (
            <NoRowsRoot onContextMenu={onContextMenu}>
                {emptyMessage ?? "no rows"}
            </NoRowsRoot>
        );
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
            contentProps={{ onContextMenu }}
        />
    );
}

export const List = forwardRef(ListComponent) as <O = any>(
    props: React.PropsWithoutRef<ListProps<O>> & React.RefAttributes<ListRef>
) => React.ReactElement | null;
