# myHealthLog — Design System

The visual language for the app. Direction: **Warm Human** (design sample 08).
Register: **product** — the design serves the record, it is not the product itself.

The brief for this direction, in one line: *soft coral and sand, rounded, approachable —
for a system people use every day, not only in a crisis.*

> **The trap this direction has to dodge.** Warm sand + coral is the single most common
> palette in AI-generated design right now, and "warm-rounded wellness" is the reflex a
> health brief pulls toward. So the warmth here is carried by **surface, radius and voice** —
> never by the tells. No floating blobs. No gradient washes. No breathy rounded display face.
> No illustration filler. No drop in data density. The record stays dense and legible; the
> softness is in the container, not the content. If a screen starts to look like a wellness
> landing page, it has failed.

---

## 1. Color

OKLCH throughout. Tokens live in `frontend/src/index.css` under `@theme` as `--color-mhl-*`,
which generate Tailwind utilities (`bg-mhl-surface`, `text-mhl-ink`, `border-mhl-rule`, …).

### Surfaces & ink

| Token | OKLCH | Role | Contrast |
|---|---|---|---|
| `mhl-bg` | `0.945 0.023 74` | app background — warm sand | — |
| `mhl-surface` | `0.995 0.005 74` | cards, sheets — near-white | — |
| `mhl-sunk` | `0.965 0.016 74` | rows, wells, inputs — recessed | — |
| `mhl-rule` | `0.885 0.020 66` | 1px borders, dividers | — |
| `mhl-ink` | `0.245 0.022 48` | primary text | 16.1:1 on surface |
| `mhl-muted` | `0.470 0.028 48` | secondary text, leads | 6.8:1 on surface |
| `mhl-faint` | `0.525 0.028 48` | captions, meta on sand | 5.4:1 surface · 4.6:1 bg |

`mhl-faint` is the floor — nothing lighter carries text. There is no light-gray-for-elegance
tier; that is the biggest reason AI health UIs read as hard to use.

### Accent & status

| Token | OKLCH | Role |
|---|---|---|
| `mhl-accent` | `0.545 0.160 30` | coral — the one accent; passes 5.3:1, usable as text |
| `mhl-accent-strong` | `0.475 0.150 30` | pressed / hover coral |
| `mhl-accent-lo` | `0.955 0.030 30` | coral tint — "watch" / due backgrounds |
| `mhl-good` | `0.465 0.105 152` | green — in-range, resolved, done |
| `mhl-good-lo` | `0.945 0.045 152` | green tint background |
| `mhl-danger` | `0.525 0.180 25` | severe / anaphylaxis on light surfaces |
| `mhl-danger-lo` | `0.955 0.035 25` | danger tint background |

**Color strategy: Restrained.** Warm neutrals carry the surface; coral is the single accent and
stays under ~10% of any screen. Coral marks the one thing that wants attention (a due dose, the
primary action) — spend it there and nowhere else.

**Never color-only.** Severity, status, and alerts always carry a text label (and, for
severe/anaphylaxis, a weight or icon change) so the meaning survives color-blindness and grayscale
print. Weight follows clinical consequence, not decoration.

### The emergency register (inverts)

The emergency band is the design centre and the one surface a stranger reads in seconds. It does
**not** share the warm palette: it inverts to near-black at maximum contrast, no rounding softness
inside, no blur, ever, in any profile.

| Token | OKLCH | Role |
|---|---|---|
| `mhl-emerg` | `0.185 0.020 48` | near-black ground |
| `mhl-emerg-ink` | `0.975 0.004 74` | primary text on emerg (≈17:1) |
| `mhl-emerg-muted` | `0.785 0.014 74` | secondary text on emerg |
| `mhl-emerg-faint` | `0.735 0.012 74` | footnote on emerg |
| `mhl-emerg-amber` | `0.845 0.095 40` | section header ("show this") |
| `mhl-emerg-alert` | `0.775 0.150 28` | "Do not administer" label |

Emergency text targets WCAG AAA (≥7:1); everything else targets AA (≥4.5:1 body, ≥3:1 large).

---

## 2. Typography

**One family, multiple weights: Hanken Grotesk** (400 / 500 / 600 / 700), loaded from Google Fonts
with a system-sans fallback. Humanist grotesque — warm and approachable without being childish,
highly legible at small sizes, and it ships true **tabular figures** (`tabular-nums`) that the
sample relies on for vitals, dosages and dates. If the webfont fails, the stack falls back to the
platform sans the sample was designed against, so nothing breaks.

No second display face. Hierarchy comes from weight, size and color — not from a decorative face.

### Scale (`--text-mhl-*`)

| Token | Size | Line-height | Use |
|---|---|---|---|
| `text-mhl-fine` | 0.845rem / 13.5px | 1.45 | meta, captions, tags, labels |
| `text-mhl-body` | 0.969rem / 15.5px | 1.55 | default body |
| `text-mhl-lead` | 1.094rem / 17.5px | 1.40 | section titles, emphasis |
| `text-mhl-title` | 1.313rem / 21px | 1.30 | card / name titles |
| `text-mhl-answer` | 1.625rem / 26px | 1.25 | the daily "answer" line |
| `text-mhl-figure` | 2rem / 32px | 1.05 | large vital numbers |

Headings: weight 600, `tracking-[-0.018em]`, `text-wrap: balance`. The figure size tightens to
`tracking-[-0.034em]`. Body prose caps at ~65ch; single-column reading width is ~38rem.

**Do not:** accent one word in a heading in coral or italic; set labels in ALL-CAPS (except the
two emergency labels, which are functional, not decorative); add a mono face for data labels
(tabular Hanken already does that job); append "→" to links.

---

## 3. Layout

Mobile-first, thumb-first — the scene is "a kitchen table after breakfast, phone in one hand."

- **Reading column:** `max-width: 38rem`, centered. Long content never exceeds it.
- **Navigation:** a **bottom tab bar** on mobile (Home · Records · **Add** · Timeline · Profile,
  with Add as the one coral target), promoting to a **left rail** from `md` up. Content stays in
  the centered column on desktop rather than stretching into a dashboard grid — this is a record
  you read, not a console you monitor.
- **Sections are question-headed.** Every section leads with the plain-language question it answers
  ("What do I take today?", "What am I being treated for?"). This is direction 08's signature and
  the hook Phase 5's mode engine later rewrites. In Phase 1 the questions are static.
- **Cards, used sparingly.** The section container is a card (surface, 1px rule, `rounded-mhl`).
  Inside, rows sit on `mhl-sunk` wells (`rounded-mhl-sm`) — one level of nesting, never two.
- Radii: `--radius-mhl` 1.25rem (cards), `--radius-mhl-sm` 0.75rem (rows/inputs), `9999px` (pills,
  avatars). Spacing rhythm: 1rem gap between sections, 1.25rem card padding (1.5rem comfortable).

Alignment: left-aligned throughout. Numbers align right in rows and use tabular figures.

---

## 4. Components (conventions)

- **Button** — three intents: `primary` (coral fill, white text), `secondary` (surface, rule
  border), `ghost` (text only). One pill radius, min-height 2.75rem (44px tap target), 48px in
  comfortable/elderly density.
- **Field** — label above, input on `mhl-sunk` with a rule border, help/error below. Focus ring is
  coral. Errors are stated plainly ("Enter the email you signed up with"), never color-only.
- **Tag** — severity/status pill. `ok`→good tint, `watch`→coral tint, `due`→coral fill,
  `severe`→danger tint + bold, `anaphylaxis`→danger fill + white. Always carries its word.
- **Section** — the question-headed card: `<h3>` question, optional lead line, then content.
- **EmptyState** — an invitation, not an apology: one line of what this is + the action to add the
  first record. Lives on a `mhl-sunk` well.
- **EmergencyCard** — the inverted block. Fixed structure: "show this" header, name + vitals row
  (blood, genotype), "Do not administer" list. Never softens, never blurs, in any state.

---

## 5. Motion

Sparing and intentional; it answers an action, it does not decorate. Easing `--ease-mhl`
`cubic-bezier(0.22, 1, 0.36, 1)`, ~220ms. Legitimate uses: sheet/dialog open, list reorder on mode
change (Phase 5), a due-dose progress fill, a saved-confirmation. No page-load fade-and-slide on
every section, no hover lift on every card. Every transition has a `prefers-reduced-motion`
fallback (crossfade or instant). Content is visible by default — never gated behind a reveal.

---

## 6. Accessibility floor (non-negotiable)

- Contrast: AA everywhere, AAA (≥7:1) on the emergency surface.
- Visible keyboard focus (coral `:focus-visible` outline) on every interactive element.
- Tap targets ≥44px (≥48px in comfortable density).
- Meaning never by color alone.
- Clinical facts render visible by default — nothing important is hidden behind a hover or an
  expand.
- `prefers-reduced-motion` respected globally.

---

## 7. Voice

Plain, grounded, unfussy — the target feeling is *relief*. Sentence case. Name things as the user
understands them ("What do I take today?", not "Medication Adherence Module"). Actions say what
they do and keep the name through the flow ("Add allergy" → "Allergy added"). Empty and error
states give direction, not mood. Copy is part of the design here, not filler.
