# personal-ai-engineering-system

> My Developer Operating System — second brain for AI/full-stack engineering

This repo is my:
1. **Reusable architecture vault**
2. **AI memory system**
3. **Prompt intelligence layer**
4. **Project recovery system**
5. **Engineering accelerator**

## How I Work

### Daily Workflow
1. **MORNING**: Open `projects/active/*/PROJECT_STATE.md` → read `Next Immediate Task`
2. **DURING**: Log prompts to `/prompts`, decisions to `DECISIONS.md`, bugs to `/memory`
3. **BEFORE STOPPING**: Update `Last Work Session` block in `PROJECT_STATE.md`. Non-negotiable.

### Tool Trinity
| Tool | Purpose |
| --- | --- |
| **GitHub** | Source of truth. All code + docs versioned |
| **Obsidian** | Brain interface. Open this folder as vault for graph view + backlinks |
| **Notion** | Project management. Status dashboard only, not knowledge |

## Active Projects
<!-- PROJECTS_START -->
| Project | Current Focus | Next Task | Updated |
| --- | --- | --- | --- |
| [my-fastapi-app](projects/active/my-fastapi-app) | Ready to deploy. Run `uvicorn app.main:app --reload` after `alembic upgrade head | `docker compose up -d db redis && alembic upgrade head && uvicorn app.main:app - | 2026-05-23 |
<!-- PROJECTS_END -->

### Recent Lessons Learned
```dataview
LIST FROM "memory"
SORT file.mtime DESC
LIMIT 5
```

## Structure
```
personal-ai-engineering-system/
├── projects/       # ACTIVE + COMPLETED projects. Each has PROJECT_STATE.md
├── templates/      # project-template/ used by create-project.sh
├── prompts/        # Secret weapon. Categorized, battle-tested prompts
├── architectures/  # Reusable system designs + tradeoffs
├── snippets/       # Copy-paste code that works
├── agents/         # System prompts + configs for AI agents I use
├── memory/         # Mistakes, incidents, debugging patterns. Wisdom lives here
├── docs/           # Setup, deployment, workflows, research
├── scripts/        # Automation: create-project.sh, backup.sh
└── resources/      # Diagrams, assets, PDFs
```

### Golden Rules
- **Every project** must have PROJECT_STATE.md with Last Work Session updated daily
- **Log the pain**: If it took >30min to debug, it goes in /memory
- **Prompts are assets**: If a prompt saved time, save it in /prompts with notes
- **Decisions need context**: /DECISIONS.md explains why, not just what

### Quick Commands
```bash
# New project
./scripts/create-project.sh project-name

# Search everything
grep -r "redis pubsub" .
```

# Your DevOS compounds. Every session adds an asset.

Started: 2026-05-22
