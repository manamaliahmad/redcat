# adopt.md — RedCat adopted learnings

This file is the single readable record of what RedCat has learned from its
own runs. The harness reads it at the start of every run and injects it into
the model-visible context. The model APPLIES these entries to the new case;
it does not decide whether they are true. The user AMENDS them: if the user
dislikes something adopted here, the harness researches options, the user
picks one, and this file is updated with approval.

Rules for entries (every entry must have all five):
- ID: stable identifier (ADOPT-###).
- Date: when the lesson was adopted or rejected (YYYY-MM-DD).
- Rule: the adopted rule, or the rejected pattern.
- Reason: why it was adopted or rejected.
- Evidence: run, test, or source that proves it.

Writes to this file are approval-gated: only the harness writes, only after
user approval. The model never edits this file directly.

## Adopted

- **ADOPT-001** (2026-11-01) — Rule: Never trust a tool or run "done" status; verify files plus a check report. Reason: the harness false-done trap — a terminal command over 2000 chars was rejected without an approval card, yet canned mock results still ended "done". Evidence: RedCat harness mock-test runs, 2026-11-01 to 2026-11-02 (7-points 40/40, selfdev 18/18, deep-loop vision 20/20, curator 20/20, mock loop 11/11).
- **ADOPT-002** (2026-11-02) — Rule: Terminal commands must not contain double quotes. Reason: cmd.exe argv quoting mangles backslash-escaped JSON; use base64 writes or single-quoted PowerShell, chunked at line boundaries, each command at most 2000 chars. Evidence: deep-loop wiring fix, 2026-11-02 (quote-free PowerShell form proven twice after the first wiring attempt failed on mangled JSON).
- **ADOPT-003** (2026-11-01) — Rule: A mock test proves the LOOP only, never model quality. Reason: canned mock replies cannot show real-model behaviour, taste, or failure modes. Evidence: RedCat mock-test rounds, 2026-11-01 to 2026-11-02 (all mock suites passed while real-model quality remained unproven, pending a working key).

## Rejected

- **ADOPT-004** (2026-11-01) — Rule (rejected pattern): Claiming "tests pass" without quoting exact tool output. Reason: the EVIDENCE RULE — an unquoted claim is not proof; quoting exact output is what closes the verify loop. Evidence: 7-points implementation, 2026-11-01 (evidence-capped run records, 500-char excerpts, quote-exact-output rule).

## Pending review

(none)
