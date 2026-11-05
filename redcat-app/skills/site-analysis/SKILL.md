# site-analysis

description: When the user gives a website link and says "clone this site" or "make a site like this", read this skill first — study the reference deeply in the browser, report what it actually has, give your own best advice, then build a pattern-level recreation (never a copy) with the world-class-website skill.

## When to use
- The user pastes a site link and says clone it, make one like it, or "make a site like this".
- The user asks "look at this site, what is in it?" — analysis only: stop after the advice and offer the build.
- The user points at a site as the level to reach.

## What this is — and what it is not
This skill is a STUDY, not a photocopy. You never copy the reference's code, copy, brand, logo, or images. You take its PATTERNS: layout rhythm, section order, component ideas, color relationships, motion style. Then you build something new from those patterns, with the user's own content, using the world-class-website skill. A literal clone (same code, same copy, same brand) is refused — say so plainly and offer the pattern-level version instead.
The agent decides — this skill is knowledge, not a script. It tells you WHAT to examine and the SHAPE of your reply (inventory, then advice, then build, then delivery). The actual observations, the actual advice, and the actual build choices are yours, from the reference and the user's prompt. Never read out a canned script.

## Procedure

### 1. Run the reference in the browser and examine every thing (text evidence)
Use browser_read first; if the page is JS-heavy or thin, use browser_read_js; use browser_control for rendered text where a state matters. Those are reads — no approval needed. Fill/click/submit are NOT part of studying a reference (they need approval and are never used on login, sign-in, checkout, or payment pages).
The model is text-only: you cannot watch animations play. Judge motion from text evidence: CSS keyframes, transitions, animation names, durations and easings, and JS animation code (GSAP timelines, Three.js scenes) — name what moves, how, and what triggers it.
Inventory, from the rendered DOM plus stylesheets plus scripts (never guess):
- Sections in order (hero, features, proof, pricing, footer — whatever it actually has), and what each section DOES.
- Colors: the actual palette as hex codes from the CSS (dominant plus accent), and how color is used (backgrounds, CTAs, text).
- Typography: font families, headline scale, how type creates hierarchy.
- Components: nav, buttons, cards, sliders, forms, footers — what exists and how each behaves.
- Motion: every animation you can evidence from code — page-load reveals, scroll reveals, hovers, sliders, 3D or canvas elements, and what triggers each.
- Copy and structure: the real headline and message (quote briefly, never reproduce whole pages), the CTA pattern, and what the site is FOR (sell, capture, show, inform).
- Tech signals you can read from code (framework hints, libraries, fonts, CDNs) — stated as signals, never as certainties you cannot verify.
If a part cannot be read (login wall, blocked page, heavy canvas with no readable code), say exactly that — never invent the missing part.

### 2. Answer the user: inventory, then "now I am checking its code"
Reply BEFORE building, in this shape, in your own words and from your own findings:
- "This site has this and this:" the inventory, specific — real colors, real sections, real motions, not "nice design".
- "Now I am checking its code so I can make a better one for you:" then the comparison — what to keep from the patterns, and what to improve where the reference is weak (slow, cluttered, generic, weak CTA, no mobile care) — only where you have evidence.
This reply is the delight: specific observations the user did not expect, in plain words.

### 3. Give your best advice — your own, tied to the user's goal
Advice in three parts (never generic tips):
- Possibilities: "you can do this" — concrete things this pattern makes possible for them (sections to add, features to include, content to prepare).
- Standout / shareability: what about this design makes people remember or share it (a hook, a memorable interaction, a clear value in 3 seconds) — honest observations only, never promises of views, virality, income, or rankings.
- Facts: real facts from the reference (what it does, how it is built, what it claims if stated) — never invented stats, prices, or testimonials.
Then move to step 4 if the user already said "clone" or "banao" — ask nothing extra. If the user only asked for analysis, stop here and offer the build.

### 4. Build (via world-class-website)
Read the world-class-website skill with skill_read and follow it exactly for the build: direction from the reference's patterns plus the user's prompt, stack by the job, taste rules, verify loop, localhost link. The reference's patterns inform the direction; the user's content fills the page. Writes are approval-gated as always — the first write approval is the user's natural yes or no point.

### 5. Deliver — folder, then localhost live
Final reply, in this shape:
- Folder: the code lives in the sites folder inside the RedCat project on the Desktop (Desktop\redcat\sites\<name>\) — say the folder name plainly, never ask the user to open files by hand.
- "But wait" beat: the site is ALSO live on localhost right now — the direct link http://localhost:3000/sites/<name>/ — open it and use it.
- What was built: direction, stack, and one line per choice plus why (from the world-class-website deliver step), plus the verify summary.
- Next step, one line: say "make it live" for a public Cloudflare Pages link (world-class-website §8, explicit yes only).

## Pitfalls (refuse list)
- Never copy the reference's code, copy, brand, logo, images, or design one-to-one. Patterns only, own code, own copy, user's own images or CSS/SVG art.
- Never invent what you could not read (blocked sections, unseen animations, unmeasured speed).
- Never promise views, virality, income, rankings, or an exact replica.
- Never claim you "watched" an animation play — you read its code as text; say that when asked.
- Never build before the advice reply when the user asked for a clone — advice first, then build. (Exception: the user said "build it directly, no advice needed" — then build directly.)
- Never ship without the world-class-website verify loop.

## Verification — PC test rule (ALWAYS)
Same rule as every skill: tested on the user's PC before it is called done.
1. skill_read returns this file (ok:true) on a real agent run.
2. A test run (real model, or a mock run when no key is present) on a known reference page produces: a real inventory (sections, colors as hex, motions named from code), advice in three parts (possibilities, shareability, facts), and the delivery shape (folder plus localhost link). A mock run proves the loop, not model quality — real-model quality needs a real-key run.
3. Until the test passes, never tell the user the skill is done.
