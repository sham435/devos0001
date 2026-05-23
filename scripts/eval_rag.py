#!/usr/bin/env python3
"""
RAG evaluation harness using a golden Q&A set.
Usage:
  python scripts/eval_rag.py --user-id <uuid>
  python scripts/eval_rag.py --user-id <uuid> --verbose
  python scripts/eval_rag.py --user-id <uuid> --update-baseline
"""
import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).parent.parent
sys.path.append(str(ROOT))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()

from snippets.django.langgraph_rag import rag_chain
from rich.console import Console
from rich.table import Table

console = Console()
GOLDEN_SET = ROOT / "data" / "eval" / "golden_qa.json"
BASELINE = ROOT / "data" / "eval" / "baseline.json"


def load_golden_set():
    if not GOLDEN_SET.exists():
        console.print(f" Golden set not found: {GOLDEN_SET}")
        console.print("Create data/eval/golden_qa.json with 20 Q&A pairs")
        sys.exit(1)
    return json.loads(GOLDEN_SET.read_text())


def evaluate_answer(result, expected):
    answer = result["answer"].lower()
    score = 0
    checks = []

    contains_all = True
    for phrase in expected["expected_answer_contains"]:
        if phrase.lower() in answer:
            checks.append(f" Contains '{phrase}'")
            score += 1
        else:
            checks.append(f" Missing '{phrase}'")
            contains_all = False

    cited_files = {s["filename"] for s in result["sources"]}
    expected_files = set(expected["expected_sources"])
    if expected_files.intersection(cited_files):
        checks.append(f" Cited {expected_files.intersection(cited_files)}")
        score += 1
    else:
        checks.append(f" Did not cite {expected_files}. Got: {cited_files}")

    if "don't know" in answer and expected["expected_answer_contains"]:
        checks.append(" False negative: said 'don't know'")
        score -= 1

    max_score = len(expected["expected_answer_contains"]) + 1
    return {
        "score": score,
        "max_score": max_score,
        "pass": score >= max_score - 1,
        "checks": checks,
        "answer": result["answer"],
        "sources": result["sources"]
    }


def run_eval(user_id, verbose=False):
    golden = load_golden_set()
    console.print(f" Running RAG eval on {len(golden)} questions for user {user_id}")

    results = []
    for i, qa in enumerate(golden):
        console.print(f"[{i+1}/{len(golden)}] {qa['question']}")
        try:
            result = rag_chain.invoke({"question": qa["question"]})
            eval_result = evaluate_answer(result, qa)
            results.append({**qa, **eval_result})

            if verbose:
                for check in eval_result["checks"]:
                    console.print(f"  {check}")
                console.print(f"  Sources: {[s['filename'] for s in result['sources']]}")
                console.print()
        except Exception as e:
            console.print(f"  Error: {e}")
            results.append({**qa, "score": 0, "max_score": 1, "pass": False, "error": str(e)})

    return results


def print_summary(results):
    passed = sum(1 for r in results if r["pass"])
    total_score = sum(r["score"] for r in results)
    max_score = sum(r["max_score"] for r in results)

    table = Table(title="RAG Evaluation Results")
    table.add_column("Question", style="cyan", no_wrap=False)
    table.add_column("Score", justify="center")
    table.add_column("Pass", justify="center")
    table.add_column("Tags")

    for r in results:
        status = "" if r["pass"] else ""
        table.add_row(
            r["question"][:50] + "...",
            f"{r['score']}/{r['max_score']}",
            status,
            ",".join(r.get("tags", []))
        )

    console.print(table)
    console.print(f"\n Summary: {passed}/{len(results)} passed | Score: {total_score}/{max_score} = {total_score/max_score:.0%}")

    if passed < len(results):
        console.print("\n Failed questions:")
        for r in results:
            if not r["pass"]:
                console.print(f"  {r['question']}")
                for check in r.get("checks", []):
                    if "" in check:
                        console.print(f"     {check}")

    return passed == len(results)


def update_baseline(results):
    BASELINE.parent.mkdir(parents=True, exist_ok=True)
    baseline = {
        "timestamp": datetime.now().isoformat(),
        "total_score": sum(r["score"] for r in results),
        "max_score": sum(r["max_score"] for r in results),
        "passed": sum(1 for r in results if r["pass"]),
        "total": len(results)
    }
    BASELINE.write_text(json.dumps(baseline, indent=2))
    console.print(f" Baseline updated: {BASELINE}")


def main():
    parser = argparse.ArgumentParser(description="Evaluate RAG system")
    parser.add_argument("--user-id", required=True, help="UUID to filter docs")
    parser.add_argument("--verbose", action="store_true", help="Show detailed checks")
    parser.add_argument("--update-baseline", action="store_true", help="Save results as new baseline")
    args = parser.parse_args()

    results = run_eval(args.user_id, args.verbose)
    all_passed = print_summary(results)

    if args.update_baseline:
        update_baseline(results)

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
