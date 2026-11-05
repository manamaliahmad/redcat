# world-class-website

description: Build world-class, premium websites — never plain simple HTML — using Tailwind, DaisyUI, GSAP, Three.js/WebGL and tsParticles, with a text-evidence verify loop before delivery, plus optional guided go-live on Cloudflare Pages (user's explicit yes only).
When to use: whenever the user asks for a website, landing page, portfolio, dashboard, product page, or any visual web page — especially when they say world-class, premium, 3D, or point at a reel or site as the level to reach.

## What this is

A premium website is not more text. It is an experience: one strong direction,
motion that serves the story, depth (particles, gradients, 3D), and
production-ready components — built so it actually renders, on desktop and
mobile, with proof. The bar is: stunning, not just functional. Every pixel
intentional. If the page looks like a generic hero plus three cards plus a
footer, it failed, no matter how correct the code is.

## Choice rule — the agent decides from the user's prompt, never from a fixed script

This skill is KNOWLEDGE, not orders. It never hands the agent a system
prompt, a fixed direction, or a fixed stack, and it never says "always
do X regardless of the prompt". The agent reads the USER'S PROMPT — the
product, the audience, the mood, any reference the user gave — and
chooses the direction, the stack, the language, and the patterns that
fit THAT prompt. When the prompt is silent on a choice, the agent picks
the option that fits the content best and says in its reply what it
picked and why, so the user sees the decision came from their prompt.
Only two things are fixed, because they are standards, not choices: the
taste rules in §4 (the premium bar) and the verify loop in §6 (the
proof). Everything else is the agent's decision. That is what makes the
decision better: the model reasons about this user's job instead of
following a script.

## Procedure

### 1. Direction first — from the user's prompt, pick ONE, state it, execute it fully

Do not ask five questions. The direction comes from the user's prompt,
not from this skill — this skill only lists the directions; the agent
matches the prompt to one of them. Pick ONE extreme direction and say it
in your reply, for example: brutally minimal, maximalist chaos,
retro-futuristic, organic/natural, luxury/refined, playful/toy-like,
editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel,
industrial/utilitarian. A timid middle direction is not a direction. If
the user gave a reference site or reel, read it first (browser_read /
browser_read_js), take its PATTERNS (layout rhythm, motion style,
component ideas) — never its brand, logo, copy, or images.

### 2. Stack and languages — a menu the agent chooses from, by the job and the prompt

No stack here is a default the agent must obey. Each option below says
when it fits; the agent matches the user's prompt and the job to one of
them, and states the choice in its reply.

- Single-file wow site: one self-contained `index.html` plus public
  CDNs — Tailwind (browser build) + DaisyUI CDN for components and
  themes + GSAP (+ ScrollTrigger) for motion + distinctive Google Fonts.
  Zero build step. This fits landing pages, portfolios, and marketing
  sites, and it fits the zero-setup bar.
- 3D: Three.js via CDN import map, vanilla Three.js preferred. React
  Three Fiber ONLY inside a React build. Raw WebGL only when Three.js
  cannot do the effect.
- React build: the right choice when the user needs a real multi-view
  app (dashboard, tool, account area). Then React + Vite + Tailwind +
  DaisyUI plugin + GSAP/Motion, with an npm build, and serve the built
  output. A build step for a simple landing page is waste, not quality.
- React Native is NEVER for a website. This is a fact about the tool,
  not a preference — React Native builds mobile apps, not websites.
- Languages the agent can use: HTML, CSS, JavaScript (vanilla
  single-file); TypeScript and React/JSX (React builds only); GLSL for
  custom shaders (adapted from a reference, never pasted raw — a
  ShaderToy shader needs a ShaderMaterial wrapper, uniforms, and a
  pass-through vertex shader, plus a licence/attribution check);
  Tailwind utility classes; GSAP timelines. The prompt and the stack
  choice decide the language, not a fixed rule.
- If a CDN fails to load, the verify loop below will show it as console
  errors — swap the CDN source, never ship a broken page. Resolve exact
  CDN URLs from the library's own docs at build time; do not guess URLs.

### 3. Premium patterns — use them when they serve the story

These are the verified premium ingredients (see Verification notes):

- Animated particle background (tsParticles, the maintained successor of
  particles.js, via CDN): a canvas behind the hero, coloured from the
  direction's palette, mouse interaction on desktop only, FEWER particles
  on mobile, fully OFF when the user prefers reduced motion. Never a
  screensaver for its own sake — it must lift the hero, not fight the text.
- Text morph / rotating-word headline: GSAP timeline cycling one word at
  a time in the hero. One clear message, never a wall of rotating words.
- Image slider / comparison slider: drag or auto-advance, with labels.
  Use the user's own images or pure CSS/SVG art — never hotlink images
  the user does not own.
- Magnetic buttons, hover lift, glass cards, gradient meshes, noise
  texture, layered transparencies: depth without clutter. Custom cursor
  ONLY on desktop; it must never break touch devices.
- Theme switch: DaisyUI `data-theme` (light / dark / brand theme) so the
  whole page recolours from CSS variables, not from rewriting components.
- Scroll reveals: GSAP ScrollTrigger, staggered, transform/opacity only
  (never layout properties) so animation stays smooth.
- 3D hero: a Three.js scene that IS the story (product, world, hero
  object) — never decoration. WebGL-failure fallback is mandatory: wrap
  renderer creation in try/catch; on failure hide the canvas and show a
  static gradient, so the page never renders black or broken.
- Component patterns: originkit.dev is a real free animated-component
  library (805 components, verified on its own homepage). Use it as a
  PATTERN catalogue: open a component page, understand the effect, then
  build the same effect with GSAP/CSS/Three.js in your own code. In a
  React build you may copy a component's code only if that component's
  page presents it as free to copy; never copy code behind a paywall or
  an unclear licence, and never copy another site's brand or content.

### Premium 3D product view — when the user gives a 3D model (GLB)

When the user provides their own model (.glb — from Spline, Blender, or
an image-to-3D tool), render it as a premium product view, not a bare
viewer. This is what "premium 3D" concretely means — a checklist, not a
vibe:

- Load with GLTFLoader (vanilla) or useGLTF (React build). Show a
  loading state; never a blank canvas while the model downloads.
- Lighting: a studio environment (RoomEnvironment from three/addons)
  for reflections, plus one soft key light with shadows. Tone mapping
  ACESFilmic, output colour space SRGB — this is what makes materials
  look expensive instead of flat.
- Materials: keep the model's PBR textures (albedo, metallic,
  roughness). Never flatten them with a basic material. If the model is
  untextured (grey), say so and present an honest studio-grey look
  rather than faking a texture.
- Camera: a 45-degree product angle, OrbitControls with damping, slow
  auto-rotate that pauses on interaction, and sensible min/max distance
  so the user cannot lose the object.
- Ground: a soft contact shadow (or a subtle reflective floor for hero
  objects) and a clean studio background — a gradient or solid from the
  direction's palette, never a busy photo behind a product.
- WebGL-failure fallback is mandatory (same rule as the 3D hero): hide
  the canvas, show a static image or gradient, never a black box.
- The agent does NOT create a model from nothing. If the user gave only
  an image, say so honestly: a full 3D model needs an image-to-3D
  generation step (a separate model or API) — it is not something the
  chat model writes as code. Offer that route; never pretend the chat
  model made a model.

### 4. Taste rules — the difference between premium and slop

- Typography: a distinctive Google Font pairing (display + body). NEVER
  Arial, Inter, Roboto, or system fonts. Headline size 4–6x body size is
  normal for a hero. Type contrast is the cheapest premium signal.
- Colour: CSS variables, one dominant colour plus ONE sharp accent.
  Commit to a cohesive aesthetic. No timid even palettes, and never the
  clichéd purple gradient on a white background.
- Layout: break the grid where it helps — asymmetry, overlap, diagonal
  flow, generous negative space. 8px spacing rhythm. Text never overflows
  its container. NO horizontal scroll on any screen size.
- Motion: one well-orchestrated page load with staggered reveals beats
  scattered micro-interactions. Scroll-triggered reveals plus surprising
  hover states. Respect `prefers-reduced-motion`.
- Content: real content only. No fake testimonials, fake logos, fake
  stats, fake prices, or fake users — ever. If the user has no content
  yet, use clearly labelled placeholder words, never invented claims.

### 5. Build

Build under `sites/<short-name>/index.html` (assets next to it), the same
place every RedCat website lives. The final reply always ends with the
direct link `http://localhost:3000/sites/<short-name>/`. Keep the file
self-contained except for the public CDNs above.

Terminal file writes — quoting rule (proven by a mock test, 2026-10-31):
the harness runs commands through cmd, so a command with NESTED double
quotes gets mangled there — PowerShell prints the code back instead of
running it, or reports an unterminated string, and the file never appears
even though the run looks successful. Write files with quote-free
commands: PowerShell -Command with NO outer double quotes plus base64
content, for example: powershell -Command
[IO.File]::WriteAllText('sites/<name>/index.html',
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('...'))).
Never use -EncodedCommand (it is on the harness hardblock list) and never
nest double quotes inside a terminal command. If a write prints the
command back instead of running it, the quoting broke — rewrite the
command, do not claim the file exists. Always verify the file exists
after writing (the verify loop below does this implicitly, because a
missing file fails the page load).

### 6. Verify loop — text evidence, never a feeling (MANDATORY)

The model is text-only: it cannot see screenshots. So verification is a
script, not an opinion. After building, write and run a short Node
Playwright script from the project root (Playwright is installed there)
that loads the site URL and prints a JSON report:

- console errors (must be ZERO) and pageerror events (must be ZERO)
- horizontal overflow: `scrollWidth > clientWidth` on desktop AND mobile
  widths (must be false)
- key elements present and visible: hero headline, primary call-to-action,
  and (if used) the particle/3D canvas — plus, for a 3D page, whether a
  WebGL2 context actually exists on the canvas (a canvas tag alone proves
  nothing). Check webgl2, NOT webgl: Three.js uses webgl2, so
  getContext('webgl') returns null when a webgl2 context exists — that is
  normal, not a defect. Known headless artifact (proven on a minimal page,
  2026-10-31): headless Chromium logs one THREE error, "A WebGL context
  could not be created. Reason: Canvas has an existing context of a
  different type", even while the scene renders and a live webgl2 context
  exists. That lone error counts as a defect ONLY when no webgl2 context
  exists; with a live webgl2 context and a rendered scene, it is not a
  page defect.
- screenshots saved as proof files the USER can open:
  `sites/<name>/proof-desktop.png` (1280x720) and
  `sites/<name>/proof-mobile.png` (390x844)

Read the TEXT report. Zero console errors + no overflow + key elements
visible + WebGL OK (when 3D is used) = pass. Anything else is a defect:
name it, fix it, re-run. Maximum 3 fix rounds. NEVER write "world-class",
"looks great", or "premium" in the final reply without this report. The
screenshots are proof for the user; the verdict comes from the text
report only.

### 7. Deliver

Final reply: the `sites/<name>/` link, the direction you picked, the stack
used (single-file vs React, which libraries), and the verify summary
(console errors 0, overflow none, WebGL OK or fallback shown, screenshots
saved). State each choice you made and why in one short line (direction,
stack, language), so the user sees the decision came from their prompt.
Never ask the user to open files by hand — the link is the
delivery. If §8 was used, give the live URL next to the local link.

### 8. Go live — only when the user says so, via Cloudflare Pages

Localhost first, always: every site is already served at
`http://localhost:3000/sites/<short-name>/` on the user's own PC, and
preview happens there. Live is a second step, never the default, and
never automatic.

When the user says "make it live" (or asks for a public link), explain
Cloudflare Pages in plain words BEFORE doing anything: free ($0, no
credit card), unlimited bandwidth and static requests, 500 builds a
month, a free `<project>.pages.dev` address, or their own domain if
they have one, HTTPS automatic. This is the recommended host for these
sites because they are static (HTML/CSS/JS) — that is exactly what
Pages hosts.

Account rule: the Cloudflare account is always the user's own. The user
creates it or signs in themselves. The agent never asks for, receives,
or stores a password in chat, in code, or in the site folder. For
agent-run deploys, authentication is a scoped API token that lives on
the user's PC only (environment or config on the PC, never in chat,
never committed, never inside `sites/<name>/`). Interactive `wrangler
login` is for the user to run themselves if they prefer it.

Procedure — only after the user's explicit yes (this is an
approval-gated publish, not a background step):

1. Confirm the site passed the §6 verify loop on localhost first.
   Never deploy an unverified site.
2. Deploy the finished folder with Wrangler direct upload: `npx
   wrangler pages deploy sites/<short-name>
   --project-name=<short-name> --branch main`. The first run creates
   the project; the production address becomes
   `https://<short-name>.pages.dev/`.
3. Verify the LIVE URL the same way as localhost: open it, check hero
   + CTA render, console errors, no overflow. A deploy that is not
   verified live is not delivered.
4. Deliver both links — localhost (preview) + live URL — and say what
   the free tier covers and what it does not.

Limits, stated honestly: Pages hosts static sites only. Anything
needing a server, database, login system, or payments is not a Pages
deploy — say so and offer the separate route (Workers/Supabase)
instead of pretending. Free-tier file limits: 20,000 files per site,
25 MiB per file. A custom domain needs a domain the user owns;
without one, the pages.dev address is the live link.

Refuse inside this section: deploying without the user's explicit yes;
deploying to anyone else's account; putting any token or secret in
chat, code, or the site folder; promising a custom domain the user
does not own.

## Refuse list

- Generic AI slop: system fonts, purple gradient on white, cookie-cutter
  hero + three cards + footer.
- Fake testimonials, logos, stats, prices, users, or reviews.
- Copying a real brand's design, copy, images, or code.
- Auto-publish or auto-deploy anywhere without the user's explicit
  yes. The default delivery is the local link; a guided deploy happens
  only under §8, on the user's explicit yes.
- Claiming "world-class" or "premium" without the verify-loop report.
- React Native for a website task. A build step when single-file works.
- Particles or 3D as pure decoration that hurts readability or mobile
  performance.
- Hotlinked images the user does not own.
- Naming a library, site, or tool as real without verifying it first
  (web_search plus its own homepage). A reel's spoken name is not proof:
  one famous reel named a particle tool that does not exist under that
  name — the real tools are particles.js and its successor tsParticles.
  Verify, then build.

## Verification (how this skill's claims were checked)

- DaisyUI: daisyui.com — Tailwind CSS component library, 61+ component
  families, 35 built-in themes, CSS-variable theming, usable from CDN
  with the Tailwind browser build for quick HTML prototypes.
- tsParticles: maintained successor of particles.js, CDN-usable, with
  React/Vue/Angular/Svelte wrappers for real app builds.
- OriginKit: originkit.dev — free animated component library, 805
  components on its homepage, used here as a pattern catalogue only.
- Cloudflare Pages (§8): free tier — $0, unlimited bandwidth and
  static requests, 500 builds/month, 100 custom domains per project,
  20,000 files per site, 25 MiB per file, free `<project>.pages.dev`
  address, automatic HTTPS — figures as listed on Cloudflare's
  limits/product pages via October 2026 summaries; Wrangler
  direct-upload flow (`wrangler pages deploy`, project auto-create,
  pages.dev production address) from deployment guides. Re-check the
  limits page before quoting figures to a user.
- The verify loop itself: Playwright is installed in the RedCat project
  on the PC, and the script pattern (console/pageerror capture, overflow
  check, screenshots) is the same one proven by RedCat's browser checks.
