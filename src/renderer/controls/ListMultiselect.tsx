import { CSSProperties, ForwardedRef, forwardRef, JSX, useCallback, useMemo, useRef } from "react";
import styled from "@emotion/styled";

import { defaultOptionGetLabel } from "./utils";
import { List, ListRef } from "./List";
import { CheckedIcon, UncheckedIcon } from "../theme/icons";

const ListRoot = styled(List)({
    "& .check-icon": {
        flexShrink: 0,
        width: 16,
        height: 16,
    }
}) as typeof List;

export interface ListMultiselectProps<O = any> {
    options: readonly O[];
    selected?: readonly O[];
    setSelected?: (selected: O[]) => void;
    getLabel?: (value: O, index?: number) => string;
    withSelectAll?: boolean;
    getOptionClass?: (value: O, index?: number) => string;
    loading?: boolean;
    getSelected?: (value: O) => boolean;
    growToHeight?: CSSProperties["height"];
    emptyMessage?: string | React.ReactElement;
    whiteSpaceY?: number;
    onSingleSelect?: () => void;
}

function ListMultiselectComponent<O = any>(
    props: Readonly<ListMultiselectProps<O>>,
    ref: ForwardedRef<ListRef>
) {
    const {
        options: propsOptions,
        selected,
        setSelected,
        getLabel: propsGetLabel,
        withSelectAll,
        getOptionClass,
        loading,
        getSelected,
        growToHeight,
        emptyMessage,
        whiteSpaceY,
        onSingleSelect,
    } = props;
    const preventCloseRef = useRef(false);

    const getLabel = useCallback(
        (o: O, idx?: number) => {
            return withSelectAll && idx === 0
                ? (o as unknown as string)
                : propsGetLabel
                ? propsGetLabel(o, idx)
                : defaultOptionGetLabel(o);
        },
        [propsGetLabel, withSelectAll]
    );

    const { options, selectedAll } = useMemo(() => {
        const selectedAll: boolean =
            Boolean(propsOptions.length) &&
            propsOptions.length === (selected?.length ?? 0);
        const options = withSelectAll
            ? (["Select All", ...propsOptions] as O[])
            : propsOptions;
        return { options, selectedAll };
    }, [propsOptions, selected?.length, withSelectAll]);

    const iconClick = useCallback((e: React.MouseEvent) => {
        preventCloseRef.current = true;
    }, []);

    const getIcon = useCallback(
        (o: O, idx?: number) => {
            const checked =
                (idx === 0 && withSelectAll && selectedAll) ||
                (getSelected
                    ? getSelected(o)
                    : selected
                    ? selected.includes(o)
                    : false);
            return checked ? (
                <CheckedIcon className="check-icon" onClick={iconClick} />
            ) : (
                <UncheckedIcon className="check-icon" onClick={iconClick} />
            );
        },
        [selected, selectedAll, withSelectAll, getSelected]
    );

    const onClick = useCallback(
        (o: O, idx?: number) => {
            const oLabel = getLabel(o);
            let newSelected = selected ? [...selected] : [];
            if (withSelectAll && idx === 0) {
                newSelected = selectedAll ? [] : [...propsOptions];
                setSelected?.(newSelected);
            } else if (selected?.find((i) => getLabel(i) === oLabel)) {
                newSelected = selected.filter((i) => getLabel(i) !== oLabel);
                setSelected?.(newSelected);
            } else {
                newSelected.push(o);
                setSelected?.(newSelected);
            }

            if (newSelected.length > (selected?.length ?? 0) && !preventCloseRef.current) {
                onSingleSelect?.();
            }
            preventCloseRef.current = false;
        },
        [
            propsOptions,
            selected,
            selectedAll,
            setSelected,
            withSelectAll,
            getLabel,
        ]
    );

    return (
        <ListRoot
            ref={ref}
            options={options}
            getLabel={getLabel}
            getIcon={getIcon}
            onClick={onClick}
            getOptionClass={getOptionClass}
            loading={loading}
            growToHeight={growToHeight}
            emptyMessage={emptyMessage}
            whiteSpaceY={whiteSpaceY}
        />
    );
}

export const ListMultiselect = forwardRef(ListMultiselectComponent) as <O = any>(
  props: ListMultiselectProps<O> & { ref?: React.Ref<ListRef> }
) => JSX.Element;
