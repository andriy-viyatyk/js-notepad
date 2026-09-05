import { pagesModel } from "../../api/pages";

const PAGE_LAYOUT_ATTEMPTS = 120;

/** Build the common page identity selector used by every page-owned element. */
export function pageScopeSelector(pageId: string): string {
    return `[data-page-id=${JSON.stringify(pageId)}]`;
}

function hasLayoutBox(element: HTMLElement): boolean {
    const rectangle = element.getBoundingClientRect();
    return rectangle.width > 0 && rectangle.height > 0;
}

function waitForPageSlot(pageId: string): Promise<void> {
    const selector = `${pageScopeSelector(pageId)}[data-name="page-slot"]`;
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = (): void => {
            attempts += 1;
            const slot = document.querySelector<HTMLElement>(selector);
            if (slot && hasLayoutBox(slot)) {
                resolve();
                return;
            }
            if (attempts >= PAGE_LAYOUT_ATTEMPTS) {
                reject(new Error(`Page ${JSON.stringify(pageId)} did not become visible.`));
                return;
            }
            requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
    });
}

/** Activate one page and wait until its retained slot has a rendered rectangle. */
export async function activatePageAndWaitForLayout(pageId: string): Promise<void> {
    pagesModel.showPage(pageId);
    await waitForPageSlot(pageId);
}
