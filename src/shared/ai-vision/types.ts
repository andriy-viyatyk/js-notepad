/**
 * AiVision — the interface an object in the app object model implements to describe itself to an
 * AI agent. See doc/epics/EPIC-083.md, design decisions 1, 4 and 7.
 *
 * Shared between processes: the renderer's script wrappers implement it, and so do the
 * main-process nodes (`windows`, `main`). Nothing here may import from either process.
 *
 * Two halves per node:
 * - the *kind-level* shape (`kind`, `summary`, `members`, `help`) — the same for every instance,
 *   cheap, and deduplicated per MCP session by `kind`;
 * - the *instance-level* shape (`children()`, `restricted()`, `index()`, `summarize()`) — what
 *   exists under this node right now. The object enumerates it itself and is responsible for doing
 *   so without side effects; the resolver never probes getters it was not asked for.
 */

export interface IAiMember {
    readonly name: string;
    readonly kind: "property" | "method";
    /** One sentence for the member list. */
    readonly summary: string;
    /** Methods: one-line signature, e.g. `addRows(count = 1, insertIndex?: number)`. */
    readonly signature?: string;
    /** A getter with side effects or a destructive method; the hint prints it as a warning. */
    readonly caution?: string;
    /** Properties only: the agent may assign to it via the `value` parameter. */
    readonly writable?: boolean;
    /**
     * The value is itself an AiVision node; `helpSearch` may follow this property. Says that
     * *reading* it is safe — independent of `caution`, which describes what its members do.
     * Never set it on a getter with side effects (see `Page.grouped`).
     */
    readonly node?: boolean;
}

export interface IAiElementDeclaration {
    readonly name: string;
    readonly purpose: string;
    readonly selector?: string;
}

export interface IAiElement {
    readonly name: string;
    readonly purpose: string;
    readonly selector: string;
    readonly visible: boolean;
}

export interface IAiChild {
    /** The segment to append to the parent's path: `[2]`, `["<id>"]`, `.grouped`, `.asGrid()`. */
    readonly segment: string;
    readonly kind: string;
    readonly summary: string;
    /** Present when the child's `restricted()` returns text — listed, but nothing under it resolves. */
    readonly restricted?: string;
}

export interface IAiVisionDescriptor {
    /** Stable type name — the hint-dedupe key. E.g. "Page", "Pages", "GridEditor". */
    readonly kind: string;
    /** One sentence shown wherever this node is listed. */
    readonly summary: string;
    /** Static members the agent may name in a path. Never produced by reflection. */
    readonly members: readonly IAiMember[];
    /** Long-form guidance returned for `<path>.$help`. */
    readonly help?: string | (() => string);
    /** Dynamic children that exist right now. Must be cheap and side-effect free. */
    children?(): readonly IAiChild[];
    /**
     * When this returns text the node is listed and summarised, and `$help` works, but nothing
     * under it resolves — the resolver answers with the text. Instance-level by design: the
     * condition depends on state (a private browser page, a disabled setting), not on the class.
     */
    restricted?(): string | undefined;
    /** Makes the node indexable: `pages[2]`, `pages["<id>"]`. Return `undefined` for "no item". */
    index?(key: string | number): unknown;
    /** Values for advertised members the target object does not itself implement. */
    provide?(name: string): { value: unknown } | undefined;
    /**
     * Curated on-screen controls this node owns, for `helpSearch` to index by purpose — so
     * "where do I change the language" finds the control and not only the API that sets it.
     * Search metadata only: the live `elements` value and `highlight` come from `provide`.
     */
    readonly elements?: readonly IAiElementDeclaration[];
    /** JSON-able summary of the instance for result shaping. Default: `{ kind }`. */
    summarize?(): unknown;
}

export interface IAiVisible {
    readonly aiVision: IAiVisionDescriptor;
}

export function isAiVisible(value: unknown): value is IAiVisible {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
    const descriptor = (value as { aiVision?: unknown }).aiVision;
    return !!descriptor && typeof descriptor === "object" && typeof (descriptor as IAiVisionDescriptor).kind === "string";
}

// ── Registry for objects we do not own ──────────────────────────────────────────────────────────
// A descriptor factory keyed by constructor, consulted when an instance carries no `aiVision` of
// its own. Lets plain classes (or third-party values) join the tree without being modified.

type Constructor = abstract new (...args: never[]) => unknown;
type DescriptorFactory = (instance: unknown) => IAiVisionDescriptor;

const registry = new Map<Constructor, DescriptorFactory>();
const instanceRegistry = new WeakMap<object, DescriptorFactory>();

export function registerAiVision(ctor: Constructor, describe: DescriptorFactory): void {
    registry.set(ctor, describe);
}

export function registerAiVisionFor(instance: object, describe: DescriptorFactory): void {
    instanceRegistry.set(instance, describe);
}

/** The descriptor for a value: its own `aiVision`, else the registry (walking the prototype chain). */
export function getAiVision(value: unknown): IAiVisionDescriptor | undefined {
    if (isAiVisible(value)) return value.aiVision;
    if (!value || typeof value !== "object") return undefined;
    const instanceFactory = instanceRegistry.get(value);
    if (instanceFactory) return instanceFactory(value);
    if (registry.size === 0) return undefined;
    let proto = Object.getPrototypeOf(value) as object | null;
    while (proto && proto !== Object.prototype) {
        const factory = registry.get(proto.constructor as Constructor);
        if (factory) return factory(value);
        proto = Object.getPrototypeOf(proto) as object | null;
    }
    return undefined;
}
