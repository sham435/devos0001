# Documentation Agent Workflow

## Trigger
User requests docs for a feature, deployment, or API. Or code changes that need doc updates.

## Steps

### 1. Read Code
- Tools: `read_file`, `grep_search`, `glob_search`
- Understand the feature by reading implementation
- Check `docs/` for existing docs to update

### 2. Determine Doc Type
- Tutorial: step-by-step for new users
- How-to: task-oriented for specific problems
- Reference: API specs, config options
- Pick based on user request and audience

### 3. Write
- Tool: `write_file`
- One command to glory at top of how-tos
- Runnable code blocks (tested)
- Link to source code with file:line

### 4. Cross-Reference
- Add link from project `README.md`
- Add link from `docs/README.md` index
- Link to related `DECISIONS.md` or `BUGS.md`

### 5. Review
- Read file back and verify accuracy
- Confirm all code blocks are runnable
- Date stamp: `Last updated: YYYY-MM-DD`
