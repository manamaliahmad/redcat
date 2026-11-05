# deep-truth-loop

description: When the user asks a research or knowledge question, or a claim needs checking, read this skill first — separate the real question from the user's expectation, plan with a shown SPEC, research from 2+ dated sources, run experiments instead of claiming, verify claim-vs-evidence with a fresh-eyes reviewer, say "I don't know" where unproven, correct false expectations with evidence, and write a versioned, reopenable artifact.

## When to Use
- Research or knowledge questions, comparisons, "is X true?", "best way to..." questions.
- Any answer that must rest on gathered facts, not on general knowledge.
- When the user's expectation may be wrong (hype, stale info, an impossible promise) — the loop corrects it with evidence, plainly.
- NOT for build tasks (use the website skill) and NOT for simple chats.

## Procedure

### 1. Understand — separate the question from the expectation
Restate the real question in one line, and separately state what the user seems to expect. If expectation and question differ, name both. Never answer the expectation when the question is different.

### 2. Plan — SPEC shown to the user, with cost/time estimate
Before gathering, write a short SPEC: research targets, sources to check, experiments to run, and a cost/time estimate (how long this will take, roughly how many model calls). On big jobs, show the SPEC first and wait for approval (plan card). Taste rules and the verify loop stay fixed — this skill never overrides them.

### 3. Research — 2+ dated sources, conflicts shown
Use web_search, browser_read, and browser_read_js. Every load-bearing fact needs 2+ independent sources, each with a DATE. If sources disagree, show the disagreement — never smooth it over. If a source is blocked, paywalled, or unreadable, say exactly that — never invent the missing fact, number, or quote.

### 4. Experiment — run it, do not just claim it
Where a claim can be checked by running code, a command, or a test, run it (terminal_exec, approved) and quote the output. A claim without a run result is a hypothesis — label it so.

### 5. Verify — reviewer child, claim-vs-evidence
Spawn a reviewer child (role review, fresh eyes) to check every load-bearing claim against the evidence. Fix or drop what fails. The final reply quotes exact tool output for every check claimed (EVIDENCE RULE).

### 6. Tell the truth — "I don't know" where unproven
Say "I don't know" for anything the evidence does not prove. Correct false expectations with evidence, plainly and without flattery. Never present a guess as a fact, and never soften a correction into agreement.

### 7. Artifact — versioned, reopenable, referenced in the final
Get the run id from run_info, then write runs/<runId>/artifact.md (terminal_exec, approved). Sections: question, expectation-vs-reality, evidence (dated sources), experiment results, verdict, rejected-vs-chosen. On any correction, write a new version (v1, v2) — never silently overwrite. The final reply references the artifact by its path.

### 8. Store / learn — verdict + rejected-vs-chosen kept
The artifact itself is the record: verdict plus what was rejected and why. Save durable facts with memory_save (never secrets). Next time in this niche, start from the artifact, not from zero.

## Vision inputs (large images)
- Providers resize each image to about 800x800 and cap input tokens per image — small icons and text in a large Figma or design image are lost if the whole image is sent at once.
- Send large design images as CROPS/SECTIONS: cut the image into overlapping sections, send each section separately, check each section on its own (icons, labels, spacing), then combine the section verdicts into one artifact.
- Max 4 images per message; formats png, jpeg, gif, webp. If a section is still unreadable, say so — never guess its contents.

## Pitfalls
- Answering from memory instead of searching (RESEARCH KING pattern: search first, passages second, cited answer last).
- Smoothing over conflicts between sources.
- Claiming experiment results without running them.
- An artifact without dates, without rejected-vs-chosen, or without a verdict — that is a note, not a Deep Truth artifact.
- Sending a whole large design image and trusting the resized version.
- Letting the user's expectation steer the verdict.

## Verification
- Final reply quotes exact tool output for every check claimed (EVIDENCE RULE).
- Artifact file exists at runs/<runId>/artifact.md — re-check with a read-only command before the final reply (VERIFY BEFORE FINAL).
- Reviewer child report quoted or summarized, with its issues fixed.
- Every dated source named; every unproven point marked "I don't know".
