# topic-to-video

When to use: the user gives a topic and wants a short video from it (Reel / Short / Feed clip) — topic in, finished video out, with the user approving the script before anything renders.

## What this is (inspired by the MoneyPrinterTurbo pattern, built RedCat's way)

The pattern is: TOPIC -> SCRIPT -> VOICE -> VIDEO -> POST. RedCat already has the pieces for this: the motion-video skill (code animation rendered frame by frame, then ffmpeg), Kokoro text-to-speech, and ffmpeg on the PC. This skill ties those pieces together in one approved order. Nothing here is copied code from any other project — it is RedCat's own procedure, using RedCat's own tools.

This is NOT an autopilot money machine. It makes one video at a time, from a topic the user owns, with the user's script approval in the middle. It does not promise views, virality, or income.

## Procedure (follow in order, never skip a gate)

### 1. TOPIC — confirm before anything else
Ask or confirm, in one short message, only what is missing:
- Topic (one line, the user's own topic — never a copied video's topic)
- Length: default 30 seconds, max 3 minutes for this skill
- Ratio: default 9:16 (1080x1920, Reels/Shorts); also 16:9 (1920x1080) or 1:1 (1080x1080) if the user asks
- Language and voice (Kokoro voice, if the user has a preference)
- Media style: motion-graphics (default, via the motion-video skill) or stock clips (only free stock the user is allowed to use — see Refuse list)
Do not start scripting until topic, length, and ratio are settled.

### 2. SCRIPT — write it, show it, STOP for approval
The model writes a script with, for each beat: on-screen text, narration text, and duration. Keep claims factual — no invented numbers, prices, testimonials, or guarantees. Keep it in the user's language.
Show the full script to the user and STOP. Do NOT render, do NOT generate voice, until the user approves the script (or edits it). This gate is the whole point: a bad script rendered fast is still a bad video.
If the user edits the script, use the edited version only.

### 3. VOICE — Kokoro TTS, verified
Generate narration per beat with Kokoro TTS into the run's folder. After generation, verify with a read-only check that every audio file exists and has a non-zero size. If a beat has no audio, fix that beat before rendering — never render a silent beat and call it done.

### 4. VIDEO — build, subtitles on, music optional
Build the video with the motion-video skill (one self-contained HTML animation, contact-sheet QA, ffmpeg render) when the style is motion-graphics. When the style is stock clips, use only clips the user owns or free stock with a licence that allows this use; never download or reuse another creator's video, and never use copyrighted music.
Burn subtitles in (readable size, high contrast, not covering the speaker's face area in stock clips). Background music is optional, local/licensed only, at a lower volume than narration.
Output goes to the videos/ folder, named after the topic (short, no spaces issues). Verify with ffprobe or dir: file exists, duration matches the script within a few seconds, ratio matches the requested ratio.

### 5. QA — watch before you hand it over
Before the final reply, re-check the rendered file: it plays, subtitles are readable, audio and text match, no black frames at the start or end, ratio is correct. If any check fails, fix it or say the video FAILED — never hand over a broken file as done.
End the final reply with the direct link (http://localhost:3000/videos/<name>.mp4), the length, and the ratio.

### 6. POST — manual only, always
The user posts the video themselves, from their own app, in their own name. RedCat NEVER auto-posts to Instagram, TikTok, or YouTube, NEVER bulk-posts, and NEVER schedules a post without the user approving that exact post, on that exact date, first. If the user asks for auto-posting, explain this rule in one line and offer the manual link instead.

## Refuse list (never do these, even if asked)
- Auto-posting or bulk generation (10 videos at once, daily autopilot, "post while I sleep")
- Re-uploading, cutting, or remixing another creator's video (including any YouTube link that is not the user's own or Creative Commons with permission)
- Copyrighted music, stock, or footage without a licence
- Viral, views, or income promises ("this will go viral", "earn $X")
- Rendering before the user approves the script
- A script with invented facts, prices, or testimonials
- Publishing under a fake brand, fake account, or someone else's name

## Verification checklist (every video, no exceptions)
- [ ] Topic, length, ratio confirmed with the user
- [ ] Script shown and approved before render
- [ ] Every narration audio file exists and is non-zero
- [ ] Rendered file exists in videos/, duration and ratio verified
- [ ] Subtitles readable, audio in sync, no black start/end frames
- [ ] Final reply has the video link, length, and ratio — and no auto-post claim

## Real-task test (how this skill was checked)
Skill file installed in the RedCat skills folder so the next agent run's skill catalog includes it (catalog refreshes on file change, no server restart needed). Render stage checked separately with ffmpeg on the PC (a short test render completes and ffprobe reports the correct ratio/duration). A full model-driven test — user topic in, script approval, rendered video out — still needs the user's paid model key, exactly like the pending DeepSeek test, and must not be claimed as passed until that run actually happens.
