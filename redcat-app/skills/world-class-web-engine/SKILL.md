# world-class-web-engine

description: Master orchestrator for all website work — routes any website request to the right specialist skill(s) in the right order, owns the 10-stage order and the verify loop, and runs the Evaluation Lab at the end. A router only: it never duplicates specialist content.

When to use: whenever the user asks for any website — portfolio, salon, SaaS, landing page, redesign, or mobile-first site — or gives a link, PDF, or design reference for a website.

## What this is — a router, not a builder

This skill contains NO design knowledge, NO code patterns, and NO stacks. It only decides WHICH specialist skill to load, in WHAT order, and WHEN the work is verified. Design knowledge lives in the specialist skills. Need design, build, or animation knowledge? Load the specialist skill — never paste its content here, never invent a direction here.

This skill is KNOWLEDGE, not orders. It never sets a fixed direction, stack, or script. The agent reads the USER'S PROMPT — product, audience, mood, any reference — and the router below only picks the skills and the order.

## Mirror skills — never confuse these two

- design-to-site = a DESIGN already exists (a design.md, a Figma/image, a design brief) → build the SITE from it.
- site-to-design = a SITE already exists (a URL) → read it and write design.md from it.
- Rule: link/URL in the prompt → site-to-design (via reference-url). Design file or design.md in the prompt → design-to-site. Never load the wrong one.

## Routing table — intent → skills → order

| User gives / wants | Load in this order |
| Link / reference URL | reference-url → site-to-design → collect inputs once → world-class-website → 3d-website-architect (only if 3D asked or fits) → world-best-motion (only if motion asked) → verify |
| 3D portfolio | design-direction → 3d-website-architect → world-best-motion → world-best-3d (only if stuck on a 3D detail) → verify |
| Salon / SaaS / business site | design-direction → world-class-website → 3d-website-architect (one playable 3D hero only) → verify |
| PDF (CV / brief) | read the PDF first, extract facts only, never invent → world-class-website → verify |
| Mobile-first site | world-class-website, mobile-first → verify on mobile first |
| Anything else / unclear | world-class-website → design-direction → verify; ask one clarifying question only if the intent is genuinely ambiguous |

Use the remaining specialists only when their exact job appears:
- site-analysis — only when the user asks to analyse or audit an existing site WITHOUT rebuilding it.
- world-best-stacks — only when the stack is genuinely undecided and the prompt gives no stack.
- world-best-3d / world-best-motion — only for one specific detail, never as the main builder.

## The 10 stages — order only

The router owns the ORDER. Each stage's knowledge stays in the specialist skill named next to it.

1. Intent analysis — what exactly does the user want? (this skill)
2. Input inspection — PDF, images, videos, files, link. Read them before building. (reference-url / site-to-design)
3. Personalization — the user's relevant preferences and taste from memory. (design-direction)
4. Research — design references and suitable technologies. (design-direction / world-best-stacks)
5. Creative direction — the website's unique visual concept. Decide BEFORE coding. (design-direction)
6. Architecture — pages, components, data, interactions. (world-class-website / 3d-website-architect)
7. Development — build the actual website. (world-class-website / 3d-website-architect)
8. Browser testing — run it and inspect it. (verify loop below)
9. Optimization — fix visual, technical, and responsive issues. (verify loop below)
10. Delivery — working project and preview to the user.

## Verify loop — mandatory before delivery

1. Build, then run the local development server.
2. Playwright screenshots: desktop + tablet + mobile (full page where it matters).
3. Fix what the screenshots show — layout, spacing, typography, broken elements, contrast.
4. 3-strike rule: after 3 failed fix cycles on the same defect, stop and tell the user instead of looping.
5. Evaluation Lab at the end of skill changes: the 8 tests in evaluations/ with the 0–100 rubric. A skill change is adopted only if the total does not drop and no functional gate fails.

## Rules — fixed

- Never duplicate specialist content in this skill. Point, don't paste.
- Visual direction is decided BEFORE coding, from design-direction or the reference design.md — never after building.
- Reference guardrail: learn the reference's design system, never copy its images, text, logo, brand, or exact copy. Copy found = fail.
- Every website: one playable interactive 3D moment (not decorative particles or an orb background), with a mobile fallback — decorative 3D as the "moment" is a fail.
- Mobile fallback is mandatory — a site that fails on mobile fails the job.
- Fictional businesses get a visible "Demo" label — never a demo as a real client.
