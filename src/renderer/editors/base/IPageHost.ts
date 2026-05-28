/**
 * Forward-declared minimal interface for what the v4 `EditorModel.page`
 * reference exposes. Lets EditorModel land before the v4 PageModel exists
 * (US-548 implements this). US-548 widens as needed.
 */
export interface IPageHost {
    readonly id: string;
}
