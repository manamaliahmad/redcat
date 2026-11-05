# Model picker — choose the best saved model for the task

description: When a task starts, decide which saved model (provider + model) fits it best, and ask the user before switching to it. Read this skill first for any build, research, or long task — never guess a model from general knowledge, and never name a model that is not in the SAVED MODELS list in your prompt.

## The tiers (task to model)

- FAST — simple questions, short chat, one-line answers, quick facts, simple file or command tasks. Best: the cheapest/fastest saved model — gemini-3.8-flash, gpt-5-mini, deepseek-v4.1-flash, or the free OpenRouter router (openrouter/free). A strong model is wasted here.
- STRONG — research (multi-source, cross-checked), code review, debugging, multi-step tasks, video planning, anything that needs careful reasoning. Best: claude-sonnet-4-5, kimi-k3, gpt-5, deepseek-reasoner, qwen-max, or gemini-3.8-flash.
- STRONGEST — complex website or app builds, deep multi-phase work, anything with many steps where a weak model would fail or loop. Best: claude-opus-4-6, claude-sonnet-4-5, kimi-k3, or gpt-5.

## Hard facts about the providers (verified, not guessed)

- Groq is NOT usable for agent work: its tokens-per-minute limit is below the size of an agent request, so the agent's calls fail on it. Never pick Groq for an agent task.
- Free models (openrouter/free) are fine for simple chat, but they are unreliable for tool calls — they sometimes return empty or invalid JSON instead of a tool call. For tool-heavy work (builds, browser research, multi-step tasks), prefer a stronger saved model.
- Ollama (local) needs no key and keeps everything on the PC, but its models are weaker and slower. Use it only when the user asks for local/private, or as a last resort when no key is saved.
- Kimi K3 chats are pinned to K3 by code — a K3 chat can never switch models mid-session. Do not propose a switch on a K3 chat.

## The rules (never break them)

1. Pick ONLY from the SAVED MODELS list in your prompt. Never name a model that is not listed there.
2. If the current model already fits the task, just do the task. Do not switch, do not ask. Only propose a switch when the current model is clearly the wrong fit (a free/weak model for a complex build, or a strong/expensive model for a trivial question). Marginal gains are not a reason to switch.
3. To switch, call the model_switch tool with the target provider + model + a one-line reason. The user sees an approval card and allows or denies it. NEVER switch silently. Never call model_switch for a model that is not saved.
4. If the best model for the task is NOT in the SAVED MODELS list, do NOT switch. Tell the user in your final reply which model would be best and ask them to add its key in Settings — OR ask if they want to continue with the current model ("if you want to continue with this one, that is fine") — then wait for their answer before starting the work.
5. If the user denies a switch, continue with the current model for this task and do not ask again for the same task.
6. Never switch models mid-session on a Kimi K3 chat.

## How to ask (examples)

- Switch (tool call): {"thought": "...", "tool": "model_switch", "args": {"provider": "claude", "model": "claude-sonnet-4-5", "reason": "This website build needs a stronger model than the current free one"}}
- Best not saved (final reply): "For this website build, Claude Sonnet would be best, but its key is not saved. Please add it in Settings — or, if you want to continue with this one, that is fine, just say so and I will start."
