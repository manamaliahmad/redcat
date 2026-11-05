# Pattern Map — design.md pattern to snippet

Read the design.md, find the pattern in words, use the snippet. If a
pattern has no row here, build it SIMPLE (design-to-site skill rule)
and note the gap — never invent complex code to fill it.

| design.md says (pattern in words) | snippet / recipe to use | notes |
|---|---|---|
| marquee, scroll moves | components/Marquee | text or logo strip driven by scroll; keep it CSS/GSAP, no canvas |
| sticky stacking cards | components/StackingCards | cards stack and pin on scroll; one stack per page at most |
| char-by-char text reveal | components/AnimatedText | split heading into chars, stagger in; respect reduced motion |
| 3D depth portrait | recipes/depth-portrait-scroll | user photo centre hero, depth displacement + scroll camera; needs photo + depth map, else flat-tilt path |
| fade-in on scroll | components/FadeIn | intersection reveal, ~200–300ms ease-out; the default motion |
| scroll camera path | recipes/depth-portrait-scroll (scroll camera) | camera travels a path between sections; only when a 3D scene exists |
| particle field | components/Particles (lite) | capped particle count, mobile lite mode; never full-screen heavy |
| image grid / gallery | components/Grid | user images only, never reference images |
| pricing / service list | components/PriceList | user-supplied prices only; skipped slots stay placeholders |

## Mapping rules
- Match on meaning, not on exact wording. "Ticker that slides as you
  scroll" is a marquee. "Cards that pile up" is stacking cards.
- One signature pattern per page at most. Everything else uses
  FadeIn or stays still. Boldness in exactly one place.
- A pattern the user asked for but the library lacks is a SIMPLE
  custom build, stated as such in the delivery summary.
- Snippets are starting points, not finished designs: tokens, copy,
  and spacing always come from the design.md, never from the snippet.
