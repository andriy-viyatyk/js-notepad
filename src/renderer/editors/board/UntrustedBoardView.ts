import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../uikit/Button/Button.css";

interface UntrustedBoardViewProps {
    path: string;
    onTrust: () => void | Promise<void>;
}

/** Shown in place of a board until the user consents to trust it. */
export class UntrustedBoardView extends VanillaView<UntrustedBoardViewProps> {
    private readonly pathElement: HTMLSpanElement;
    private readonly trustButton: ButtonView;

    public constructor(props: UntrustedBoardViewProps) {
        const pathElement = createTextElement("", { size: "sm", color: "light" });
        super(props, createPanelElement({
            direction: "column",
            flex: true,
            align: "center",
            justify: "center",
            gap: "md",
            padding: "xl",
        }, [
            createIconElement("warning", { width: 32, height: 32 }),
            createTextElement("This board is not trusted", { size: "lg" }),
            createTextElement(
                "Trusting this board lets it run programs on your computer with your full user privileges. Only trust boards you created or fully understand.",
                { color: "light", align: "center" },
            ),
            pathElement,
        ]));
        this.pathElement = pathElement;
        const trustButton = this.child(new ButtonView({
            variant: "primary",
            name: "board-trust",
            onClick: () => void this.props.onTrust(),
            children: "Trust board",
        }));
        this.trustButton = trustButton;
        this.root.append(trustButton.root);
    }

    protected onMount(): void {
        this.trustButton.mount();
        this.updatePath();
    }

    protected onUpdate(): void {
        this.updatePath();
    }

    private updatePath(): void {
        this.pathElement.textContent = this.props.path;
    }
}
