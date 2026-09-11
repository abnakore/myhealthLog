# Product

## Register

product

## Users

**Primary — the record owner.** A Nigerian adult managing their own health across
fragmented care: several hospitals, no shared records, paper folders that get lost. Often on a
mid-range Android phone, on mobile data, indoors under artificial light. They are not in a
"health journey"; they are doing admin they'd rather not do. Sessions are short and
task-shaped: log a reading, check when the next appointment is, find out which drug they react
to.

**Secondary — the care proxy.** An adult child or spouse managing someone else's record: an
elderly parent, a child, a patient who can't operate an app. They are tired, it's late, and
they are checking one specific thing on someone else's behalf.

**Tertiary — the emergency reader.** A doctor or EMT who has never seen this interface before,
is standing up, possibly outdoors in daylight, and has under a minute. They did not install
anything, did not log in, and will never return. This user cannot be trained, cannot be
onboarded, and cannot ask for help.

That third user is the hardest constraint in the product and the one most likely to be
designed away. Anything that serves them badly is wrong regardless of how good it looks.

## Product Purpose

myHealthLog is a personal health record that stays useful in the two situations existing PHRs
handle worst: an emergency where nobody can log in, and a change of health context where the
same generic dashboard stops being the right one.

Success is not engagement. Success is:

- An EMT reads the critical facts correctly on first sight, with no instruction.
- A user in a new health situation finds their interface already reorganised around it.
- A proxy manages a dependent's record without ever holding their password.
- A record moves to another system without being retyped.

## Brand Personality

**Composed, plain-spoken, unhurried.** The voice of a competent person who has done this
before and isn't going to alarm you. It states facts and their dates. It does not congratulate,
does not gamify, does not use exclamation marks, and never describes a medication as a "win".

Three words: **clear, grounded, unfussy.**

The emotional target is not delight. It is *relief* — the feeling that the thing you needed
was already where you looked.

## Anti-references

- **Fintech / crypto dashboards** (user-specified). No dark navy chrome, no neon accent
  charts, no dense metric-tile grids, no trading-terminal density. Health data is not a
  portfolio and must never be framed as performance.
- **The category reflex.** Cyan-to-blue gradients, stethoscope iconography, generic
  "health tech" chrome. If the palette is guessable from the word "health", it's the first
  training-data reflex and it's out.
- **The second-order reflex.** Avoiding clinical blue by landing on wellness pastel — soft
  sage, blush, breathy rounded type, floating blobs — is the same failure one tier deeper.
  This is a medical record, not a mood.
- **Achievement framing.** Streaks, badges, adherence scores presented as grades. A missed
  dose is information, not a failure state to be scolded about.

## Design Principles

1. **The emergency view is the design centre, not a feature page.** It is read once, by a
   stranger, under pressure. Every material decision — contrast, type size, colour, blur — is
   tested against that screen first. If a material fails there, it does not become the house
   style.

2. **Adaptation must be legible as a mechanism.** Condition-aware modes are the product's
   actual contribution, so the user should be able to see *that* the interface adapted and
   *why*. A silent reflow reads as a bug. Modes announce themselves once, plainly, and are
   always reversible.

3. **Accessibility is a feature here, not a compliance floor.** Elderly Care Mode ships larger
   type and simpler navigation as a product promise. A visual language that only works at 14px
   in high contrast has already broken that promise. Design at the accommodating end and let
   the compact end be the variant.

4. **Weight follows clinical consequence.** An anaphylactic allergy outranks a weight log,
   permanently and visibly. Visual hierarchy encodes medical severity — not recency, not
   engagement, not what has the nicest chart.

5. **Assume the network fails and the device is cheap.** No decorative payload on the critical
   path. Motion is transform and opacity. The record renders before anything ornamental
   arrives, and remains correct if it never does.

## Accessibility & Inclusion

- **WCAG 2.2 AA minimum, AAA on the emergency view.** Body text ≥ 4.5:1; the emergency
  projection targets ≥ 7:1 because it may be read in direct sunlight on a cracked screen.
- **Elderly Care Mode is a first-class accessibility surface**: ≥ 1.25× type scale, ≥ 48px tap
  targets, reduced navigation depth. Where modes conflict, accessibility hints escalate and
  never degrade.
- **Reduced motion is mandatory**, not an afterthought: every transition has a crossfade or
  instant equivalent under `prefers-reduced-motion: reduce`.
- **Never colour-only.** Severity, status and mode state must also carry text, icon, or
  position. Assume deuteranopia and assume greyscale printing.
- **Content renders visible by default.** No reveal animation gates the display of a clinical
  fact — a transition that fails must leave the record readable, not blank.

## Constraints on materials

Recorded here because they were decided deliberately, not by taste:

- **No WebGL.** Three.js / shader gradients are excluded: they contradict the low-resource
  positioning the project's novelty argument rests on, and they cost frames on the target
  device. Motion is CSS/SVG, orchestrated with GSAP or Motion where sequencing warrants it.
- **Glass on transient layers only.** Backdrop blur is permitted on things that float and
  dismiss — mode switcher, sheets, command palette, toasts. It is banned on the emergency
  projection and in Elderly Care Mode, where legibility is the product.
