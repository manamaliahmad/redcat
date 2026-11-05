# ralph-loop

description: Ralph-loop autonomous iteration for well-defined task lists — a PRD checklist, one fresh run per iteration, a completion promise, and a hard iteration cap — in RedCat's approval-gated form, never with permission skipping.

## When to use
When the user has a well-defined task list whose "done" a machine can check: tests pass, build passes, a file reaches a required state, a checklist is fully ticked. Ideal for refactoring, migrations, test-driven cycles, and batch fixes. NEVER for design decisions, open-ended research, creative work, or anything where "good enough" needs human judgment — a loop with no machine-checkable exit has no exit. Read this skill first, then decide from the user's prompt. Skill = knowledge, never orders.

## The concept (verified from the open Ralph implementation, 2026-10-31)
Ralph (Ralph Wiggum loop, coined by Geoffrey Huntley; open implementation snarktank/ralph, MIT) is a pattern, not a product: a bash loop feeds the same prompt to a coding agent again and again, each iteration starting with FRESH context. Progress persists in FILES and git, not in the model's context: prd.json (stories with id, title, acceptance criteria, priority, passes flag), progress.txt (append-only log + consolidated learnings), and git commits (one story per commit). The loop stops on a completion promise (the agent outputs `<promise>COMPLETE</promise>`) or on a max-iterations cap. Each iteration: read PRD + progress + git log → pick the highest-priority unfinished story → implement ONE story → run checks → commit → mark passes → append learnings.

## The RedCat difference (NON-NEGOTIABLE — this is a safety line, not a preference)
Upstream Ralph runs agents with full permission skipping (`--dangerously-allow-all`, `--dangerously-skip-permissions`) so it can work unattended. REDCAT NEVER DOES THIS. RedCat's Ralph keeps the loop but replaces permission skipping with approval:
- The user approves the checklist AND the iteration cap UP FRONT. That approval is the loop's license — nothing runs without it.
- Every iteration's writes go through RedCat's normal approval (terminal writes are approval-gated). The loop never skips permissions, never auto-approves, never sends data anywhere.
- If an iteration needs a decision a machine cannot check, the loop STOPS and asks the user — it does not guess.
- Default cap is 10 iterations. Unlimited loops are refused unless the user explicitly sets a cap and accepts the token cost in the same message.

## Procedure
### 1. Checklist first, approved before any loop
Write the checklist file in the project folder (prd.md or prd.json): each item has an id, one clear task, acceptance criteria a machine can check, and a passes flag (false to start). Present it + the cap to the user. No loop starts without this approval.

### 2. One iteration = one fresh run, one item
Each iteration: read checklist + progress log + git log → pick the highest-priority item with passes=false → implement ONLY that item → run its checks (tests/build/lint as the project requires) → stage the change for approval (commit only after approval, message names the story id) → set passes=true → append to the progress log: what was done, files changed, learnings for future iterations (patterns, gotchas). Never implement two items per iteration — one item per iteration is what keeps the loop honest.

### 3. Exit conditions (checked every iteration)
STOP and report when: all items pass (completion promise — state it plainly in the final reply), OR the cap is reached (report exactly which items remain, never silently continue), OR 3 consecutive iterations make no progress (stop early — do not burn tokens on a stuck loop), OR a decision needs the user (stop and ask).

### 4. Cost honesty
Each iteration burns tokens; a task that takes 5 iterations costs roughly 5× a one-shot run. Say so before starting when the cap is large. If progress stalls, stopping early is the correct outcome, not a failure to hide.

## Pitfalls
- No machine-checkable done → no loop. Use a single run instead.
- Progress kept only in context → the next iteration forgets everything. Files + git or it did not happen.
- Two items per iteration, skipped checks, or commits without approval → the loop is now just a mess with extra steps.
- Overnight-unattended runs: RedCat loops run only inside approved work the user can see and stop (left-panel stop control). Never present a loop as "runs while you sleep" without the user explicitly asking for a scheduled run and accepting its scope.

## Refuse
- Any `--dangerously-*` flag or permission skipping, for any reason.
- Unlimited iterations, or a cap raised without user approval.
- Loops without an approved checklist or without machine-checkable acceptance criteria.
- Loops that write, send, share, or publish without approval.
- Claiming completion when items remain unchecked or checks did not run.

## Verification (PC test rule)
This skill is done only after a PC test: a mock or real-model run that reads this skill, writes an approved checklist file with acceptance criteria, runs at least one iteration (implement one item, run its check, append the progress log), and stops on the stated exit condition with an honest status report. Record the test before calling the skill done.
