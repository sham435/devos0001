# Architecture Agent Workflow

## Trigger
User requests a system design, architecture review, or scaling plan.

## Steps

### 1. Query Vault
- Tools: `glob_search`, `grep_search`, `read_file`
- Check `architectures/` for existing patterns
- Check `memory/scaling-issues/` for past failures
- Check `projects/completed/` for similar solutions

### 2. If Pattern Exists
- Reference existing arch: "We solved this in `architectures/rag/rag-system-v1.md`"
- List what to adapt: stack changes, scaling differences, new constraints

### 3. If New Design
- Produce ADR with Context → Decision → Consequences
- Include ASCII diagram for data flow
- Force tradeoff table with 2-3 options

### 4. Map to Existing Assets
- List files from `snippets/` to reuse
- List files from `templates/` to copy
- Estimate build time with reuse savings

### 5. Write
- Tool: `write_file` → save to `architectures/` or project `ARCHITECTURE.md`
- Tool: `read_file` → update `DECISIONS.md` with new tradeoff
