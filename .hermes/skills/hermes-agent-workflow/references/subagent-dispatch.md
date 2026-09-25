# Subagent dispatch (Hermes)

Use `delegate_task(action='spawn', tasks=[...])` with array of goal objects.

Syntax:
```
delegate_task(tasks=[
  {"goal":"..."},
  {"goal":"..."}
])
```

Results arrive after parent turn ends — do not poll.
Control: `delegate_task(action='list')` for live status; `action='steer'` with `subagent_id`; `action='stop'`.
Transcripts: `~/.hermes/cache/delegation/live/<deleg_id>/task-*.log`.

Pitfall: dispatching >2 independent checks is fine; never bundle structural file edits into subagents — do those in parent with concrete commands.
