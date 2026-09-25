---
name: hermes-agent-workflow
description: >
  Multi-step task execution inside Hermes: load relevant skills,
  use delegate_task for parallel subagents, write plan-mode.md
  before deploy/edit, test atomically (one structural change per
  session), and verify with concrete commands not chat only.
  Always prefer short direct answers; confirm decisions quickly.
tags: [workflow, subagent, deploy, hermes, 10x]
related_skills: [10x-rule-review, 10x-shape, 10x-init, 10x-prd, hermes-agent]
---

# Hermes Agent Workflow

Use when doing multi-step work in Hermes that involves skills,
subagents, file edits, deployment planning, or rule-file updates.
Always-on rules apply to every instance.

## Standing preferences (always-on)

- Short direct answers; confirm decisions quickly; avoid narrative replay.
- Before editing AGENTS.md or any rules file: load it, score with 10x-rule-review if appropriate, ask via clarify before reordering, and verify edit with a command (`grep`, `curl`, `ls`) — not chat reading alone.
- Atomic changes: one structural edit (reorder, split, delete) per session, then test with one representative agent task before the next edit.
- Subagents: use `delegate_task` with array `tasks=[{goal:...}, ...]`; do not poll transcripts; results arrive as new messages after turn end.
- If `.claude/` appears (e.g., from `npx @przeprogramowani/10x-cli`), ignore/remove; copy only needed files to `.hermes/skills/` or `.hermes/prompts/` manually, never overwrite existing `10x-*` skills.
- For deployment planning: read `context/foundation/infrastructure.md` + `tech-stack.md`; write `context/foundation/plan-mode.md`; execute one step at a time; prefer Render when `tech-stack.md` says render (Fly.io documented as Phase-2).

## Procedure

1. **Identify class of task.** Load relevant skill via `skill_view(name)` (e.g., `10x-shape`, `10x-rule-review`).
2. **Gather sources.** Read `AGENTS.md` / `tech-stack.md` / `infrastructure.md` / `pyproject.toml` as needed; do not invent paths.
3. **Plan if structural/deploy.** Write `context/foundation/plan-mode.md` with decision (Render vs Fly.io), pre-conditions, atomic steps, risk checklist.
4. **Parallel exploration (optional).** Use `delegate_task(tasks=[...])` when independent checks are needed (skills list, project description, file audit). End turn after dispatch; do not poll.
5. **Edit / reorder rules (if needed).** Read full file → run 5 checks → propose via clarify → apply atomically → verify with command.
6. **Test the change.** Give agent ONE task that uses the edited rule; check output against `grep` or server start. Do not batch more edits until verified.
7. **Record durable notes.** Save to `.hermes/` skills/references only if reusable; avoid per-session incident files.

## Pitfalls

- **10x-cli vs Hermes:** `npx @przeprogramovani/10x-cli` pulls Claude-Code `.claude/` prompts; it does not load Hermes `.hermes/skills/`. If user runs it by mistake, clean `.claude/` and use manual copy (A/B) into `.hermes/`.
- **Subagent timing:** results re-enter as separate messages only after the parent turn ends; do not block waiting for them.
- **AGENTS.md reload:** edited rules are read at session start; include explicit `@AGENTS.md` or `agendas` reference in your prompt for strict verification, or start a fresh session.
- **Plan-mode atomism:** do not combine Docker build + CI + DB setup in one turn; step 1 (build) must pass (`/health`) before step 2 (Render service).
- **Short answer preference:** when user says "jest dobrze", "tak", or asks specifically for commands — stop explaining and deliver the command/file.

## References

- `references/subagent-dispatch.md` — delegate_task syntax, transcript paths, control actions.
- `references/10x-cli-vs-hermes.md` — why Claude Code 10x-cli does not serve Hermes; copy procedure.
- `references/agents-md-testing.md` — concrete prompts + `grep`/command checks for AGENTS.md rules (app instance, module path, .venv usage).
