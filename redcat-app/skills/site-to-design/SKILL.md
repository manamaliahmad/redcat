---
name: site-to-design
description: Use when the user pastes a website URL and asks for a site like it, in that style, or inspired by it. Reads the reference with the analyze-site script and writes a fixed-schema design.md that later drives an ORIGINAL build. Never copies code, copy, images, or brand assets.
---

# Site to Design — reference URL to design.md

## Choice rule (hard, never overridden)
This skill gives KNOWLEDGE (flow, rules, formats), never orders. The MODEL
decides the direction, stack, and look from the user's prompt plus the
reference. It never dictates a palette, a font, a layout, or a template.
No skill sentence may force every output to look the same.

## When to use
- User pastes a URL and says "like this", "in this style", "inspired by
  this", "this feel", and wants a site built from that direction.
- User pastes a URL plus their own brief (business, content, audience).
- Do NOT use for: "copy this site", "download this site's code", "take
  this site's images" — those are refused, politely, with the
  original-direction offer instead (see reference-url skill, Refuse list).

## Flow
1. **Run the reader (deterministic script, never the model).**
   `node analyze-site.js <url>` from the project root. It writes a run
   folder under `runs/refflow/` with `analysis.json` + screenshots.
   Read that JSON, do not re-scrape by hand. If the script refuses
   (robots.txt, login page), say so plainly and stop — never bypass it.
2. **Read the screenshots with a vision-capable model when one is
   available.** Screenshots carry layout, mood, and density that DOM data
   cannot. When only a text-only model is available, say so in the
   design.md header (confidence: DOM-data only) and lean on computed
   values, never on guessed visuals.
3. **Write design.md from references/design-md-template.md.**
   Fill every section. One axis of borrowing at most (see reference-url
   skill, abstraction ladder L0–L4). Section 9 (Required inputs) is
   mandatory — it drives the collect-inputs message.
4. **Show the design.md to the user and get approval** before any build
   step. The user corrects it in words; the model revises the doc, not
   the code, until it is approved.

## What the reader gives you (and what it does not)
- Gives: desktop + mobile scroll screenshots, computed fonts/colours/
  spacing/radii, section list, library detection, canvas presence,
  qualitative motion sampling (transform/opacity at 3 scroll positions).
- Does NOT give: keyframe timelines, GSAP timelines, shader code, 3D
  models, or anything behind a login. Motion is described qualitatively
  ("slow fade on scroll, ~300ms ease-out feel") and re-invented
  originally. A canvas/WebGL scene is described from its screenshot only
  ("a floating 3D object over a dark hero") and matched to the nearest
  recipe — never rebuilt pixel-for-pixel.

## Originality rules (locked — same as reference-url skill)
- Learn the design SYSTEM and layout only. NEVER use the reference's
  images, copy, logo, brand name, or exact pixel copy.
- L0 Literal is FORBIDDEN: same layout + same copy + same images +
  same CSS as a set (that combination is its trade dress).
- Climb the ladder: L1 tokens (roles, never the exact full set) →
  L2 patterns in words → L3 principles/mood → L4 subject-derived
  reinterpretation (the USER's world, materials, objects, workflow).
- Selective borrowing: exactly ONE axis from the reference. If the user
  gives no axis, state your own choice in the design.md and let the user
  correct it in words.
- No asset downloads, ever. No CSS/HTML pasted. No pixel-diff
  verification against the reference (a pixel diff rewards copying).
  Verify the built site against the design.md, never against the
  reference.

## Section 9 rules (Required inputs — drives collect-inputs)
- Every slot the reference filled with real content becomes a row:
  slot | type | required? | default-if-missing.
- `required: yes` only for slots without which the site cannot be
  itself: hero portrait/photo and name. Everything else is optional.
- `skip` means a MARKED placeholder/draft, never an invented fact.
  The agent must NEVER invent the user's business facts (services,
  prices, addresses, numbers) as if real. A tagline draft is fine;
  prices and services are not. Placeholders are labelled in the built
  site until the user replaces them.
- Brand colours / logo: optional. When missing, use the design.md
  palette and a text logo, and say so.

## Limits (say these plainly when they bite — flag, don't force)
- Bot-protected pages, paywalled fonts, cross-origin stylesheet rules:
  computed styles suffice for tokens; if confidence is low, say so and
  ask the user which page or element matters.
- JS/scroll-driven/timeline animation cannot be read reliably.
- Hover/focus/active states only if deliberately triggered.
- Dark mode: pin to light unless the user asks for dark.
- Homepage first; spot-check up to 2 inner pages. If pages disagree
  wildly, ask the user which page is canonical — do not guess.

## Check (before handing design.md to the user)
- [ ] Every template section is filled, none left as a heading only
- [ ] Section 9 exists with type / required? / default for every slot
- [ ] No reference copy, brand name, image, or CSS pasted anywhere
- [ ] Exactly one borrowed axis is named, and what was re-derived is named
- [ ] Confidence is stated (vision-read vs DOM-data only)
- [ ] Limits that bit are listed, not hidden

## Verification (how this skill is proven — mock proves loop only)
- Skill-load test (mock): skill_read this skill → run analyze-site.js
  on a public page → design.md from the template → check report:
  analysis.json exists, shots > 0 per viewport, no login/robots
  refusal on a public page. Mocks prove the LOOP, never model quality.
- Real-model flow test (after a working key exists): a real pasted URL
  → real design.md with evidence → user approval → original built site.
  Until that runs, never claim the flow is proven on a real site.
