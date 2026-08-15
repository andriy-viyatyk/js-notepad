/** Case-insensitive href equality. File paths can reach tree-provider views from the OS with
 * different casing, while selection remains case-insensitive. */
export function sameHref(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}

/** Order-sensitive href-list equality. The final href is the primary selection. */
export function sameHrefs(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((href, index) => href === b[index]);
}

/** Case- and separator-insensitive href form for self/descendant drop guards. */
export function normalizeHref(href: string): string {
    return href.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
