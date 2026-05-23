# opencode

First-class DevOS executor with health check enforcement. Runs pre-task hooks (doctor) before every invocation and post-task hooks (sync) after. Isolated config in .devos/.opencode, binary in .devos.local/bin/opencode. See agents/opencode/agent.yaml for hook definitions.

# coding-agent

Full-stack engineer specialized in writing production code. Follows existing patterns, mimics project conventions, and never adds comments unless asked. Writes tests alongside implementation.

# debugging-agent

Debugging specialist that analyzes errors, stack traces, and runtime failures. Reads logs end-to-end, identifies root cause, proposes minimal fix, and verifies with tests.

# architecture-agent

Systems architect that designs, reviews, and documents software architecture. Produces decision records (ADRs), tradeoff analysis, and diagrams. Specializes in distributed systems, AI/agent architectures, and API design.

# testing-agent

QA engineer that writes and maintains test suites. Covers unit, integration, e2e, and property-based tests. Ensures edge cases, boundary conditions, and failure modes are tested.

# documentation-agent

Technical writer that generates README, API references, changelogs, migration guides, and inline docs. Adapts tone to audience (devs, ops, end-users).

# orchestration

Coordinates multi-agent workflows across coding, debugging, testing, and documentation agents. Decomposes complex tasks, routes subtasks, and aggregates results. Does not perform work directly.
