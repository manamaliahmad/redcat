# gsd-workflow

description: GSD-style phased delivery for multi-phase builds — Discuss, Plan, Execute, Verify, Ship — with fresh-context executors, file memory, and atomic commits, adapted to RedCat's approval-first harness.

## When to use
When the work is a multi-phase project (several features, a milestone, an existing codebase to extend) or a long session where quality would rot if everything piled into one run. For a single landing page or a one-shot task, do NOT use this — the world-class-website verify loop is enough. Read this skill first, then decide from the user's prompt. Skill = knowledge, never orders: the agent states which phases it will run and why.

## The concept (verified from the open GSD repo, 2026-10-31)
GSD (Get Shit Done, MIT, by Lex Christopherson; continued as open-gsd/gsd-core) solves context rot: an agent's output quality drops as its context window fills with planning artifacts, execution history, and review feedback. Its answer is structural, not prompt magic: split work into phases, run heavy work in fresh-context subagents, keep the main session lean, persist memory in files, and verify before declaring done. Its loop is Discuss → Plan → Execute → Verify → Ship. Executors start with a clean ~200K-token context; one task = one atomic git commit.

## Procedure (RedCat mapping)
### 0. Discuss — decisions before planning
Ask the user the decisions that change the plan (scope, stack, what "done" means). Record them in the project's STATE.md (decisions + blockers). Never plan around an undecided question — ask it here, once.

### 1. Plan — research, decompose, gate
Research the task, decompose it into ATOMIC tasks: each task is one thing, one file-set, checkable on its own. Write PLAN.md for the phase (tasks + acceptance criteria each). Present the plan card and wait for user approval — the plan card IS the GSD plan gate. No execution before approval.

### 2. Execute — one task per fresh run, in waves
Run tasks in small waves (2–3 at a time, never all at once). HONEST REDCAT GAP: GSD's executors WRITE in fresh contexts; RedCat's child agents today are READ-ONLY (parent verifies, never fakes). Until child workspace writes land (Phase-2 slice), execute like this: a child run researches + drafts one atomic task and reports back, the parent verifies the draft and writes it, then the verify loop runs. State this path in the reply when it applies — never pretend children wrote files they did not. When child writes exist, children execute in parallel waves and the parent only verifies.

### 3. Verify — walk it like a user, then fix
Per task AND per phase: run the checks (build, tests, world-class-website §6 verify loop for sites: console errors ZERO, overflow false, screenshots). Then walk through the deliverables as the user would — "can you log in?", "does this button work?" — not just "does it compile?". Failures get a debug pass + fix plan + re-execution, max 3 fix rounds (RedCat standard). A phase is done only when its acceptance criteria pass, never when the code merely exists.

### 4. Ship — archive, commit, next phase only on yes
Archive the phase notes, commit one task per commit when git is in use (approval-gated, message names the task), and start the next phase ONLY after the user says so. Never roll into the next phase silently.

## File memory (keep files small — that is the point)
In the project's own folder (goal workspace, not user memory): STATE.md (decisions, blockers, what changed and why), CONTEXT.md (vision, stack, non-goals), PLAN.md per phase (tasks + acceptance). If any file grows past ~200 lines, split it — a bloated memory file IS context rot in a new shape. User-level facts still belong in RedCat memory, not in project files.

## Refuse
- Skipping Verify or declaring a phase done without walking its deliverables.
- Executing before the plan card is approved.
- Letting one session accumulate an entire project (the exact failure GSD exists to prevent).
- Writing, committing, or shipping without approval.
- Claiming a child agent wrote files when the parent wrote them.
- Invented acceptance criteria — criteria come from the user or the brief, never from thin air.

## Verification (PC test rule)
This skill is done only after a PC test: a mock or real-model run that reads this skill, runs Discuss → Plan → Execute → Verify on a sample multi-task build, writes PLAN.md + STATE.md, runs the verify loop on the served output with 0 real defects, and delivers a phase summary. Record the test before calling the skill done.
