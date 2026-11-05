# deep-prompt

description: When the user asks for a prompt — image generation, video, or turning their own vague words into a precise prompt — read this skill first and write the prompt from deep analysis, never from the first generic words that come to mind.

## When to use
- The user asks "write a prompt for this" for an image, a video, a post, a website, or any AI task.
- The user's request is vague ("a nice image", "cool video") and needs turning into something a model can actually execute.
- The user wants to improve a weak prompt they already have.
- The user gives a reference (an image, a reel, a site) and wants a prompt that captures it.

## What a prompt is
A prompt is a specification, not a wish. A model cannot paint what you did not name. Every prompt must name: the subject, what it is doing, where it is, how it looks, how it is framed, how it is lit, and what must NOT appear. If a detail is not in the prompt, the model invents it — and that invention is where "this did not turn out like that" comes from.

## Procedure — deep analysis first, prompt second

### 1. Understand the user's words deeply (before writing anything)
Restate the intent in one line, in your own words. Extract: who it is for, where it will be used (post, site, video, print), what feeling it must give, and what the user already decided (subject, style, colors, any text on it). If one load-bearing detail is missing (the subject itself, or the language of on-screen text), ask at most 2 short questions. If the brief is clear, proceed and state your assumptions in one line — do not interrogate the user with five questions.
Honest limit: this agent is text-only and cannot see image pixels. If the user attaches a reference image, say so and ask them to describe it (subject, colors, mood, composition) — never pretend to have seen it. The deep analysis then works from their description.

### 2. Analyse the subject deeply — so deep it could not be guessed from the first sentence
For an IMAGE, name at least 5 concrete details across these lenses (never fewer, never generic-only):
- Subject: the exact thing, its attributes (age, material, color, size, expression, clothing, pose).
- Environment: place, time of day, weather, background elements.
- Composition: framing (close-up / wide), camera angle (eye-level / low / top-down), depth (foreground, subject, background).
- Light: source, direction, quality (soft morning light, harsh noon sun, warm lamp glow).
- Color: palette in words (2–4 named colors, never just "colorful").
- Texture and mood: surface feel, atmosphere, emotion in one line.
For a VIDEO, add: motion (what moves, how), camera move (static / push-in / pull-out / pan — one move, with a reason), duration and pacing, transitions, and on-screen text if any.
For the USER'S OWN WORDS (any prompt): pull out entities, constraints (length, language, format), audience, tone, and the one thing the result must NOT do.

### 3. Write the prompt
- One structured prompt: subject + action + environment + composition + light + color + style, in that order where it fits.
- Name the style exactly (for example "soft 3D cartoon render", "editorial photograph", "watercolor illustration") — never "good style".
- Banned bare words (never use them standing alone): beautiful, nice, amazing, cool, good, high-quality, realistic (without saying what makes it so). Every adjective must be anchored to a concrete detail.
- Negatives: always add what must NOT appear (wrong anatomy, extra limbs, text errors, watermark, blur, clutter) where the tool supports negative prompts; otherwise fold exclusions into the prompt ("no text", "no people in background").
- Length: as long as the detail needs, as short as it can be. Cut filler, keep every named detail.

### 4. Show it, with why
Always show the full prompt to the user first — never run it hidden inside a long or paid generation. Under it, one short line per key choice: what you picked and why (subject detail, style, light, negatives). Offer at most ONE variation unless the user asks for more. If the prompt feeds another RedCat pipeline (motion-video for video, world-class-website for a site), say which skill runs next — the prompt is the input, not the deliverable.

## Pitfalls (refuse list)
- Never copy a real brand's, artist's, or creator's work as-is into a prompt. Style inspiration in your own words is fine; reproducing a living artist's exact work is not.
- Never promise the output will match the prompt exactly — models vary; the prompt raises the odds, it does not guarantee the frame.
- Never invent facts about the user (names, prices, places, claims) to fill a gap — ask, or use a clearly-labelled placeholder.
- Never write prompts for harmful, deceptive, or illicit content (fake endorsements, impersonation, misleading claims).
- Never hide the prompt: the user always sees the exact text that will run.
- Never write a generic prompt and call it deep — if it could fit any subject, it failed this skill.

## Verification — PC test rule (ALWAYS)
A skill is done only when it is TESTED on the user's PC:
1. The skill loads: skill_read returns this file (ok:true) on a real agent run.
2. A test run (real model, or a mock run when no key is present) produces a prompt from a fresh brief that passes this checklist: at least 5 concrete subject details, a named style, named light, composition named, negatives present, prompt shown plus a why-line, no banned bare words standing alone.
3. A mock run proves the loop (skill loads, procedure runs) — it does NOT prove model quality. Real-model quality is proven only by a real-key run.
4. Until the test passes, never tell the user the skill is done.
