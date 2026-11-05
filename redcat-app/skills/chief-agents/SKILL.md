# chief-agents

description: When the user asks to create, list, steer, or delete an agent, or gives a long task, read this skill first — the chief runs the roster, children stay read-only, and the main chat never blocks.

## When to use
- The user says "make an agent", "delete the agent", "do this work in the background", or wants a hired team.
- Any long task that should run while the chief stays fully available for the user.
- A specific agent for a specific task (one role, one tool subset, one workspace slice).

## Procedure

### 1. The chief never blocks
Long work goes to a child. The chief's chat stays fully usable during any child run. Progress shows in the left-panel rows (agent lottie plus stop button); on finish, the row disappears and the main chat gets a finish popup plus a result card. Background work never steals foreground focus.

### 2. A named roster, not anonymous spawns
Every child gets an id, a name, a role, a task, a tool subset, a model, a parent, and a workspace slice — and the roster is listable and addressable. Continue or steer a running child by name; never launch a duplicate while one is already running that task. Record who created whom, for what task, and when it ended, so no long task ever leaves an orphan agent.

### 3. Create — an agent is a small definition, made only on the user's word
An agent is a definition: name, role prompt, tool subset, model, workspace folder inside the project. Create only when the user says so, for one specific task. The child inherits the chief's approval policy, tightened: read-only, approval Never, never writes, never sends, never asks the user anything. A child that needs to write does not exist — the chief writes, after the user's approval.

### 4. A workspace slice — a part of the PC, not the whole PC
A child works only in its own folder (its slice of the project). It cannot touch the chief's tree. It returns a typed summary, not a wall of prose — the parent sees the summary, never the child's full trace. Isolation plus summary-only return is what keeps the chief's context clean while a long task runs.

### 5. Steer and kill — without killing the chief
Steer redirects a running child without stopping it. Kill/delete stops the child and removes it from the roster; on the user's word it also deletes the child's workspace slice. Never kill the chief. Never delete memory files as part of deleting an agent — memory is separate and survives. Deletion always happens on the user's explicit word, and the reply confirms exactly what was deleted.

### 6. Memory that sharpens — the chief's job, always approval-gated
- Remind proactively: when a current topic matches past work or a past decision, surface it quoting the user's own words, with the date — "you once said it this way" — for both old work AND old decisions.
- Review ritual: after a turn or session, propose memory and skill writes as staged changes. Every proposal needs the user's approval before it lands — never straight to the store, never by a background fork writing unseen.
- Curator: never delete, only archive (recoverable); pinned entries bypass auto-transitions. Starting defaults: review every 7 days, stale after 14 days, archive after 30 days.
- Promotion: a lesson that proves reusable graduates from episodic memory into a skill — the bank gets cleaner rules over time, not a longer transcript.
- Compaction that does not lie: prune tool results first, then summarize at boundaries, in place, with a deterministic fallback; every summary points back to the raw transcript and never replaces it. Every memory entry carries provenance (source plus date) so a correction can be traced.
- Standing rules are never touched by summarization. A bad sharpening is one undo away: snapshot before any memory rewrite.
- What no harness proves: automatic quality improvement, retraining, or scored grading. Sharpening is this designed loop — review plus promotion plus pruning plus approval — not magic.

## Pitfalls (refuse list)
- Never add a yolo or auto-approve mode, for any task, even background ones. Approval-first is the default and the hardblock list is never overridable by a skill or an agent definition.
- Never let a child write, send, ask the user anything, or loosen the chief's approval gate.
- Never let background work write memory or skills unseen — every write is staged and approved.
- Never launch a duplicate agent instead of steering the running one.
- Never delete an agent, a roster entry, or a workspace slice without the user's explicit word.
- Never claim a child can see, do, or remember what it cannot.

## Verification — PC test rule (ALWAYS)
Same rule as every skill: tested on the user's PC before it is called done.
1. skill_read returns this file (ok:true) on a real agent run.
2. A test run (real model, or a mock run when no key is present) produces: a named roster entry (name, role, task, tool subset, workspace slice), a steer/kill shape, and a memory-sharpening shape (staged proposal, never an unseen write). A mock run proves the loop, not model quality — real-model quality needs a real-key run.
3. Until the test passes, never tell the user the skill is done.
