import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";

interface BoardNotFoundViewProps {
    path: string;
}

/** Shown when the linked board folder is missing or is not a board. */
export class BoardNotFoundView extends VanillaView<BoardNotFoundViewProps> {
    private readonly pathElement: HTMLSpanElement;

    public constructor(props: BoardNotFoundViewProps) {
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
            createTextElement("Board not found", { size: "lg" }),
            createTextElement(
                "This board could not be opened — its folder is missing or is not a board (no board-manifest.json).",
                { color: "light", align: "center" },
            ),
            pathElement,
        ]));
        this.pathElement = pathElement;
    }

    protected onMount(): void {
        this.updatePath();
    }

    protected onUpdate(): void {
        this.updatePath();
    }

    private updatePath(): void {
        this.pathElement.textContent = this.props.path;
    }
}
