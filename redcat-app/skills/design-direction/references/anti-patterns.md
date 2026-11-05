# Anti-patterns (never build these)

Each pattern is a default the model falls back to when it is not thinking
about the subject. If a plan contains one, remove it before building.

## 1. Purple gradient on white
- Pattern: purple-to-blue gradient hero, white cards, generic SaaS look.
- Instead: the subject palette from palettes.md, one accent, flat colour.

## 2. Everything centered
- Pattern: every section centered, every heading centered, every button centered.
- Instead: left-aligned text sections; center only the hero or one statement.

## 3. Identical rounded cards everywhere
- Pattern: the same rounded card, same shadow, same padding for services,
  testimonials, pricing, and gallery.
- Instead: one card style for one job; vary layout by section (list, grid,
  feature row, gallery).

## 4. Decorative particles with no signature moment
- Pattern: floating orbs, particle dust, or a spinning shape behind the hero
  that the user cannot touch or use.
- Instead: exactly ONE playable or interactive moment (a tool the user moves,
  a before/after, a configurator step). Decoration is not a feature.

## 5. Lorem ipsum or filler copy
- Pattern: placeholder text, fake phone numbers, "John Doe" testimonials.
- Instead: real subject details from the brief; if a fact is unknown, ask the
  user or leave that single field clearly marked, never invented.

## 6. Pure grey neutrals
- Pattern: #333 text on #fff, #888 muted, #f5f5f5 backgrounds.
- Instead: neutrals with a hue tilt from palettes.md (warm, cool, green-grey).

## 7. Emoji section markers
- Pattern: emoji bullets, emoji headings, emoji dividers.
- Instead: real icons or typographic hierarchy; emoji only inside user content.

## 8. Default font stack
- Pattern: Inter, Space Grotesk, Arial, or Roboto because nothing was chosen.
- Instead: a pair from font-pairings.md, chosen for the subject.

## 9. More than three moving elements
- Pattern: animated hero + marquee + hover everywhere + scroll parallax all
  at once.
- Instead: one signature motion; the rest of the page is still. Motion has
  numbers (duration, easing) and a reduced-motion fallback.

## 10. Muted text with low contrast
- Pattern: light grey body text on white, or accent text on accent background.
- Instead: body text near the fg token; muted is for labels and captions only.

## 11. Generic stock hero
- Pattern: a stock photo or gradient that could belong to any business.
- Instead: a subject detail in the hero (the service, the place, the craft).

## 12. Same layout as the last site
- Pattern: hero + services grid + testimonials + footer, in the same order,
  with the same spacing, for every business.
- Instead: start from the one-line subject/audience/job and let the order
  follow the job (booking first for a salon, menu first for a restaurant).
