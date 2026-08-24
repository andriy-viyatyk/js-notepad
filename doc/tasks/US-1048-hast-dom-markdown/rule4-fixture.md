# Rule 4 fixture — do not edit

This file is the fixed input for EPIC-060's Rule 4 measurement: DOM writes counted by
`MutationObserver` while rendering one markdown document, react-markdown versus the `hast → DOM`
walker. **Editing it invalidates the baseline**, which cannot be retaken once US-1048 lands.

It deliberately contains no mermaid fence. Mermaid renders asynchronously to an image, so including
one would make the count non-deterministic and would measure the mermaid pipeline rather than the
markdown renderer.

## Headings and inline marks

### Third level

Paragraph with **strong**, *emphasis*, `inline code`, a [link](https://example.com), a relative
[repo link](../../architecture/overview.md), and a footnote-ish sup<sup>1</sup>.

Second paragraph so the block sequence is not degenerate. Some `code` again, plus an autolink:
https://example.com/autolink

> A blockquote with **strong** text.
> Second line of the same quote.

---

## Lists

- First bullet
- Second bullet with `code`
  - Nested bullet
  - Another nested bullet
    - Third level
- Third bullet

1. Ordered one
2. Ordered two
   1. Nested ordered
   2. Nested ordered two
3. Ordered three

- [ ] Unchecked task item
- [x] Checked task item
- [ ] Another unchecked task

## Table

| Column | Type | Notes |
|---|---|---|
| `id` | string | primary key |
| `name` | string | display name |
| `count` | number | may be zero |
| `enabled` | boolean | defaults true |

## Fenced code — colorized language

```typescript
export interface Example {
    id: string;
    count: number;
}

export function build(input: Example[]): Map<string, number> {
    const out = new Map<string, number>();
    for (const item of input) {
        out.set(item.id, item.count);
    }
    return out;
}
```

## Fenced code — unrecognized language

```notalanguage
this block should fall through to a plain code element
with two lines
```

## Fenced code — no language

```
plain fence, no language tag
second line
```

## Raw HTML

<div align="center">
  <strong>Raw HTML block</strong> with an inline <code>element</code>.
</div>

Inline raw <b>bold</b> and <em>italic</em> in a paragraph.

## Repetition

The paragraphs below exist only to give the renderer a realistic amount of work, so the count is not
dominated by fixed setup cost.

Paragraph one with some length to it, containing `code` and a [link](https://example.com/one).

Paragraph two with some length to it, containing `code` and a [link](https://example.com/two).

Paragraph three with some length to it, containing `code` and a [link](https://example.com/three).

Paragraph four with some length to it, containing `code` and a [link](https://example.com/four).

Paragraph five with some length to it, containing `code` and a [link](https://example.com/five).

Paragraph six with some length to it, containing `code` and a [link](https://example.com/six).

Paragraph seven with some length to it, containing `code` and a [link](https://example.com/seven).

Paragraph eight with some length to it, containing `code` and a [link](https://example.com/eight).
