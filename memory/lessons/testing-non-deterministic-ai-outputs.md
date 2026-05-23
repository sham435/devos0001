# Testing Non-Deterministic AI Outputs

## The Lesson
Asserting exact string matches on LLM responses is a trap. Use semantic similarity or property-based assertions instead.

## The Context
I was writing tests for an agent that generated commit messages. The test asserted `response == "Expected commit message"`, which failed every time because the LLM worded the same content differently.

## The Fix
Switched to:
- **Semantic assertions** – `assert cosine_similarity(embedding(generated), embedding(expected)) > 0.9`
- **Property assertions** – `assert len(response) > 0 and response.startswith(prefix_pattern)`
- **Structured output** – Moved to `response_format={type: "json"}` and asserted on fields, not exact strings

## When to Apply
Any test where an LLM generates natural language, summaries, or variable-naming.

## Related
- `/prompts/ai-agents/testing-patterns.md`
