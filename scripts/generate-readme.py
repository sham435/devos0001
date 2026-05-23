#!/usr/bin/env python3
import os
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
PROJECTS_DIR = ROOT / "projects" / "active"
README_PATH = ROOT / "README.md"


def parse_project_state(md_path):
    content = md_path.read_text()

    def extract(section):
        match = re.search(rf"^## {section}\n(.*?)(?=\n##|\Z)", content, re.M | re.S)
        if not match:
            return ""
        val = match.group(1).strip().split("\n")[0]
        return val[:80]

    def extract_line(label):
        match = re.search(rf"\*\*{label}\*\*: (.*)", content)
        return match.group(1).strip() if match else ""

    return {
        "name": md_path.parent.name,
        "working_on": extract("Working On"),
        "blockers": extract("Blockers"),
        "next_task": extract("Next Immediate Task"),
        "updated": datetime.fromtimestamp(md_path.stat().st_mtime).strftime("%Y-%m-%d"),
        "path": str(md_path.parent.relative_to(ROOT)),
    }


def generate_table():
    projects = []
    for state_file in sorted(PROJECTS_DIR.glob("*/PROJECT_STATE.md")):
        try:
            projects.append(parse_project_state(state_file))
        except Exception as e:
            print(f"  Skipping {state_file}: {e}")

    projects.sort(key=lambda x: x["updated"], reverse=True)

    if not projects:
        return "_No active projects. Run `./scripts/create-project.sh name`_"

    lines = ["| Project | Current Focus | Next Task | Updated |", "| --- | --- | --- | --- |"]
    for p in projects:
        link = f"[{p['name']}]({p['path']})"
        lines.append(f"| {link} | {p['working_on']} | {p['next_task']} | {p['updated']} |")
    return "\n".join(lines)


def update_readme():
    readme = README_PATH.read_text()
    new_table = generate_table()

    pattern = r"(<!-- PROJECTS_START -->)(.*?)(<!-- PROJECTS_END -->)"
    replacement = f"\\1\n{new_table}\n\\3"
    updated = re.sub(pattern, replacement, readme, flags=re.S)

    if updated != readme:
        README_PATH.write_text(updated)
        print(" README.md updated with active projects")
    else:
        print(" No changes to README.md")


if __name__ == "__main__":
    update_readme()
