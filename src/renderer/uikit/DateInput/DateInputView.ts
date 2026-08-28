import { VanillaView } from "../shared/vanilla-view";
import { InputView } from "../Input/InputView";
import type { InputProps } from "../Input/InputView";
import type { DateInputProps } from "./DateInput";
import "../Input/Input.css";

/**
 * The native DateInput seam. The child is an InputView today; a future themed calendar can replace
 * that implementation here without changing DateInput consumers or their ISO string API.
 */
export class DateInputView extends VanillaView<DateInputProps> {
    private inputView: InputView | undefined;

    public constructor(props: DateInputProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "date-input";
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        const inputView = this.child(new InputView(this.inputProps(this.props)));
        this.inputView = inputView;
        this.root.append(inputView.root);
        inputView.mount();
    }

    protected onUpdate(props: DateInputProps): void {
        this.inputView?.update(this.inputProps(props));
    }

    protected onDispose(): void {
        this.inputView = undefined;
    }

    private inputProps(props: DateInputProps): InputProps {
        const { value, onChange, ...rest } = props;
        return { ...rest, type: "date", value, onChange };
    }
}
