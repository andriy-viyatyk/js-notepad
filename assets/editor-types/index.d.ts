/* eslint-disable no-var */
import type { Page } from "./page";

declare global {
    interface Window {
        /** Active page object */
        page: Page | undefined;
    }

    /** Active page object */
    const page: Page | undefined;
}

export {};