# Debugging Agent Workflow

## Trigger
User reports an error, unexpected behavior, or test failure.

## Steps

### 1. Collect Context
- Tools: `read_file`, `git_diff`, `git_log`
- Read error trace, recent changes, and relevant source files
- Check `memory/debugging-patterns/` for similar issues

### 2. Form Hypotheses
- List 3 most likely causes ranked by probability
- Reference past bugs from `BUGS.md` or `memory/mistakes/`

### 3. Test Hypothesis 1
- Tool: `run_shell_command`
- Run minimal command to validate most likely cause
- Auto-approved: `pytest`, `redis-cli`, `psql`, `curl`

### 4. Root Cause Confirmed
- Tool: `read_file` → identify exact line
- Tool: `edit_file` → apply minimal fix

### 5. Verify
- Tool: `run_shell_command:pytest` → confirm fix passes tests
- If failing, rollback and try hypothesis 2

### 6. Log
- If fix took >15min: add entry to `projects/active/*/BUGS.md`
- If pattern is new: add to `memory/debugging-patterns/`

## Escalation
If all hypotheses exhausted, ask user: "Explain the data flow from request to DB for this feature."
