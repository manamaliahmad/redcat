# Recipe: depth-portrait-scroll

## When to use
When the user wants a world-class 3D personal site: their photo CENTRE
in the hero, a trendy Three.js feel, and 3D scrolling. This is the
first recipe in the library — the wow piece. It is chosen by the
design-to-site skill when design.md says "3D depth portrait" (see
pattern-map.md), or directly when the user asks for a photo-centre 3D
portfolio.

## What the user supplies (nothing else is needed)
- `photo`: their portrait photo (required — no stock substitute).
- `name`, `tagline`, `about`, `projects`: their own words.
- `palette`: bg / fg / accent / muted (or the design.md palette).
- `scroll.intensity`: 0–1, how strong the depth + camera travel feels.

## Config (config.json — the ONLY thing the agent edits)
See config.schema.json. The agent fills config values only. It never
edits the shader, the camera code, or the template structure. That is
the whole point: the template is tested once, every user gets the same
quality, only their content changes.

## Files
- `template/` — the working Vite + Three + GSAP project. Build with
  `npm install` once, then `npm run build`. Output is `template/dist/`.
- `scripts/cutout.py` — photo to transparent-background cutout (rembg,
  already proven in this project).
- `scripts/make-depth.py` — photo to grayscale depth map (Depth
  Anything V2 Small, local, CPU). Needs `pip install transformers
  timm`. First run downloads ~100MB of weights; later runs are local.
- `scripts/check.js` — WebGL screenshot + FPS estimate + console
  errors + mobile-centre check + fallback check. Run after every build.

## Modes (in order of preference)
1. **Depth mode** (premium): photo + depth map → vertex displacement
   shader, mouse parallax scaled by depth, scroll-driven camera.
2. **Flat-tilt mode** (guaranteed): depth map missing or failed → the
   same plane with the photo only, gentle mouse tilt + scroll scale.
   Still premium, never broken.
3. **Fallback mode** (WebGL unavailable): plain image + CSS parallax.
   Mobile lite mode: fewer plane segments, no mouse parallax, same
   layout. Reduced motion: everything static, one frame.

## Test photo (TEST ONLY — never ship as a user's photo)
`template/public/test-assets/test-photo.jpg` is a synthetic test image
used only to prove the template builds and renders. Vite copies
`template/public/` verbatim to `dist/`, so config refers to these files
as `test-assets/...` (the served-root path). Replace them with the
user's real photo before any delivery. Judging depth quality on a real
photo needs a real photo — the test proves the loop, not the look.

## Quality bar (locked)
- Build passes, console errors [], no horizontal scroll at 400px.
- Hero portrait centred (centre within 10% of viewport centre).
- Fallback path proven with WebGL blocked (check.js does this by
  nulling WebGL contexts — a deterministic test of the fallback branch).
- If the template does not impress on a real photo, fix the TEMPLATE,
  never patch a single user's output. The template is the product.

## Check (before calling this recipe done)
- [x] `npm run build` passes (Vite 5.4.21, built in 2.85s, 11 modules)
- [x] check.js CHECK_PASS: desktop canvas renders, portrait centred,
  fps 21 (software GL on this PC — real GPUs will be much faster),
  consoleErrors []; mobile scrollWidth 400, centred, consoleErrors []
- [x] Fallback branch proven (WebGL blocked run: fallback image shown,
  no-webgl class set, consoleErrors [])
- [x] Mobile lite path renders, no overflow
- [x] Depth script timed on this PC (real numbers, 1024x1024, CPU):
  Depth Anything V2 Small, cached weights: load 2.3s + inference 11.7s
  = 14.0s total. Cutout (rembg u2net, cached): 172.6s per photo — slow
  on this CPU, and only needed for the layered-cutout variant, never
  for the depth recipe's critical path. First runs also download
  weights one time (Depth Anything ~100MB, u2net 1.02GB).
- [ ] Template impresses on a REAL photo — needs a user photo plus
  ali's eyes. The synthetic test image proves the loop, not the look.
