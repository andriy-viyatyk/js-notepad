import { Popover } from "../../../uikit/Popover";
import ReactDOM from "react-dom";
import { DefaultView, ViewPropsRO, Views } from "../../../core/state/view";
import { useCallback, useEffect, useState } from "react";
import { TComponentState } from "../../../core/state/state";
import { Panel } from "../../../uikit/Panel";
import { Checkbox } from "../../../uikit/Checkbox";
import { RadioGroup } from "../../../uikit/RadioGroup";
import type { IRadio } from "../../../uikit/RadioGroup";
import { Input } from "../../../uikit/Input";
import { Text } from "../../../uikit/Text";
import { TPopperModel } from "../../../ui/dialogs/poppers/types";
import { showPopper } from "../../../ui/dialogs/poppers/Poppers";
import type { GridEditor } from "../GridEditor";

class CsvOptionsModel extends TPopperModel<null, void> {
    el = undefined as Element | undefined;
    gridModel: GridEditor | undefined = undefined;
}

const defaultOffset = [0, 2] as [number, number];
const showCsvOptionsId = Symbol("ShowCsvOptions");

const delimiterItems: IRadio[] = [
    { value: ",", label: "," },
    { value: ";", label: ";" },
    { value: "\t", label: "\\t" },
];

export function CsvOptions({ model }: ViewPropsRO<CsvOptionsModel>) {
    const gridViewState = model.gridModel.state.use();
    const [other, setOther] = useState<string>(gridViewState.csvDelimiter);

    const setOtherProxy = useCallback((value: string) => {
        const valueToSet = value.length > 1 ? value[0] : value;
        setOther(valueToSet);
        if (valueToSet) {
            model.gridModel?.setDelimiter(valueToSet);
        }
    }, [model.gridModel]);

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
        <Popover
            elementRef={model.el}
            offset={defaultOffset}
            open
            onClose={model.close}
            placement="bottom-start"
        >
            <Panel
                name="csv-options"
                direction="column"
                align="start"
                gap="sm"
                padding="lg"
                minWidth={140}
                minHeight={60}
            >
                <Checkbox
                    checked={gridViewState.csvWithColumns}
                    onChange={() => model.gridModel?.toggleWithColumns()}
                >
                    First row is header
                </Checkbox>
                <Text color="light">Delimiter:</Text>
                <RadioGroup
                    items={delimiterItems}
                    value={gridViewState.csvDelimiter}
                    onChange={(v) => model.gridModel?.setDelimiter(v)}
                />
                <Panel direction="row" align="center" gap="sm">
                    <Text>Other:</Text>
                    <Input
                        size="sm"
                        value={other}
                        onChange={setOtherProxy}
                        width={40}
                    />
                </Panel>
            </Panel>
        </Popover>,
        document.body
    );
}

Views.registerView(showCsvOptionsId, CsvOptions as DefaultView);

export const showCsvOptions = async (el: Element, gridModel: GridEditor) => {
    const model = new CsvOptionsModel(new TComponentState(null));
    model.el = el;
    model.gridModel = gridModel;
    await showPopper<void>({
        viewId: showCsvOptionsId,
        model,
    });
};
