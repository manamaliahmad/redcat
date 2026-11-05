---
name: design-to-site
description: Use after a design.md is approved and the user's inputs (or marked placeholders) exist. Builds the ORIGINAL site from design.md using the pattern map: tokens to CSS, sections in design.md order, user content into slots. Never copies the reference.
---

# Design to Site — design.md plus user inputs to an original site

## Choice rule (hard, never overridden)
This skill gives KNOWLEDGE (flow, rules, formats), never orders. The
MODEL decides the direction, stack, and look from the user's prompt plus
the approved design.md. It never dictates a palette, a font, a layout,
or a template. No skill sentence may force every output to look the same.

## When to use
- design.md is approved AND the collect-inputs reply arrived (or the
  user explicitly said to use placeholders).
- Do NOT use before design.md approval. Do NOT use on a bare URL
  without design.md — that path goes through site-to-design first.

## Flow
1. Read the approved design.md. It is the source of truth for tokens,
   type, layout, section order, components, and motion character.
2. Read references/pattern-map.md. Map each design.md pattern to its
   snippet. Build the page from snippets + tokens + user content.
3. Write tokens to CSS first (:root from design.md section 2). No
   hardcoded colour or font anywhere that is not in design.md.
4. Build sections in design.md order, user content into the slots from
   section 9. Placeholders stay visibly labelled until replaced.
5. Verify (see Check): structure, tokens, responsive, screenshots.
   One fix pass, then publish only on explicit user approval.

## Rules (locked)
- Tokens go to CSS; sections go in design.md order; user content goes
  into slots. Nothing else decides structure.
- A pattern with NO snippet gets a SIMPLE custom build, never complex
  invented code. If a custom build would need a shader, a timeline, or
  a 3D scene the library does not have, build the simple version and
  say so — do not fake the complex one.
- NEVER use the reference's images, copy, logo, brand name, or exact
  pixel copy. NEVER paste reference CSS/HTML. Verify against the
  design.md, never by pixel-diff against the reference.
- Real content only: the user's own copy, numbers, and objects. No
  lorem ipsum. Placeholders only where the user skipped a slot, and
  labelled as placeholders.
- Distinctive fonts, never Arial/Inter/Roboto. No purple-gradient-on-
  white. One bold place per page (the signature element); everything
  else stays quiet.
- Responsive: no horizontal scroll at 400px. prefers-reduced-motion
  respected. Keyboard focus visible.

## Check (before delivery)
- [ ] Section order matches design.md section 5 exactly
- [ ] Every token in CSS comes from design.md; no hardcoded colour/font
- [ ] Every section 9 slot is filled with user content or a labelled placeholder
- [ ] Desktop + mobile screenshots taken; console errors []
- [ ] No horizontal scroll at 400px
- [ ] No reference copy, brand, image, or CSS present
- [ ] Delivery summary lists exactly what is still placeholder

## Verification (how this skill is proven — mock proves loop only)
- Skill-load test (mock): skill_read this skill + a sample design.md
  → section order, tokens, and pattern mapping listed; check report
  clean. Mocks prove the LOOP, never model quality.
- Real-model flow test (after a working key exists): approved design.md
  + real user inputs → original built site → verify screenshots.
  Until that runs, never claim the flow is proven on a real site.
