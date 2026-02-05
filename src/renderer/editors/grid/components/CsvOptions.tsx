import styled from "@emotion/styled";
import { Popper } from "../../../components/overlay/Popper";
import color from "../../../theme/color";
import {
    CheckedIcon,
    RadioCheckedIcon,
    RadioUncheckedIcon,
    UncheckedIcon,
} from "../../../theme/icons";
import { Button } from "../../../components/basic/Button";
import ReactDOM from "react-dom";
import { DefaultView, ViewPropsRO, Views } from "../../../core/state/view";
import { useCallback, useEffect, useState } from "react";
import { TComponentState } from "../../../core/state/state";
import { TextField } from "../../../components/basic/TextField";
import { TPopperModel } from "../../../features/dialogs/poppers/types";
import { showPopper } from "../../../features/dialogs/poppers/Poppers";
import { GridPageModel } from "../GridPageModel";

const CsvOptionsRoot = styled.div({
    minWidth: 140,
    minHeight: 60,
    border: `1px solid ${color.border.default}`,
    borderRadius: 4,
    backgroundColor: color.background.default,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    rowGap: 8,
    color: color.text.default,
    padding: 16,
    "& .delimiter-text": {
        color: color.text.light,
        marginTop: 8,
    },
    "& .delimiter-other": {
        display: "flex",
        alignItems: "center",
        columnGap: 8,
    },
});

class CsvOptionsModel extends TPopperModel<null, void> {
    el = undefined as Element | undefined;
    gridModel: GridPageModel | undefined = undefined;
}

const defaultOffset = [0, 2] as [number, number];
const showCsvOptionsId = Symbol("ShowCsvOptions");

const delimiters = [",", ";", "\t"];

export function CsvOptions({ model }: ViewPropsRO<CsvOptionsModel>) {
    const gridViewState = model.gridModel.state.use();
    const [other, setOther] = useState<string>(gridViewState.csvDelimiter);

    const setOtherProxy = useCallback((value: string) => {
        const valueToSet = value.length > 1 ? value[0] : value;
        setOther(valueToSet);
        if (valueToSet) {
            model.gridModel?.setDelimiter(valueToSet);
        }
    }, []);

    useEffect(() => {
        setOther((old) => {
            if (
                old &&
                gridViewState.csvDelimiter &&
                old !== gridViewState.csvDelimiter
            ) {
                return gridViewState.csvDelimiter;
            }
            return old;
        });
    }, [gridViewState.csvDelimiter]);

    return ReactDOM.createPortal(
        <Popper
            elementRef={model.el}
            offset={defaultOffset}
            open
            onClose={model.close}
            placement="bottom-end"
        >
            <CsvOptionsRoot className="csv-options-root">
                <Button
                    size="small"
                    type="icon"
                    onClick={model.gridModel?.toggleWithColumns}
                >
                    {gridViewState.csvWithColumns ? (
                        <CheckedIcon />
                    ) : (
                        <UncheckedIcon />
                    )}
                    First row is header
                </Button>
                <div className="delimiter-text">Delimiter:</div>
                {delimiters.map((delimiter) => (
                    <Button
                        key={delimiter}
                        size="small"
                        type="icon"
                        onClick={() => model.gridModel?.setDelimiter(delimiter)}
                    >
                        {gridViewState.csvDelimiter === delimiter ? (
                            <RadioCheckedIcon />
                        ) : (
                            <RadioUncheckedIcon />
                        )}
                        {delimiter === "\t" ? "\\t" : delimiter}
                    </Button>
                ))}
                <div className="delimiter-other">
                    Other:
                    <TextField
                        value={other}
                        onChange={setOtherProxy}
                        width={40}
                        className="csv-options-text-field"
                    />
                </div>
            </CsvOptionsRoot>
        </Popper>,
        document.body
    );
}

Views.registerView(showCsvOptionsId, CsvOptions as DefaultView);

export const showCsvOptions = async (el: Element, gridModel: GridPageModel) => {
    const model = new CsvOptionsModel(new TComponentState(null));
    model.el = el;
    model.gridModel = gridModel;
    await showPopper<void>({
        viewId: showCsvOptionsId,
        model,
    });
};
