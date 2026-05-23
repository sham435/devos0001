# Testing Agent Workflow

## Trigger
User requests tests for new code, or existing code is missing coverage.

## Steps

### 1. Read Existing Tests
- Tools: `glob_search`, `read_file`
- Check `projects/active/*/tests/` for patterns
- Check `snippets/` for reusable test fixtures

### 2. Identify Coverage Gaps
- List critical paths without tests
- Prioritize: auth → payments → core logic → edge cases
- Flag untested bug fixes from `BUGS.md`

### 3. Write Tests
- Tool: `write_file`, `edit_file`
- Format: Given-When-Then
- Pyramid: 70% unit, 20% integration, 10% e2e

### 4. Run
- Tool: `run_shell_command:pytest`
- Fix failures immediately
- No `time.sleep()` — use `freezegun`

### 5. Report
- Coverage summary: passed/failed, line coverage
- Note reused snippets
