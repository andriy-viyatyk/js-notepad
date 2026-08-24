import { createPanelElement, applyPanelAttributes, resolvePanelAttributes } from "../../../uikit/Panel/panel-style";
import { ButtonView, type ButtonViewProps } from "../../../uikit/Button/ButtonView";
import { VanillaView } from "../../../uikit/shared/vanilla-view";

interface ParsedButton { label: string; required: boolean; }
function parseButtons(buttons: string[]): ParsedButton[] {
    return buttons.map((button) => button.startsWith("!")
        ? { label: button.slice(1), required: true }
        : { label: button, required: false });
}

export interface ButtonsPanelViewProps {
    buttons: string[];
    button?: string;
    requirementNotMet?: boolean;
    onClickButton: (label: string) => void;
}

export class ButtonsPanelView extends VanillaView<ButtonsPanelViewProps> {
    private readonly buttonViews = new Map<string, ButtonView>();
    private readonly clickHandlers = new Map<string, () => void>();

    public constructor(props: ButtonsPanelViewProps) {
        super(props, createPanelElement({ name: "log-buttons-panel", direction: "row", gap: "md", paddingX: "md", paddingY: "sm", wrap: true }));
    }

    protected onMount(): void {
        this.applyProps(this.props);
        this.syncButtons();
    }

    protected onUpdate(props: ButtonsPanelViewProps): void {
        this.applyProps(props);
        this.syncButtons();
    }

    protected onDispose(): void {
        this.buttonViews.clear();
    }

    private applyProps(props: ButtonsPanelViewProps): void {
        applyPanelAttributes(this.root, resolvePanelAttributes({ name: "log-buttons-panel", direction: "row", gap: "md", paddingX: "md", paddingY: "sm", wrap: true }));
        for (const parsed of parseButtons(props.buttons)) {
            const view = this.buttonViews.get(parsed.label);
            if (!view) continue;
            view.update(this.buttonProps(parsed));
        }
    }

    private syncButtons(): void {
        const parsed = parseButtons(this.props.buttons);
        const wanted = new Set(parsed.map((button) => button.label));
        for (const [label, view] of this.buttonViews) {
            if (!wanted.has(label)) {
                this.releaseChild(view);
                this.buttonViews.delete(label);
                this.clickHandlers.delete(label);
            }
        }
        parsed.forEach((button, index) => {
            let view = this.buttonViews.get(button.label);
            if (!view) {
                view = this.child(new ButtonView(this.buttonProps(button)));
                this.buttonViews.set(button.label, view);
                view.mount();
            } else view.update(this.buttonProps(button));
            const expected = this.root.children[index];
            if (expected !== view.root) this.root.insertBefore(view.root, expected ?? null);
        });
    }

    private readonly handleClick = (label: string): void => {
        if (this.props.button === undefined) this.props.onClickButton(label);
    };

    private buttonProps(button: ParsedButton): ButtonViewProps {
        const resolved = this.props.button !== undefined;
        const isResult = resolved && this.props.button === button.label;
        return {
            name: `log-button-${button.label}`,
            size: "sm",
            disabled: resolved || (button.required && this.props.requirementNotMet === true),
            onClick: this.clickHandler(button.label),
            icon: isResult ? "check" : undefined,
            children: button.label,
        };
    }

    private clickHandler(label: string): () => void {
        let handler = this.clickHandlers.get(label);
        if (!handler) {
            handler = () => this.handleClick(label);
            this.clickHandlers.set(label, handler);
        }
        return handler;
    }
}
