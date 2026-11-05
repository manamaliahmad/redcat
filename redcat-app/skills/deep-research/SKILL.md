# deep-research

description: When the user says "do research" or asks for a deep dive, investigation, or comparison on a topic, read this skill first — plan-first, read-only gathering, cited facts, advice plus reality plus practices, artifact as a minimalist world-class website with colored graphs. At the end of ANY big task, BUILD the artifact (do not just offer it and wait) — it contains ALL the resources (all sources with links, plus the findings).

## When to use
- The user says "do research", "do deep research on this", "investigate", or asks to compare options.
- Any task whose answer must rest on gathered facts, not on the model's general knowledge.
- Long research jobs (these go to a child agent under the chief-agents skill — the chief stays available and composes the artifact).

## Hermes — which Hermes
In this product's context, "Hermes" ALWAYS means Nous Research's hermes-agent — the MIT open-source AI agent framework (repo: https://github.com/NousResearch/hermes-agent, docs: https://hermes-agent.nousresearch.com). It is NOT the Mistral AI Hermes language model. When the user asks about Hermes, open the Browser panel to the hermes-agent repo/docs and read them live — never answer from memory and never confuse it with the Mistral model. If the user clearly means the Mistral model, say so explicitly and ask which one they mean.

## Procedure

### 1. Brief first, in one short plan
Before gathering, state the brief: what to research, what counts as evidence, what the artifact must contain. Primary sources first (official docs, repos, data pages, the thing itself); secondary sources only when labeled as such. A brief lives in the run, not hidden in a system prompt, so the user can correct it.
**Context anchoring:** keep the ORIGINAL question's intent — never reframe it into a different domain (ecommerce products to sell are NOT stock-market sectors; an AI product is NOT market trends). When the user nudges with "??" or a bare follow-up, re-read the ORIGINAL question from the conversation history and stick to it. If the question is ambiguous (AI product vs market trends, which market), ASK one short clarifying question with the options, OR state your assumption clearly, BEFORE gathering — never guess the domain.

### 2. Gather — read-only, cited, multi-source, LIVE in the Browser panel
Use web_search to find sources, then do the reading LIVE in the in-app Browser panel with browser_panel: open the top source URL (action "open" — the panel opens for the user), read it (action "read"), move the mouse visibly (action "move") and click through to linked pages (action "click") like a human researcher. The user watches the research happen in the browser. Use browser_read / browser_read_js only when the panel cannot open a page (a blocked or unreadable page). Every fact keeps its source: URL plus anchor or quote. Load-bearing facts need more than one source. If a source is blocked, paywalled, or unreadable, say exactly that — never invent the missing fact, number, or quote. Gathering writes nothing and sends nothing, so it needs no approval.
**Source selection — factual sites only:** resources must ALWAYS come from factual sites — sites that actually state the facts, where the facts are written. Primary sources first (official docs, repos, data pages, the thing itself, official reports, news). Wikipedia is for background/encyclopedia ONLY — never the source for a current or trending topic (ecommerce trends, market trends, 2026 trends). For a current or trending topic use the right sources (Exploding Topics, Shopify, Trend Hunter, Google Trends, Amazon Best Sellers, official reports, news). Use search operators to target factual sites (site:domain, "exact phrase", intitle:word, -term).
**Fallback — browser or ask, never guess:** if web_search returns no results, or only Wikipedia results for a question that needs non-Wikipedia sources (the result says "source: wikipedia — LAST RESORT ONLY"), EITHER open the Browser panel and search/read directly (search in the browser, open the real factual sites, read them live) OR ask the user right away — never guess, never invent, never settle for a weak or wrong source.

### 3. Distill — a separate step, never free-writing
Group facts by source. Separate three labeled sections, never blended into one smooth paragraph:
- Advice: your recommendation, and why, tied to the user's goal.
- Reality: what is actually true now, with numbers and dates, each cited.
- Practices: concrete steps to do, in order.
Conflicts between sources are flagged, not smoothed over. If the evidence is thin, say so.

### 4. Compute, then chart — numbers never come from prose
A separate compute step turns gathered numbers into graphs. Graphs are simple colored charts in CSS/SVG only, no library, and every plotted number must be a cited gathered number. Never plot an invented, rounded-from-memory, or "typical" number.

### 5. Artifact — a minimalist world-class website, served, not a chat dump
At the end of ANY big task (research, deep dive, comparison, investigation), BUILD the user a minimalist world-class website artifact containing ALL the resources (all sources with links, plus the findings) — build it as part of the task, do not just offer it and wait. The artifact is minimalist (clean, lots of white space, simple typography, no clutter) and world-class.
Build the artifact with the world-class-website skill (single-file, own code, own copy, user's own images or CSS/SVG art — never a copied brand, copy, or image). The artifact has the three sections (advice, reality, practices), the colored graphs, and a complete sources list (every source with its link). Deliver the localhost link (http://localhost:3000/sites/<name>/) plus the folder (Desktop\redcat\sites\<name>\). Tell the user naturally, in your own words, that you built it.
Documents & Notes display: those panels are NOT wired yet (they are placeholder pages) — do not promise research will appear there. Deliver the site link and a notes file the user can open, and say Documents & Notes display is a later step.

### 6. Long research goes to a child; the chief composes
For a long job, the chief delegates gathering to a child agent (chief-agents skill) and stays fully available for the user. The child gathers and returns a summary; the chief — never the child — composes and writes the artifact. Children never write the artifact, never send anything, never ask the user anything.

## Pitfalls (refuse list)
- Never invent stats, prices, dates, quotes, or testimonials, and never plot an uncited number.
- Never rest a load-bearing claim on a single source without saying so.
- Never reframe the user's question into a different domain (ecommerce products to sell are NOT stock-market sectors; an AI product is NOT market trends). When the user nudges with "??", re-read the ORIGINAL question — do not reconstruct it into something else.
- Never settle for Wikipedia alone for a current or trending topic. If web_search returns only Wikipedia, go to the Browser panel (or ask the user) — never answer from Wikipedia alone.
- Never build the artifact from memory. Every fact, number, and source in the artifact must come from the gather step (read live, cited). An artifact with an invented source or number is a fake artifact.
- Never copy a brand, copy, image, or design from a source page — patterns only, own artifact.
- Never free-write the whole artifact in one model call without the gather-then-distill steps.
- Never promise views, virality, income, or rankings from research.
- Never claim Documents & Notes display, vision, or a capability the harness does not have yet.

## Verification — PC test rule (ALWAYS)
Same rule as every skill: tested on the user's PC before it is called done.
1. skill_read returns this file (ok:true) on a real agent run.
2. A test run (real model, or a mock run when no key is present) on a known reference page produces: a brief, cited facts with sources, the three labeled sections, and the artifact shape (folder plus localhost link). A mock run proves the loop, not model quality — real-model quality needs a real-key run.
3. Until the test passes, never tell the user the skill is done.
