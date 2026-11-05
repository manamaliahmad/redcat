---
name: reference-url
description: Use when the user pastes a website URL they admire and asks for a site like it, in that style, or inspired by it. Turns the reference into an ORIGINAL site in that direction. Never copies code, copy, images, or brand assets.
---

# Reference URL — from admiration to original direction

## Choice rule (hard, never overridden)
The MODEL decides the direction, stack, and look from the user's prompt plus the reference.
This skill gives KNOWLEDGE (flow, rules, formats), never orders. It never dictates a palette,
a font, a layout, or a template. The user corrects the model in words; the model re-plans.
No system prompt, and no skill sentence, may force every output to look the same.

## When to use
- User pastes a URL and says "like this", "in this style", "inspired by this", "this feel".
- User pastes a URL plus their own brief (business, content, audience).
- Do NOT use for: "copy this site", "download this site's code", "take this site's images"
  — those are refused (see Refuse list), politely, with the original-direction offer instead.

## Flow (show EVERY stage in the reply, with reasons — this is the delight)
The flow display is a transcript of what the model proposed and why, not a ballot.
Show reasons, evidence, and what was rejected. The user redirects in words, never by
being forced to pick tokens from a menu.

1. **Read (read-only).** State the URL as pasted, the page title, and what was read
   (DOM + computed styles, desktop + mobile viewport). State what was NOT done:
   no assets downloaded, no CSS copied. State flags honestly: bot protection, canvas-only
   page, dark-mode pinned to light, mid-rebrand disagreement across pages.
2. **Tokens (evidence + confidence).** A table: role → value → evidence → confidence.
   Evidence means where it was seen ("Primary — appears on 3 buttons above the fold").
   Confidence is high / medium / flagged-approximate. Colours with no clear role go to an
   UNASSIGNED pool — never force-assign. A wrong role is worse than a missing one:
   downstream code falls back gracefully on a missing token but renders confidently
   wrong on a mislabeled one. Screenshot-derived values are flagged approximate, always.
3. **Direction plan (BEFORE any code, then critique it).** Write this format, then
   critique it against the brief and the tell list, and revise before building:
   - Name (one memorable name, e.g. "Field Notes")
   - Mood (one sentence)
   - 4–6 named colours with roles (background, text, primary, surface, accent, border)
   - Type roles + one 3x+ size jump (display vs body vs UI)
   - Layout concept (one sentence)
   - One signature principle derived from the USER's subject (its materials, objects,
     workflow) — never from the reference's brand
   - What was borrowed from the reference (exactly one axis + why)
   - What was rejected as a generic default (and why)
4. **Build (gated write).** The write happens only after the user's explicit approval
   of the exact file list under sites/. Approval-first is unchanged: policy ask, exact
   action/target/values shown, fail closed. No write without approval, ever.
5. **Verify (screenshot + checklist).** Desktop + mobile screenshots of the built site.
   Checklist: does it read as the direction? Any tell from the tell list? Contrast,
   keyboard focus, prefers-reduced-motion respected? Revisions happen via new words
   from the user (return to stage 3/4), never via token picking, and never via a
   pixel-diff against the reference — a pixel diff rewards copying. Verify against
   the DIRECTION, not the reference.

## How to extract (knowledge for the agent, using browser tools)
- Read with Playwright: render the page, wait for content + document.fonts.ready.
  Pin to light mode unless the user asks for dark.
- Values first from declared tokens when present (:root custom properties, Tailwind
  @theme, config), then from computed styles via page.evaluate + getComputedStyle
  on visible elements only (skip display:none, zero-area, far-below-fold), fixed
  property list: color, background-color, border-color, font-family, font-size,
  font-weight, line-height, letter-spacing, border-radius, box-shadow, padding,
  margin, gap, transition, animation, max-width. Pseudo-elements via ::before/::after.
- Weight by prominence, not frequency: area × viewport weight (above the fold counts
  more) × role weight (buttons, links, headings count more). Frequency counting alone
  produces garbage (seven near-blacks and body grey) and buries the brand accents.
- Colours: cluster in OKLCH (perceptually uniform) with a distance threshold, never a
  fixed k. Assign roles: background = highest-area cluster; text = max contrast vs
  background, weighted toward paragraphs; primary = highest-chroma cluster on an
  interactive element (brands reserve saturation for what they want clicked);
  surface = near-background but not identical. Cap output: ≤12 colours, ≤8 type
  sizes, ≤6 radii/shadows — the model receives a DIRECTION, not a dump.
- Typography: families from font links, @import, @font-face, and computed families per
  role; check document.fonts faces actually loaded (ready alone does not prove the
  preferred face rendered). Scale: fit a modular ratio (1.125, 1.2, 1.25, 1.333, 1.5,
  1.618) to the prominence-weighted base size; derive sizes from base + ratio.
- Spacing: base unit usually 4px or 8px (GCD of common values, outliers discarded);
  express everything as multiples. Capture max content width, section padding,
  grid/gap, and a qualitative whitespace philosophy (tight / balanced / generous).
- Roundness is a personality scalar (sharp → round axis), not just pixels: it implies
  padding and gap choices too.
- Motion: extract QUALITATIVELY only — tempo, easing family, "motion only on action",
  ~200–300ms ease-out on interactive elements. Never copy keyframe timelines, GSAP
  timelines, Lottie, or scroll choreography. Invent original motion in that spirit
  with GSAP/Lenis (see world-best-motion).
- Component patterns: group repeating elements (≥3 same radius/shadow/padding family)
  and record the PATTERN in words ("primary action: solid fill, pill radius, 12/24
  padding, darkens on hover") — never the element's HTML/CSS verbatim. Record section
  order as an abstract type list (hero → proof → features), never as markup.
- Homepage first; spot-check up to 2 inner pages. If pages disagree wildly, ask the
  user which page is canonical — do not guess.

## Originality rules (the abstraction ladder — climb before writing code)
- L0 Literal = FORBIDDEN: same layout, same copy, same images, same CSS.
- L1 Tokens: values + roles (never the reference's EXACT full palette + type pairing
  + radius as a set — that combination is its trade dress).
- L2 Patterns: component and layout patterns in words.
- L3 Principles / mood: density, rhythm, motion character.
- L4 Subject-derived reinterpretation: the USER's world expressed through L1–L3.
  The hero must show the user's own characteristic object (their product, menu,
  portfolio piece, rota, map) and copy must name their audience/job/number.
  Remove-the-logo test: remove the logo — can you still tell whose site it is?
  If the answer is only "the reference's", the direction failed.
- Selective borrowing: take exactly ONE axis from the reference (e.g. colour
  temperature and density only) and invent the rest. If the user gives no axis,
  state your own choice in the direction plan and let the user correct it in words.
- Mix references: no single site may supply more than one major axis. If the user
  pasted only one URL, re-derive at least one axis (usually type or layout) from
  the user's subject, and say so in the direction plan.
- Ask instead of inventing: if the brief is vague (no audience, job, object, or
  constraint), elicit specificity ("who is it for, what job, what one object should
  the hero show?") instead of silently filling gaps with defaults.

## Diversity rules (why outputs go same-y, and what actually fixes it)
- Cause: the model samples the high-probability centre of training data, and
  framework defaults (indigo buttons, Inter/Geist, shadcn cards, centred hero +
  two buttons + three cards) reinforce it. Vague prompts ("modern, clean, beautiful")
  describe no product, so the model defaults.
- A ban list ALONE fails: banning Inter shifts output to Geist; banning purple
  gradients shifts it to the next cluster. Clusters change over time (indigo/Inter,
  then cream/serif/terracotta, then near-black/neon, then broadsheet hairlines).
  A frozen list goes stale within months. Name the MECHANISM ("a tell is evidence
  of a default nobody chose") and require the critique pass — the critique matters
  more than the list. The current tell list lives in references/tells.md and is
  refreshed when clusters move; never present it as permanent.
- What works: positive direction first (stage 3 format); token reset (define only
  the chosen semantic tokens so defaults cannot compile); critique pass before
  code; tell-guard after build (mechanical check for default tells); spend
  boldness in exactly ONE place (the signature element) and keep everything else
  quiet; quality floor (responsive, keyboard focus, prefers-reduced-motion).
- Sampling parameters (temperature/top-p) are a weak dial, never the strategy:
  they add noise around the same centre, and BYOK providers may not honour them.
  Never present temperature or "direction vectors" as proven mechanisms — the
  proven mechanism is the named direction plan with explicit axes.
- Optional direction picker: ONLY if the user explicitly asks for options. Then
  show 3 directions on the SAME real content (palette, type, density, AND layout
  all different), then converge on one. Never the default path.

## Refuse list (never do these, even if the user asks nicely)
- No downloading or copying images, SVGs, icons, videos, Lottie, or font FILES.
- No pasting the reference's CSS, HTML, copy, logo, or brand name.
- No reusing its full token set as a set (trade-dress risk). No percentage rule:
  "changing 30% makes it legal" is a myth; what matters is protected expression
  and likelihood of confusion.
- No "clone this page" mode. No asset downloader. No default token picker.
- No paywalled-font copying: substitute a freely licensed lookalike and LABEL
  the substitution in the flow display.
- No write to sites/ without explicit approval of the exact file list.
- No pixel-diff verification against the reference.
- Never claim a direction is "proven" or "guaranteed" — direction plans are
  proposals; the verify loop is the proof.

## Limits (say these plainly when they bite — flag, don't force)
- JS/scroll-driven/timeline animations cannot be read reliably: extract motion
  qualitatively and invent original motion.
- Hover/focus/active states only if deliberately triggered and re-captured.
- Canvas/WebGL sites, bot-protected pages, cross-origin stylesheet rules
  (SecurityError): computed styles suffice for tokens; if extraction confidence
  is low, say so at stage 2 and ask the user which page/element matters.
- Paywalled fonts, images, logos: never copied; substitutes labelled.
- Dark mode: pin to light unless asked. Mid-rebrand disagreement across pages:
  ask, don't guess.

## Taste rules (world-class-website §4 applies in full)
- Distinctive fonts, never Arial/Inter/Roboto. No purple-gradient-on-white.
- Real content only: the user's own copy, numbers, and objects — never lorem ipsum,
  never the reference's copy, labelled placeholders only for a missing photo/link
  the user has not supplied.

## Verification (how this skill is proven — mock proves loop only)
- Skill-load test (mock): skill_read this skill → direction-plan doc + original
  demo page + check.js → check report: consoleErrors [], overflow false, hero/cta
  true, mobileOverflow false, site 200. Mocks prove the LOOP, never model quality.
- Real-model flow test (after the DeepSeek key): a real pasted URL → real tokens
  with evidence → real direction plan → original built site → verify screenshots.
  Until that runs, never claim the flow is proven on a real site.

## Worked example (invented — no real site, no real CSS)
- User pastes a URL of a dark editorial magazine site and asks for a site for
  their stationery shop.
- Stage 2 tokens (illustrative): background near-black, off-white text, one
  vermilion accent, serif display + sans body, 0px radius, hairline rules.
- Stage 3 direction "Field Notes": mood "warm, editorial, quiet confidence";
  colours paper #FAF6EF (background), ink #1E2420 (text), pine #2E5B4F
  (primary), clay #C4663A (accent), mist #E4E0D6 (surface); type Fraunces
  display + Manrope body with a 3x+ jump; layout single-column editorial with
  oversized numerals; signature principle "everything feels printed, nothing
  glows" (from the shop's paper goods); borrowed axis: density + editorial
  rhythm only; re-derived: palette and type from the shop's materials.
  Rejected: purple gradient, Inter, three-card grid, glassmorphism — generic
  defaults, not this shop.
- Stage 4–5: gated write of the original page, then desktop + mobile screenshots
  checked against THIS direction (not against the magazine site).
