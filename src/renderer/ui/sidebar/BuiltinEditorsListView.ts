import { settings } from "../../api/settings";
import { TraitSet, traited } from "../../core/traits/traits";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { ListBoxView } from "../../uikit/ListBox/ListBoxView";
import { LIST_ITEM_KEY } from "../../uikit/ListBox/types";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { addPin, getPinnedStrings } from "./pinned-items";
import { getCreatableItems, type CreatableItem } from "./tools-editors-registry";

export interface BuiltinEditorsListProps {
    onClose?: () => void;
}

type SectionMarker = { kind: "section"; label: string };
type RowSource = CreatableItem | SectionMarker;

const isSection = (source: RowSource): source is SectionMarker =>
    "kind" in source && source.kind === "section";

function createRowTraits(getTrailing: (source: RowSource) => Node | undefined): TraitSet {
    return new TraitSet().add(LIST_ITEM_KEY, {
    value: (source: unknown) => {
        const item = source as RowSource;
        return isSection(item) ? `section-${item.label}` : item.id;
    },
    label: (source: unknown) => (source as RowSource).label,
    icon: (source: unknown) => {
        const item = source as RowSource;
        return isSection(item) ? undefined : item.icon;
    },
    rowClass: () => "tools-editor-row",
    trailingElement: (source: unknown) => getTrailing(source as RowSource),
    section: (source: unknown) => isSection(source as RowSource),
    });
}

export class BuiltinEditorsListView extends VanillaView<BuiltinEditorsListProps> {
    private readonly list: ListBoxView<RowSource>;
    private readonly pinButtons = new Map<string, IconButtonView>();

    public constructor(props: BuiltinEditorsListProps) {
        const list = new ListBoxView<RowSource>({
            name: "tools-builtin-list",
            items: [],
            rowHeight: 28,
            whiteSpaceY: 8,
            onChange: () => undefined,
        });
        super(props, list.root);
        this.list = list;
    }

    protected onMount(): void {
        this.list.update(this.listProps());
        this.child(this.list).mount();

        const settingsSubscription = settings.onChanged.subscribe(({ key }) => {
            if (key === "browser-profiles" || key === "pinned-editors") this.refresh();
        });
        this.own(settingsSubscription);
        this.refresh();
    }

    private refresh(): void {
        const browserProfiles = settings.get("browser-profiles");
        const allItems = getCreatableItems(browserProfiles);
        const pinnedIds = new Set(
            getPinnedStrings().filter((stored) => !stored.startsWith("board:")),
        );
        const rows = allItems
            .filter((item) => !pinnedIds.has(item.id))
            .sort((a, b) => a.label.localeCompare(b.label));

        this.ensurePinButtons(rows);
        this.list.update(this.listProps(rows));
    }

    private ensurePinButtons(items: CreatableItem[]): void {
        const ids = new Set(items.map((item) => item.id));
        for (const [id, button] of this.pinButtons) {
            if (ids.has(id)) continue;
            button.dispose();
            button.root.remove();
            this.pinButtons.delete(id);
        }
        for (const item of items) {
            if (this.pinButtons.has(item.id)) continue;
            const button = new IconButtonView({
                size: "sm",
                icon: "pin",
                title: "Pin to menu",
                onClick: (event) => {
                    event.stopPropagation();
                    addPin({ kind: "editor", id: item.id });
                },
            });
            button.mount();
            this.pinButtons.set(item.id, button);
        }
    }

    private listProps(rows: RowSource[] = []): Parameters<ListBoxView<RowSource>["update"]>[0] {
        const traits = createRowTraits((source) =>
            isSection(source) ? undefined : this.pinButtons.get(source.id)?.root,
        );
        return {
            name: "tools-builtin-list",
            items: traited(rows, traits),
            rowHeight: 28,
            whiteSpaceY: 8,
            onChange: (source) => this.handleChange(source),
        };
    }

    private handleChange(source: RowSource): void {
        if (isSection(source)) return;
        source.create();
        this.props.onClose?.();
    }

    protected onDispose(): void {
        for (const button of this.pinButtons.values()) {
            button.dispose();
            button.root.remove();
        }
        this.pinButtons.clear();
    }
}
