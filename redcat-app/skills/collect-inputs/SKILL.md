---
name: collect-inputs
description: Use after a design.md exists, when the user must supply their own content before a build. Turns design.md section 9 into ONE message asking for everything at once (photo, name, tagline, services, images, colours/logo), with a skip option. Never drips questions one by one.
---

# Collect Inputs — one message, everything at once

## Choice rule (hard, never overridden)
This skill gives KNOWLEDGE (flow, rules, formats), never orders. The
MODEL decides wording from the design.md and the user's prompt. It never
dictates content, and it never invents the user's facts.

## When to use
- A design.md with a section 9 (Required inputs) exists and the build
  is waiting on the user's own content.
- Do NOT use before design.md exists — without it there is nothing to
  turn into a message. Do NOT use to ask questions the design.md
  already answers.

## Flow
1. Read design.md section 9. Every row becomes one line of the message.
2. Write ONE message (template below). Required slots first, optional
   slots second, skip option last. One message, not a drip of questions.
3. Wait. Build only after the user replies (or explicitly says to use
   placeholders). Never build on assumed content for required slots.

## Message template
> I understood your reference site's design (<one-line mood + layout,
> e.g. "dark, big heading, centre portrait, scroll cards"). Now send
> me this, all at once:
>
> - Your photo (required — the hero cannot be you without it)
> - Name (required)
> - A one-line tagline (or write "skip" and I will draft one)
> - Your 3–5 services (or "skip" — I will leave marked placeholders,
>   I will not invent your services)
> - Project images, if you have them (or "skip")
> - Your colours or logo, if you have them (or "skip" — I will use
>   the design.md palette and a text logo)
>
> Anything you write as "skip" stays a labelled placeholder until you
> replace it. Nothing is published without your approval.

## Rules (locked)
- One message. Never ask for one slot, wait, then ask for the next.
- Required slots (hero photo, name) are required because the site
  cannot be itself without them. Never silently substitute a stock
  photo or a guessed name.
- Skip means a MARKED placeholder/draft, never an invented fact. The
  agent must NEVER present invented services, prices, addresses, or
  numbers as if they were the user's real business facts. A tagline
  draft is fine; prices and services are not.
- If the user replies with partial content, build with what exists and
  marked placeholders for the rest — and list exactly what is still
  placeholder in the delivery summary.
- No write to sites/ happens in this step. This skill only produces
  the message.

## Check (before sending the message)
- [ ] Every section 9 row appears exactly once
- [ ] Required vs optional is marked on each line
- [ ] Skip option is present and its meaning is stated
- [ ] No invented business fact is smuggled in as an example
- [ ] The message is one message, not a thread of questions

## Verification (how this skill is proven — mock proves loop only)
- Skill-load test (mock): skill_read this skill + a sample section 9
  table → one message containing every row, required marked, skip
  present. Mocks prove the LOOP, never model quality.
