# Design Spec: <site name — the USER's site, never the reference's brand>
Source: <reference URL> | Date: <date> | Read by: analyze-site.js <run folder>
Confidence: <vision-read | DOM-data only> | Borrowed axis: <exactly one, e.g. density + editorial rhythm>

## 1. Overview
One paragraph: what the USER's site is for, who it serves, and its mood.
(Describe the user's subject, not the reference's business.)

## 2. Color tokens
| token | value | use | evidence |
|---|---|---|---|
| --bg | #000000 | page background | <where seen, e.g. body bg, above fold> |
| --fg | #FFFFFF | body text | <where seen> |
| --accent | #000000 | buttons / calls to action | <where seen> |
| --surface | #000000 | cards / panels | <where seen> |
| --muted | #000000 | secondary text / borders | <where seen> |
Note light/dark behaviour here. Never paste the reference's exact full
palette + type pairing + radius as a set (trade dress). Re-derive at
least one axis from the user's subject and say which one.

## 3. Typography
- Display: <family> <weight>, <case>, <tracking>, size clamp(...)
- Body: <family> <weight range>
- Scale: h1 / h2 / body / label sizes (from the reader's computed data)
- Substitution note: if a font is paywalled, name the freely licensed
  lookalike here and label the substitution.

## 4. Layout system
- Container width, side gutter, grid columns
- Spacing scale (the reader's common values, expressed as multiples)
- Border radius (cards, buttons, images) — roundness is a personality
  scalar (sharp → round), not just pixels
- Whitespace philosophy: tight / balanced / generous (one word + why)

## 5. Sections (top to bottom, in build order)
### 5.1 Hero
- Layout: <e.g. full-height, massive heading, image centre, nav on top>
- Elements: <nav links, h1, tagline, CTA, hero image — as types, not copy>
- Behaviour: <e.g. heading fade-in, image float — qualitative only>
### 5.2 <next section type>
- Layout:
- Elements:
- Behaviour:
(Repeat per section. Section types only — hero, proof, features,
gallery, pricing, footer — never the reference's markup or copy.)

## 6. Components
Button styles, cards, nav, footer, inputs — with states (default, hover,
focus). Patterns in words ("primary action: solid fill, pill radius,
12/24 padding, darkens on hover"), never verbatim HTML/CSS.

## 7. Motion & interaction
- Scroll: <e.g. sticky stacking cards, marquee moves with scroll>
- Hover: <...>
- Libraries detected: <three.js / GSAP / Lenis / Framer Motion / none>
- Motion character: tempo, easing family, "motion only on action".
  Never copy keyframe timelines, GSAP timelines, or scroll choreography.

## 8. Responsive behaviour
What changes at breakpoints (especially 400px mobile): stacking order,
type scale, what hides, what the hero image does. No horizontal scroll
at 400px, ever.

## 9. Required inputs (user must send — drives the collect-inputs message)
| slot | type | required? | default-if-missing |
|---|---|---|---|
| hero_portrait | image (portrait) | yes | marked placeholder silhouette |
| name | text | yes | — (cannot be invented) |
| tagline | text | no | agent draft (labelled draft) |
| about_text | text | no | agent draft (labelled draft) |
| services | 3–5 items | no | marked placeholder (never invented services) |
| project_images | 3–9 images | no | marked placeholders |
| brand_colors | colors | no | this design.md palette |
| logo | image | no | text logo |
Rules: `skip` = marked placeholder/draft. The agent NEVER invents the
user's business facts (services, prices, addresses, numbers) as if real.

## 10. Do / Don't
- Do (the identity to keep): <what makes this design itself>
- Don't copy: <the reference's images, copy, logo, brand, exact pixels>
- Don't default to: <generic tells rejected for this site, e.g. purple
  gradient, Inter, three-card grid, glassmorphism>
- Limits that bit: <bot protection / canvas-only / low-confidence items>
