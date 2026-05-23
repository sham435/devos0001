# Multi-Agent Orchestration Architecture

## Problem
Single agents hit context limits and hallucinate on complex multi-step tasks. Need to decompose work across specialized agents.

## Solution
Supervisor + Worker pattern with a shared state bus.

```
User → Supervisor Agent
         ├── Coding Agent (code gen)
         ├── Debugging Agent (error analysis)
         ├── Testing Agent (test gen + assertion)
         └── Documentation Agent (docs + changelog)
         ↓
         Shared State (JSON / Redis / LangGraph State)
```

## Key Decisions
- **Orchestration**: LangGraph for stateful graphs with human-in-the-loop breakpoints
- **Handoff**: Agents write to a shared `TaskState` dict; supervisor reads to decide next step
- **Context window**: Each agent only sees its relevant slice of state (via `filter_state` middleware)

## Tradeoffs
| Pro | Con |
| --- | --- |
| Parallel execution of independent subtasks | Supervision overhead for trivial tasks |
| Clear responsibility boundaries | Cross-agent context loss if state schema drifts |

## When to Use
Tasks requiring >3 distinct skill domains or where a single prompt exceeds 8k tokens.
