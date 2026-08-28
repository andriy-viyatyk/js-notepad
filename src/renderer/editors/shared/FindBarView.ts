import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { InputView } from "../../uikit/Input/InputView";
import type { InputProps } from "../../uikit/Input/InputView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../uikit/shared/vanilla-view";

export interface FindBarProps {
    text: string;
    currentMatch: number;
    totalMatches: number;
    onTextChange: (text: string) => void;
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
    placeholder?: string;
}

function matchLabel(props: FindBarProps): string {
    if (!props.text) return "";
    return props.totalMatches > 0
        ? `${props.currentMatch + 1} of ${props.totalMatches}`
        : "No results";
}

export class FindBarView extends VanillaView<FindBarProps> {
    private readonly inputView: InputView;
    private readonly previousButton: IconButtonView;
    private readonly nextButton: IconButtonView;
    private readonly closeButton: IconButtonView;
    private readonly matchCounter: HTMLSpanElement;

    public constructor(props: FindBarProps) {
        const root = createPanelElement({
            name: "find-bar",
            position: "absolute",
            top: 4,
            right: 20,
            zIndex: 10,
            align: "center",
            gap: "xs",
            paddingY: "xs",
            paddingX: "sm",
            background: "light",
            border: true,
            borderColor: "default",
            rounded: "md",
            shadow: true,
        });
        super(props, root);

        this.inputView = this.child(new InputView(this.inputProps(props)));
        this.previousButton = this.child(new IconButtonView({
            name: "find-prev",
            size: "sm",
            title: "Previous Match (Shift+F3)",
            onClick: props.onPrev,
            icon: "chevron-up",
        }));
        this.nextButton = this.child(new IconButtonView({
            name: "find-next",
            size: "sm",
            title: "Next Match (F3)",
            onClick: props.onNext,
            icon: "chevron-down",
        }));
        this.closeButton = this.child(new IconButtonView({
            name: "find-close",
            size: "sm",
            title: "Close (Esc)",
            onClick: props.onClose,
            icon: "close",
        }));

        this.matchCounter = createTextElement(matchLabel(props), { size: "sm", color: "light", nowrap: true });
        const inputPanel = createPanelElement({ width: 180 }, [this.inputView.root]);
        const matchPanel = createPanelElement(
            { name: "find-match-counter", minWidth: 50, align: "center", justify: "center" },
            [this.matchCounter],
        );
        this.root.append(
            inputPanel,
            matchPanel,
            this.previousButton.root,
            this.nextButton.root,
            this.closeButton.root,
        );
    }

    protected onMount(): void {
        this.inputView.mount();
        this.previousButton.mount();
        this.nextButton.mount();
        this.closeButton.mount();

        const input = this.inputView.root.querySelector("input");
        input?.focus();
        input?.select();
    }

    protected onUpdate(props: FindBarProps): void {
        this.inputView.update(this.inputProps(props));
        this.previousButton.update({
            name: "find-prev",
            size: "sm",
            title: "Previous Match (Shift+F3)",
            onClick: props.onPrev,
            icon: "chevron-up",
        });
        this.nextButton.update({
            name: "find-next",
            size: "sm",
            title: "Next Match (F3)",
            onClick: props.onNext,
            icon: "chevron-down",
        });
        this.closeButton.update({
            name: "find-close",
            size: "sm",
            title: "Close (Esc)",
            onClick: props.onClose,
            icon: "close",
        });
        this.matchCounter.textContent = matchLabel(props);
    }

    private inputProps(props: FindBarProps): InputProps {
        return {
            name: "find-input",
            size: "sm",
            value: props.text,
            onChange: props.onTextChange,
            onKeyDown: this.handleInputKeyDown,
            placeholder: props.placeholder ?? "Find...",
        };
    }

    private readonly handleInputKeyDown: NonNullable<InputProps["onKeyDown"]> = (event): void => {
        this.handleKeyDown(event);
    };

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            this.props.onClose();
        } else if (event.key === "Enter" && event.shiftKey) {
            event.preventDefault();
            this.props.onPrev();
        } else if (event.key === "Enter") {
            event.preventDefault();
            this.props.onNext();
        } else if (event.key === "F3" && event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            this.props.onPrev();
        } else if (event.key === "F3") {
            event.preventDefault();
            event.stopPropagation();
            this.props.onNext();
        }
    };
}
