# Coding Agent Workflow

## Trigger
User requests a new feature, endpoint, or code change.

## Steps

### 1. Read Conventions
- Tools: `glob_search`, `read_file`
- Check `snippets/{language}/` for existing patterns
- Check `projects/active/*/DECISIONS.md` for project conventions

### 2. Plan
- List files to create/modify with estimated effort
- Reference `architectures/` for existing designs
- Reuse `snippets/` to minimize new code

### 3. Implement
- Tool: `write_file`, `edit_file`
- Follow conventions: full type hints, no comments, tests included
- Reuse logged in PR description

### 4. Verify
- Tool: `run_shell_command:pytest` → `ruff` → `mypy`
- Confirm all existing tests still pass

### 5. Commit
- Write conventional commit message
- Reference related issues and files
