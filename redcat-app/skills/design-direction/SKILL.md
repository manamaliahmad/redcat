---
name: design-direction
description: Use before building any new page or site. Picks palette, fonts, and layout idea from the subject so the design never looks generic.
---

# Design Direction

## When to use
Before every new page or site, before any layout or code is written. For edits,
use it only when the user asks for a new look.

## Steps
1. Write one line from the brief: subject, audience, and the single job of the page.
2. Open references/palettes.md and pick the palette closest to the subject. If
   none fits, build one with the same structure: bg, fg, accent, muted.
3. Open references/font-pairings.md and pick one display + body pair that fits
   the subject and the palette.
4. Write the tokens at the top of the stylesheet in `:root`:
   `--bg, --fg, --accent, --muted, --font-display, --font-body`.
   No hardcoded colours anywhere else on the page.
5. Pick exactly ONE signature moment: a hero demo, one scroll effect, or one
   interaction. Everything else on the page stays calm.
6. Read references/anti-patterns.md once and remove anything on that list from
   the plan before building.

## Rules
- One bold place per page. If two sections compete for attention, calm one down.
- Never use Inter, Space Grotesk, Arial, or Roboto as the default pick. Choose
  a pair from references/font-pairings.md instead.
- No emoji section markers. No decorative dividers that carry no meaning.
- Real subject details only: real units, real terms, real services. Never lorem
  ipsum, never placeholder phone numbers, never filler text.
- Neutrals carry a hue tilt (warm, cool, or green-grey). Never pure grey
  neutrals, never pure black on pure white.
- Body text stays readable: one comfortable measure, balanced headings, at
  least 16px side gutters on mobile.
- If the design would fit any other business unchanged, it is too generic.
  Go back to step 1 and use a detail only this subject has.

## Check (before building starts)
- [ ] One-line subject / audience / job written
- [ ] Palette picked from references/palettes.md (or built in the same shape)
- [ ] Font pair picked from references/font-pairings.md
- [ ] `:root` tokens defined: --bg, --fg, --accent, --muted, --font-display, --font-body
- [ ] Exactly ONE signature moment chosen, rest of the page calm
- [ ] Anti-patterns list checked, none present in the plan
- [ ] No hardcoded colours, no lorem ipsum, no emoji section markers
