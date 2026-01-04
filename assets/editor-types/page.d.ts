export interface Page {
    /** get or set text content of the page */
    content: string;
    /** get grouped page
     * If the page is not grouped, creates and groups new text page
     */
    grouped: Page | undefined;
    /** get or set language of the page. Language that compatible with monaco editor */
    language: string;
    /**
     * Custom data storage for scripts.
     * 
     * Scripts can store arbitrary values in this object. The data persists
     * in the page state and remains available across multiple script executions.
     */
    data: Record<string, any>;
}