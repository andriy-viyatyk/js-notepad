import { IAiChild, IAiMember, IAiVisionDescriptor } from "./types";
import { joinChildPath } from "./path-parser";

/**
 * Hint text for a node. Two parts, matching the descriptor's two halves (EPIC-083, decision 4):
 * the kind-level member list (deduped per session by the caller) and the instance-level children
 * list (always shown, because it is what exists right now).
 */

export interface IHint {
    kind: string;
    text: string;
}

export function formatChildren(path: string, children: readonly IAiChild[]): string {
    if (children.length === 0) return "";
    const lines = children.map(child => {
        const line = `  ${joinChildPath(path, child.segment)} — ${child.kind}: ${child.summary}`;
        return child.restricted ? `${line} [restricted: ${child.restricted}]` : line;
    });
    return `children (live):\n${lines.join("\n")}`;
}

export function formatMember(member: IAiMember): string {
    const name = member.kind === "method" ? (member.signature ?? `${member.name}()`) : member.name;
    const flags: string[] = [];
    if (member.writable) flags.push("writable");
    if (member.caution) flags.push(`CAUTION: ${member.caution}`);
    const suffix = flags.length ? ` [${flags.join("; ")}]` : "";
    return `  ${name} — ${member.summary}${suffix}`;
}

export function formatMembers(members: readonly IAiMember[]): string {
    if (members.length === 0) return "";
    return `members:\n${members.map(formatMember).join("\n")}`;
}

/**
 * Build the hint returned alongside a result.
 * @param includeMembers false once the session has already seen this kind's member list.
 */
export function buildHint(
    path: string,
    descriptor: IAiVisionDescriptor,
    includeMembers: boolean,
): IHint {
    const parts: string[] = [`${descriptor.kind} — ${descriptor.summary}`];
    const restricted = descriptor.restricted?.();
    if (restricted) parts.push(`restricted: ${restricted}`);
    const children = descriptor.children?.() ?? [];
    const childrenText = formatChildren(path, children);
    if (childrenText) parts.push(childrenText);
    if (includeMembers) {
        const membersText = formatMembers(descriptor.members);
        if (membersText) parts.push(membersText);
        parts.push(`Details: call with path "${path ? `${path}.$help` : "$help"}".`);
    }
    return { kind: descriptor.kind, text: parts.join("\n") };
}

/** The full `$help` rendering: long-form help, then members, then live children. */
export function buildHelp(path: string, descriptor: IAiVisionDescriptor): string {
    const parts: string[] = [`${descriptor.kind} — ${descriptor.summary}`];
    const help = typeof descriptor.help === "function" ? descriptor.help() : descriptor.help;
    if (help) parts.push(help.trim());
    const membersText = formatMembers(descriptor.members);
    if (membersText) parts.push(membersText);
    const childrenText = formatChildren(path, descriptor.children?.() ?? []);
    if (childrenText) parts.push(childrenText);
    return parts.join("\n\n");
}
