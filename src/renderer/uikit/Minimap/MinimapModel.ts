import { TComponentModel } from "../../core/state/model";

export const defaultMinimapState = {
    indicatorTop: 0,
    indicatorHeight: 0,
    isDragging: false,
};

export type MinimapState = typeof defaultMinimapState;

export interface MinimapModelProps {}

export interface MinimapGeometryInput {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    wrapperHeight: number;
    wrapperScrollHeight: number;
    mirrorHeight: number;
}

export interface MinimapLayout {
    scaledContentHeight: number;
    indicatorTop: number;
    indicatorHeight: number;
    wrapperScrollTop: number;
}

export interface DragGeometryInput {
    scrollHeight: number;
    wrapperHeight: number;
    wrapperScrollHeight: number;
    mirrorHeight: number;
}

export interface BackgroundClickInput {
    clickY: number;
    indicatorHeight: number;
    scrollHeight: number;
    mirrorHeight: number;
}

export class MinimapModel extends TComponentModel<MinimapState, MinimapModelProps> {
    private readonly BASE_SCALE = 0.15;
    private startY = 0;
    private startContainerTop = 0;

    getScale = (mirrorHeight: number, scrollHeight: number): number => {
        if (!scrollHeight) return this.BASE_SCALE;
        return mirrorHeight / scrollHeight;
    };

    syncGeometry = (input: MinimapGeometryInput): MinimapLayout => {
        const effectiveScale = this.getScale(input.mirrorHeight, input.scrollHeight);
        const scaledContentHeight = input.scrollHeight * effectiveScale;
        const indicatorHeight = input.clientHeight * effectiveScale;
        const indicatorTop = input.scrollTop * effectiveScale;

        this.state.update((state) => {
            state.indicatorTop = isNaN(indicatorTop) ? 0 : indicatorTop;
            state.indicatorHeight = isNaN(indicatorHeight) ? 0 : indicatorHeight;
        });

        let wrapperScrollTop = 0;
        if (scaledContentHeight > input.wrapperHeight) {
            const maxMainScroll = input.scrollHeight - input.clientHeight;
            const maxMiniScroll = scaledContentHeight - input.wrapperHeight;
            const scrollRatio =
                maxMainScroll > 0 ? input.scrollTop / maxMainScroll : 0;
            wrapperScrollTop = scrollRatio * maxMiniScroll;
        }

        return {
            scaledContentHeight,
            indicatorTop,
            indicatorHeight,
            wrapperScrollTop,
        };
    };

    beginDrag = (clientY: number, sourceScrollTop: number): void => {
        this.startY = clientY;
        this.startContainerTop = sourceScrollTop;
        this.state.update((state) => {
            state.isDragging = true;
        });
    };

    getDragScrollTop = (clientY: number, input: DragGeometryInput): number => {
        const dy = clientY - this.startY;
        const effectiveScale = this.getScale(input.mirrorHeight, input.scrollHeight);
        const wrapperScale = input.wrapperScrollHeight
            ? input.wrapperHeight / input.wrapperScrollHeight
            : 1;

        return this.startContainerTop +
            (dy / wrapperScale / effectiveScale) * 1.15;
    };

    endDrag = (): void => {
        this.state.update((state) => {
            state.isDragging = false;
        });
    };

    getBackgroundScrollTop = (input: BackgroundClickInput): number => {
        const effectiveScale = this.getScale(input.mirrorHeight, input.scrollHeight);
        return (input.clickY - input.indicatorHeight / 2) / effectiveScale;
    };
}
