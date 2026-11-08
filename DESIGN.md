# Design

<!-- impeccable:design-schema 1 -->

## World

**The Markbook.** A staffroom markbook left open on a desk: cool chalk paper, a red marking pen, an ink-blue index, and a bottle-green "solved" stamp. The interface is a register, not a stack of cards. Rules do the structural work; color is reserved for marks, state, and action.

The old warm-cream, rounded-card, offset-shadow, emoji-heavy look is deliberately retired. No gradients, glass, floating pills, or decorative stickers.

## Mode

Operate for the teacher dashboard and student flow. Persuade for the landing page, using the same register grammar rather than a separate marketing costume.

## Typography

- Display and wordmark: **Zilla Slab** 500/600/700. Slab serif with a schoolbook/ledger character; used for page titles, section headings, and the wordmark only.
- UI and body: **Archivo** 400/500/600/700. Workhorse grotesque for labels, buttons, fields, queue text, and prose.
- Data and metadata: **Spline Sans Mono** 400/500/600. Reserved for session codes, counts, timestamps, percentages, URLs, and status labels.
- Fixed rem steps for product surfaces; no fluid heading sizes inside the dashboard.
- Body measure 62–72ch. Display tracking no tighter than -0.03em.

## Color

Light: cool paper, near-black ink, oxblood marking red, ink blue, bottle green.
Dark: deep green-black chalkboard, warm chalk ink, lighter marking red, dusty blue, sage green.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F1EFE8` | `#111512` | Page ground |
| `--surface` | `#FAF9F4` | `#1A201B` | Panels, fields |
| `--paper-deep` | `#E7E4DA` | `#202720` | Recessed rows, rails |
| `--ink` | `#171C18` | `#EDEAE0` | Primary text |
| `--ink-2` | `#3C443D` | `#C8C5B9` | Secondary text |
| `--muted` | `#5D655E` | `#A2A79E` | Metadata |
| `--rule` | `#CEC9BB` | `#343C35` | Hairlines |
| `--rule-strong` | `#A6A294` | `#4D564E` | Strong rules, hover |
| `--accent` | `#9E2B24` | `#F07A6A` | Primary action, active marks |
| `--blue` | `#1F4E86` | `#93B6E6` | Study / accepted |
| `--green` | `#245E45` | `#81C9A4` | Solved / success |
| `--amber` | `#855713` | `#E4B96A` | Review / caution |
| `--red` | `#9E2B24` | `#F07A6A` | Filtered / destructive |
| `--highlight` | `#F0D36A` | `#D8B84A` | One highlighter emphasis |

Color appears in small areas: status squares, marks, active tabs, primary buttons, focus rings. Never as a full card background except the active index tab and the solved answer surface.

## Layout

- Max width 1180px; page gutters `clamp(20px, 4vw, 40px)`.
- Structure with 1px rules, whitespace, and column rhythm. No same-size card grid as page structure.
- Panels may use a 1px border and 2–4px radius; queue entries are ruled rows, not panels.
- A red margin rule (1px) runs down the landing intro and the queue register as the signature notebook cue.
- Desktop dashboard: session header, horizontal index tabs, then a two-column body (register + utility rail).
- The utility rail sticks as one unit on tall desktop viewports; on shorter screens it scrolls with the register.
- Mobile: index tabs become a horizontal strip; utility rail follows the register; no horizontal overflow.

## Components

- **Wordmark:** 34px square, 1.5px ink border, “Dd” in Zilla Slab. No rotation.
- **Top bar:** sticky, paper background, 1px bottom rule. Not a floating pill.
- **Buttons:** 3px radius, 1.5px border, 44px minimum height. Primary = oxblood fill + paper text. Secondary = transparent surface + ink text + rule border. Text actions = underline on hover, no heavy fill.
- **Inputs:** 1px rule, 4px radius, surface fill, 44px minimum. Focus = ink border + 2px blue halo.
- **Mode rows:** stacked radio-like rows with a square mark. Active row = solid ink square with a paper check; no emoji.
- **Index tabs:** four horizontal tabs with label, mono count, and status mark. Active = ink fill + paper text. Status color only in the mark.
- **Queue row:** top rule, 18px left padding, 5px status dot in the margin, name/time/status header, question, reason, optional disclosure, answer form, actions.
- **Disclosure:** dashed top rule, mono summary, chevron. No bordered pill summary.
- **Settings popover:** top-bar “View” button opens a paper panel with one labeled switch. Native `<details>` + checkbox; closes on outside click and Escape.
- **Empty state:** ruled blank register area with a typographic mark and a sentence. No illustration or emoji.

## Settings Toggle

The teacher dashboard has one display setting: **AI filter details**. On (default) shows the per-doubt JEV summary, score chips, filter signals, version, and gate. Off hides that whole disclosure; the status reason remains. The choice persists in `localStorage` under `dd-ai-details` (`1` / `0`) and applies immediately without a reload.

## Motion

- 140–200ms for state transitions; exponential ease-out.
- One authored landing entrance: headline and session slip, staggered 60ms, content visible by default.
- No looping decorative animation. Respect `prefers-reduced-motion`.
- Live queue arrivals use a single short rise; no bouncing.

## Accessibility

- Visible `:focus-visible` rings on every control.
- Switch is a real checkbox with a label; popover closes with Escape.
- Status is never conveyed by color alone: label text and glyph accompany every mark.
- Minimum 44px touch targets.
- Sufficient contrast in both schemes; muted text is not used for essential copy.
