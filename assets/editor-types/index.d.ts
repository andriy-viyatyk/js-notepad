/* eslint-disable no-var */
import type { Page } from "./page";

declare global {
    interface Window {
        page: Page | undefined;
    }

    const page: Page | undefined;
}

export {};