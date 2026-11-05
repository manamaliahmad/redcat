# motion-video

When to use: the user asks for a motion graphics video (showreel, explainer, promo, kinetic type, product spot). This skill carries the world-class quality — it works with ANY model, because the pipeline, not the model, is what makes it look expensive.

## Why code-motion looks like a million-dollar edit

The video is never "generated footage". It is code (one self-contained HTML file, canvas/CSS/JS) that plays as animation, rendered frame by frame, then stitched with ffmpeg. Crisp vector text and shapes, zero diffusion mush, and every word/number/timing editable by changing one line and re-rendering. That editability IS the superpower.

## The motion system (follow every rule — this is the whole secret)

**1. Motivated camera — every move has a reason.**
One move per shot. If you cannot name the reason, use a static shot.
- Push-in (dolly in): tension, realization, focus on one thing.
- Pull-out: reveal, isolation, ending.
- Pan / tilt: following action, revealing space.
- Orbit (circling): product showcase, dramatic reveal — the camera circles the subject.
- Crane up/down: scale, establishing shots.
- Crash zoom: high-energy punch moment.
- Handheld (tiny shake): urgency, documentary feel.
- Never: random drift, two moves stacked in one shot, zoom when a dolly would do (zoom flattens space, dolly reveals it).

**2. Parallax = depth.**
Layers sit at different depths and move at different speeds: background slowest, foreground fastest. Even a flat design looks cinematic the moment layers slide past each other. Give every scene at least 2 depth layers.

**3. Easing — never linear.**
Linear motion looks robotic. Rules:
- Entries: ease-out (fast start, soft landing).
- Exits: ease-in (soft start, fast finish).
- Springs for playful pops: stiffness 300, damping 30, mass 1.
- Web curve that feels spring-like without bounce: cubic-bezier(0.2, 0.8, 0.2, 1).
- If it feels stiff: switch linear to ease-out. If floaty: cut duration 30% and sharpen the curve.

**4. Choreography — never everything at once.**
- Stagger: elements enter one after another (40–80ms apart), never all on the same frame.
- Anticipation: a tiny counter-move before the main action (60–120ms: dip scale 0.95 before a pop, crouch before a jump).
- Follow-through: trailing parts settle after the main body stops (shadow and label land 40–80ms later).
- Arcs: move along slight curves, never pure straight lines.
- Poses: plan 3–5 key compositions per sequence (start, reveal, emphasize, settle, exit). If each pose works as a still image, the motion works.
- Pause 6–10 frames after key information so it lands.

**5. Beat-sync — motion lands ON the beat.**
At 120 BPM a beat is 500ms, an eighth-note grid is 250ms. Quantize every cut, reveal and impact to that grid. Without music, one major event per ~500–800ms so the piece breathes.

**6. Restraint.**
Max 3 colors + neutrals. One typeface family. Generous space. No purple-blue gradients. No emoji icons. One motion moment per beat — more effects is not more expensive, timed effects are.

**7. Sound, made in code.**
Synthesized music/SFX on the beat (WebAudio: whoosh on transitions, click on reveals, a simple loop at the chosen BPM). Sound lands on the exact frame because it is code.

## Workflow (do it in this order, no shortcuts)

1. **Beat sheet first.** Table: time | what is on screen | camera move (named, with reason) | sound. Get the beats right before writing any animation code.
2. **One self-contained HTML file** per video (canvas only, no external libraries — offline rendering must work). Size: 1920×1080 (16:9) default; 1080×1920 for 9:16; 1080×1080 for 1:1. FPS 30.
3. **Contact sheet.** Render one frame per beat, look at them, fix anything cut off, overlapping, or landing on the wrong beat. This QA loop is mandatory, not optional.
4. **Full render + ffmpeg.** See Render below.
5. **Deliver the link.** Final reply ends with the direct video link. Never ask the user to open files by hand.

## Length (user decides, up to 3 minutes)

Never present 15 seconds as a limit — that was only an example. The user chooses any length up to 3 minutes. Render math: frames = seconds × 30, so a 3-minute video is 5400 frames and render time grows with length. Always tell the user upfront (via the plan card goal line) that it may take a while because the video is being coded and rendered frame by frame. If the user asks for longer than 3 minutes, say 3 minutes is the current maximum and offer to split it into parts. The final reply must state the video length and frame count in English before the link.

## SaaS explainer from a URL (site-grounded, never invented)

When to use: the user shares a website URL and asks for a SaaS explainer video. This is the highest-quality explainer path, because every claim comes from the real site — not from the model imagination.

1. **Duration first — ask once.** If the request has no duration, reply with exactly one short question (user language, English by default) asking how many minutes, and stop — do not fetch or build yet. Ask only once: if the user declines or answers vaguely ("whatever seems right", "whatever"), use 90 seconds and say so, then proceed. Given durations follow the 3-minute maximum (longer: offer a split).
2. **Understand deeply — take full time, do not rush.** Use deep_read on the URL (up to 10 pages). If the content comes back thin or empty (JavaScript-heavy site), read the crawl4ai-js-render skill and use it. From the fetched pages only, extract: product name, one-line purpose, target user, top 3–5 real features, pricing ONLY if the site states it, and the design language (colors, tone, style). Use the site own colors and tone in the video so it looks on-brand, not generic.
3. **Structure (proven SaaS arc, scaled to the chosen length).** Hook = one specific problem the viewer already feels (first ~10%); Tension = why current solutions fall short; Solution = the core workflow in 3–4 steps, shown not described; Proof = ONE real number or fact from the site (only if present — if none exists, skip proof, never invent one); CTA = ONE action, using the site own CTA wording when present. Pacing guide: ~130–150 words per minute of on-screen text.
4. **Grounding rules (non-negotiable).** Product names, numbers, and prices stay literal — never rewritten or rounded into a nicer claim. Never invent features, prices, numbers, testimonials, or customer names. Every beat claim must trace to a fetched page; if you cannot trace it, cut it.
5. **Build and deliver** with the normal workflow above (beat sheet → HTML → contact sheet → QA → ffmpeg → /videos/ link). The final reply states length, frame count, and the source site, in the user language.

## DITCH-LEVEL EXPLAINER (reference pattern — 37s product video, 14 clips)

This is the bar for a world-class short product explainer. It is a pattern, not a template: reuse the structure and the visual discipline, never copy another video's words, numbers, or brand.

**Structure (for a 30–60s explainer, ~12–14 beats — denser than the old 3–4 steps).**
1. Hook: one specific painful moment, with one concrete number on screen. Never open on a logo or tagline.
2. Tension: three concrete, relatable examples of the problem — each a tiny scene/character, not an abstract claim.
3. Product: show the product working, not described — a dashboard with a scan/progress state and an itemized list where each item has its action. HOLD this beat longer than the others so the viewer can actually read it.
4. Proof: animated counting numbers — a monthly total counting up into a yearly saving. Numbers never sit static on screen; they count.
5. Logo transition: one spinning/zooming logo moment on the brand color.
6. End card: brand color + logo + ONE short tagline; make one key word pop by reversing it in a black box.
7. Meta beat (creator content only, not for client explainers): a brief shot of the code/timeline that made the video, when the video itself is the story.

**Visual discipline (this is why it looks expensive, not the effects).**
- Flat cartoon characters built from simple rounded shapes (a TV, a price tag, an app icon, a pocket). Simple shapes, bold outlines, no detailed illustration.
- Huge bold sans-serif type. One vivid brand color dominating, one soft contrast background, dark type. Key words highlighted in the brand color or reversed in a black box.
- Fast cuts, short holds (~2–3s per beat), one longer hold on the product/proof beat. One motion moment per beat — same restraint rules as above.
- On-screen text = short punch lines (a few words), never sentences. In the reference the voiceover carries full sentences and the screen shows only the punch line.

**Sound — narration (Kokoro, local, built in).**
The reference is carried by a spoken voiceover throughout. This pipeline now has one: the Kokoro runner (see NARRATION below) generates English narration locally on the user's PC — fixed preset voices, no key, no bill, offline after the first model download. If the user asks for a cloned voice ("use my voice") or a custom voice, say plainly that cloning is not available in this pipeline, and offer a preset voice. Never claim cloning exists.

**Format note.**
The explainer itself is 16:9, 1920×1080 (the reference is 60fps; this pipeline's default stays 30fps — the look comes from motion design, not frame rate, and 60fps doubles render time). A vertical reel that films a laptop playing the explainer is a separate wrapper deliverable, not part of the explainer.

## DIFFERENT EVERY TIME (variety rule — the market-win lesson)

Every video must look like it belongs to ITS product only. Never reuse a previous video's metaphor, palette, characters, or camera language — a viewer who has seen one of our videos must not feel they have seen the next one.

**Derive the look from the product, not from the last video.**
1. Metaphor: ask what the product IS in the user's life (a journey? a scan? a rescue? a map?) and build the video around that one idea. A navigation product becomes a journey; a money product becomes a scan-and-count. The metaphor comes from the product, never from a previous deliverable.
2. Palette and type: take them from the product's own brand/world (its app colors, its screens), not from the last video's palette.
3. Characters and world: flat cartoon shapes for one product, a 3D world for another, the product's own interface for a third — the form follows the product. One reference told its whole story through the product's own interface (routes, cards, banners) with one continuous camera journey and no narrator character at all; another told it through flat cartoon scenes with a voiceover. Both work because each form fits its product.
4. Camera: a continuous flowing journey suits a product about movement/places; fast cuts suit a product about many small pains. Pick per product.

**What stays constant across every video (this is the quality system, not the look).**
- The motion system: easing never linear, stagger/anticipation/follow-through, beat-synced events, max 3 colors, one typeface, one motion moment per beat.
- The QA loop: contact sheet → look → fix → final. A video ships only after its frames were actually looked at.
- The grounding rule: every fact, number, and feature comes from the real product/site, never invented.

**What is forbidden.**
- Reusing a previous video's style as a template ("same as last time but for this product").
- Copying another video's words, numbers, brand, or tagline — patterns only, never content.
- Claiming a tool made the video unless the pipeline actually made it (code → frames → ffmpeg here).

## NARRATION (Kokoro-82M, local CPU, no key)

When the video needs a voice (SaaS explainers and product spots almost always do):
1. **Write a narration script** — the beat sheet's story in full spoken sentences, NOT the on-screen punch lines. Size it to the video: ~15 characters per second (a 90-second video needs ~1,350 characters). Save it as `narration.txt` next to the animation file.
2. **Generate the voice** from the project root (first run downloads the q8 model once, ~88MB, then it works offline; CPU-only; on a weak PC allow a few minutes via a longer timeout):
   `node tools/tts/narrate.mjs --textfile narration.txt --out narration.wav --voice af_heart --dtype q8`
   Default voice `af_heart` (clear American narrator). Speed via `--speed` (1.0 normal, 0.5–2.0 range). The runner sentence-chunks the script and joins the pieces with ffmpeg.
3. **Render the video silent first** (normal workflow), then **mux the narration over it**:
   `ffmpeg -i <video-noaudio>.mp4 -i narration.wav -c:v copy -c:a aac videos/<name>.mp4`
   No `-shortest`: the script is sized to the video length, so they end together. If the narration comes out more than ~10% shorter or longer than the video, fix the script length (add or cut a sentence) and re-generate — never ship a video whose voice ends halfway or talks over the end card.
4. **Deliver the muxed file** as the video link. The silent render is an intermediate, never the deliverable, when narration was requested.

## Render (Chrome + ffmpeg, no new installs beyond ffmpeg)

Check first: `ffmpeg -version`. If ffmpeg is missing, tell the user to install it (Windows: winget install ffmpeg) — do not fake a video.

Frame capture with headless Chrome virtual time (frame k at time k/fps seconds):
- `chrome --headless=new --disable-gpu --hide-scrollbars --window-size=1920,1080 --virtual-time-budget=<ms> --screenshot=frame_000.png animation.html`
- Loop budgets from 0 to durationMs in steps of 1000/fps. For 9:16 use --window-size=1080,1920.
- Stitch: `ffmpeg -framerate 30 -i frame_%03d.png -c:v libx264 -pix_fmt yuv420p videos/<name>.mp4`
- Verify: `ffprobe` duration matches the beat sheet; file size > 0.

## QA (two paths — use whichever the current model supports)

- Vision model (GPT, Claude, Gemini, Qwen, GLM with vision): actually LOOK at the contact sheet frames and list fixes before the final render.
- Text-only model (DeepSeek Flash etc.): deterministic checks only — frame count equals duration × fps, ffmpeg exit code 0, ffprobe duration matches, no screenshot step failed. Say which QA path was used in the final reply.

## Rules

Only the user's own brief, assets and words. Never invent facts, numbers, people or reviews. If the user gives real screenshots/logos, animate the real thing — never redraw a product UI from imagination. If render fails, report the exact error, never a fake link.
