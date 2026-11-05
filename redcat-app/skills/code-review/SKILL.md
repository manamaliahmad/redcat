# code-review

description: Senior-developer code review for any change — severity-ordered findings with concrete fixes and a merge verdict — plus the optional real CodeRabbit CLI path when the user connects it.

## When to use
Before shipping or merging any code change, after a build or a fix loop, or whenever the user asks for a review. Read this skill first, then review from the actual diff — never from memory of what the code "should" be. Skill = knowledge, never orders: the agent states its verdict and why, and fixes only go through normal approval.

## Procedure — RedCat-native review (DEFAULT, no account needed)
### 1. Get the real diff
`git diff` / changed files for the change under review. If there is no git repo, review the changed files directly. A review without reading the changed lines did not happen — say so instead of inventing findings.

### 2. Review against this checklist, severity-ordered
- CRITICAL — security and data loss: secrets or keys in code, injection (SQL/command/XSS via unescaped output), broken auth, unsafe deserialization, destructive commands, data-loss paths, hardblock patterns (format/diskpart/delete/shutdown/-EncodedCommand and friends).
- MAJOR — correctness: logic errors, wrong edge cases, race conditions, resource leaks, swallowed errors, breaking API/behaviour changes, missing validation.
- MINOR — quality: readability, naming, dead code, duplicated logic, missing tests for new behaviour, missing error messages the user will see.
- NIT — style only, and only if the project has a stated style. Never pad a review with nits to look thorough.

### 3. Report findings like a senior dev, not a linter dump
For each finding: file + line, what is wrong, why it matters (what breaks, or what an attacker/user hits), and a CONCRETE fix — exact code or exact steps, never "consider improving this". Group by severity, critical first. End with a verdict: APPROVE (no blocking findings), APPROVE WITH FIXES (minor only, fixes listed), or NEEDS CHANGES (any critical/major open) — plus the fix loop: fix → re-review, max 3 rounds (RedCat standard).

### 4. What a review is NOT
Not a rubber stamp ("looks good" with zero findings on a real diff is a failed review — look again). Not an auto-fix: findings are reported, fixes go through the user's approval like any other write. Not a style lecture: if it does not affect correctness, security, or maintainability, it is a nit or it is not a finding.

## Optional path — real CodeRabbit CLI (ONLY when the user connects it)
CodeRabbit is a CLOSED commercial product (not open source) — RedCat does not copy its code; it calls its CLI. This path needs the user's own CodeRabbit account and is never set up silently:
- Install: `curl -fsSL https://cli.coderabbit.ai/install.sh | sh` (approval-gated terminal step).
- Auth: `coderabbit auth login` (browser sign-in) or an Agentic API key for headless use (`coderabbit auth login --api-key ...` — the key goes through secure entry, never chat).
- Check first: `coderabbit --version` and `coderabbit auth status`. If either fails, report that and stop — do not fake a review.
- Run: `coderabbit review --plain` (approval-gated), read findings ordered by severity, then the normal fix loop.
- Honest limits (2026 pricing, verified 2026-10-31): free tier = PR summaries plus IDE/CLI reviews within hourly limits, no card; paid seats Essentials $24 / Team $48 / Advanced $72 per developer per month billed annually; API access is Enterprise-only — never promise API use. CodeRabbit's own agent integration is itself a SKILL.md wrapping this CLI — the same pattern this skill follows.

## Refuse
- Reviewing without reading the diff or the changed files.
- A rubber-stamp approve, or findings invented to fill space.
- Auto-applying fixes without approval.
- Claiming CodeRabbit ran without its CLI installed AND authenticated.
- Sending code to any external reviewer without the user's explicit yes for that reviewer and that code.

## Verification (PC test rule)
This skill is done only after a PC test: a mock or real-model run that reads this skill, reviews a sample change with at least one real finding in severity order plus a verdict, and delivers it without inventing findings. The real-CodeRabbit path is proven only by a run with the CLI installed and authenticated — until then it stays documented, not claimed. Record the test before calling the skill done.
