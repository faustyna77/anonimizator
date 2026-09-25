# 10x-cli vs Hermes — durable rule

`npx @przeprogramowani/10x-cli@latest get m1l5` pulls Claude-Code templates into `.claude/` (`.10x-cli-manifest.json`, `prompts/`, `skills/`). These are not Hermes skills.

If `.claude/` appears in repo:
- Do NOT treat `.claude/skills/` as `.hermes/skills/`.
- Copy only needed files manually to `.hermes/prompts/` or `.hermes/skills/` with collision check (skip existing `10x-*`).
- Remove `.claude/` when no longer needed to avoid confusion.

This applies whenever user mentions 10x-cli or M1L5 in Hermes session.
