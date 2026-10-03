#!/usr/bin/env python3
"""Read-only, stdlib-only parser for Claude Code sub-agent JSONL journals.

Usage:
  analyze_journals.py "<glob>" [<glob> ...] [--json] [--prices prices.json]
                      [--main <session>.jsonl] [--since ISO] [--until ISO]

Journal layout (Claude Code):
  ~/.claude/projects/<slug>/<session-id>.jsonl                      main session
  ~/.claude/projects/<slug>/<session-id>/subagents/agent-<id>.jsonl every sub-agent, flat
  ~/.claude/projects/<slug>/<session-id>/subagents/agent-<id>.meta.json
      {"agentType", "description", "toolUseId", "spawnDepth", ...}

Notes on the format this script relies on:
  * One API response is written as several `assistant` lines (one per content
    block) that share `requestId` and repeat the `usage` object. Usage is
    therefore deduplicated per requestId (last line wins) — summing every line
    overcounts by the number of blocks.
  * A nested agent's parent is the journal that contains the `tool_use` whose id
    equals the child's `meta.toolUseId`.

Prices file (optional, USD per million tokens, matched by exact model id, then
longest prefix):
  {"claude-sonnet-5": {"input": 3, "output": 15, "cache_read": 0.3, "cache_write": 3.75}}
Never hard-code prices here — they drift. Confirm them via the claude-api skill.
"""
import argparse
import glob
import json
import os
import sys
from collections import Counter
from datetime import datetime


def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def load_meta(path):
    meta_path = path[: -len(".jsonl")] + ".meta.json"
    try:
        with open(meta_path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def analyze(path, since=None, until=None):
    usage_by_req = {}
    tool_ids, tool_names = set(), Counter()
    spawn_ids = set()  # every tool_use id, window-independent, for parent linkage
    models = Counter()
    first = last = None
    errors = 0
    with open(path) as f:
        for line in f:
            try:
                o = json.loads(line)
            except ValueError:
                continue
            m = o.get("message")
            if o.get("type") == "assistant" and isinstance(m, dict) and isinstance(m.get("content"), list):
                spawn_ids.update(b.get("id") for b in m["content"] if isinstance(b, dict) and b.get("type") == "tool_use")
            ts = parse_ts(o.get("timestamp"))
            if ts and ((since and ts < since) or (until and ts > until)):
                continue
            if ts:
                first = ts if first is None or ts < first else first
                last = ts if last is None or ts > last else last
            msg = o.get("message")
            if not isinstance(msg, dict):
                continue
            content = msg.get("content")
            if o.get("type") == "user" and isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "tool_result" and b.get("is_error"):
                        errors += 1
            if o.get("type") != "assistant":
                continue
            if msg.get("model") and msg["model"] != "<synthetic>":
                models[msg["model"]] += 1
            key = o.get("requestId") or msg.get("id") or o.get("uuid")
            if isinstance(msg.get("usage"), dict):
                usage_by_req[key] = msg["usage"]
            if isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("id") not in tool_ids:
                        tool_ids.add(b.get("id"))
                        tool_names[b.get("name", "?")] += 1

    tok = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}
    for u in usage_by_req.values():
        tok["input"] += u.get("input_tokens", 0) or 0
        tok["output"] += u.get("output_tokens", 0) or 0
        tok["cache_read"] += u.get("cache_read_input_tokens", 0) or 0
        tok["cache_write"] += u.get("cache_creation_input_tokens", 0) or 0
    return {
        "tokens": tok,
        "turns": len(usage_by_req),
        "tool_calls": len(tool_ids),
        "tool_use_ids": spawn_ids,
        "tools_by_name": dict(tool_names.most_common()),
        "tool_errors": errors,
        "model": models.most_common(1)[0][0] if models else None,
        "start": first,
        "end": last,
    }


def hit_ratio(t):
    denom = t["input"] + t["cache_read"] + t["cache_write"]
    return t["cache_read"] / denom if denom else None


def price_for(model, prices):
    if not model or not prices:
        return None
    if model in prices:
        return prices[model]
    best = max((k for k in prices if model.startswith(k)), key=len, default=None)
    return prices.get(best) if best else None


def cost(t, p):
    if not p:
        return None
    return (
        t["input"] * p.get("input", 0)
        + t["output"] * p.get("output", 0)
        + t["cache_read"] * p.get("cache_read", 0)
        + t["cache_write"] * p.get("cache_write", 0)
    ) / 1_000_000


def fmt_n(n):
    return "n/a" if n is None else f"{n:,}"


def fmt_pct(x):
    return "n/a" if x is None else f"{x * 100:.0f}%"


def fmt_cost(c):
    if c is None:
        return "n/a"
    return f"${c:.2f}" if c >= 1 else f"${c:.4f}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("patterns", nargs="+", help="journal paths or globs (quote them)")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of a table")
    ap.add_argument("--prices", help="JSON file of USD-per-MTok rates per model")
    ap.add_argument("--main", help="main session transcript to report alongside (not a sub-agent)")
    ap.add_argument("--since", help="ISO timestamp; ignore journal lines before it")
    ap.add_argument("--until", help="ISO timestamp; ignore journal lines after it")
    args = ap.parse_args()

    since, until = parse_ts(args.since), parse_ts(args.until)
    prices = None
    if args.prices:
        with open(os.path.expanduser(args.prices)) as f:
            prices = json.load(f)

    paths = sorted({p for pat in args.patterns for p in glob.glob(os.path.expanduser(pat))})
    paths = [p for p in paths if p.endswith(".jsonl")]
    if not paths:
        print("no journals matched", file=sys.stderr)
        return 2

    agents = []
    for p in paths:
        a = analyze(p, since, until)
        if a["turns"] == 0 and a["start"] is None:
            continue  # entirely outside the --since/--until window
        meta = load_meta(p)
        a.update(
            id=os.path.basename(p)[len("agent-"): -len(".jsonl")] if os.path.basename(p).startswith("agent-") else os.path.basename(p),
            agent_type=meta.get("agentType", "?"),
            description=meta.get("description", ""),
            depth=meta.get("spawnDepth", 1),
            tool_use_id=meta.get("toolUseId"),
        )
        a["span_s"] = (a["end"] - a["start"]).total_seconds() if a["start"] and a["end"] else 0.0
        a["hit"] = hit_ratio(a["tokens"])
        a["cost"] = cost(a["tokens"], price_for(a["model"], prices))
        agents.append(a)

    if not agents:
        print("no journal activity in the requested window", file=sys.stderr)
        return 2

    # parent linkage: the journal that issued the child's spawning tool_use
    for a in agents:
        a["parent"] = next((b["id"] for b in agents if b is not a and a["tool_use_id"] in b["tool_use_ids"]), None)

    # order: launch time, children directly under their parent
    agents.sort(key=lambda a: a["start"] or datetime.max.replace(tzinfo=None))
    ordered, seen = [], set()

    def visit(a):
        if a["id"] in seen:
            return
        seen.add(a["id"])
        ordered.append(a)
        for c in agents:
            if c["parent"] == a["id"]:
                visit(c)

    for a in agents:
        if a["parent"] is None or a["parent"] not in {b["id"] for b in agents}:
            visit(a)
    for a in agents:
        visit(a)

    tot = {k: sum(a["tokens"][k] for a in ordered) for k in ("input", "output", "cache_read", "cache_write")}
    starts = [a["start"] for a in ordered if a["start"]]
    ends = [a["end"] for a in ordered if a["end"]]
    wall = (max(ends) - min(starts)).total_seconds() if starts and ends else 0.0
    sum_spans = sum(a["span_s"] for a in ordered)
    costs = [a["cost"] for a in ordered]
    critical = max(ordered, key=lambda a: a["span_s"])
    summary = {
        "agents": len(ordered),
        "top_level": sum(1 for a in ordered if a["depth"] <= 1),
        "nested": sum(1 for a in ordered if a["depth"] > 1),
        "max_depth": max(a["depth"] for a in ordered),
        "tokens": tot,
        "cache_hit": hit_ratio(tot),
        "tool_calls": sum(a["tool_calls"] for a in ordered),
        "tool_errors": sum(a["tool_errors"] for a in ordered),
        "wall_s": wall,
        "sum_spans_s": sum_spans,
        "parallelism": (sum_spans / wall) if wall else None,
        "critical_path": {"id": critical["id"], "agent_type": critical["agent_type"], "span_s": critical["span_s"]},
        "cost": None if any(c is None for c in costs) else sum(costs),
        "window": {"start": min(starts).isoformat() if starts else None, "end": max(ends).isoformat() if ends else None},
    }

    main_session = None
    if args.main:
        m = analyze(os.path.expanduser(args.main), since, until)
        m["hit"] = hit_ratio(m["tokens"])
        m["cost"] = cost(m["tokens"], price_for(m["model"], prices))
        main_session = m

    if args.json:
        def clean(a):
            out = {k: v for k, v in a.items() if k not in ("tool_use_ids",)}
            for k in ("start", "end"):
                if out.get(k):
                    out[k] = out[k].isoformat()
            return out

        payload = {"agents": [clean(a) for a in ordered], "summary": summary}
        if main_session:
            payload["main_session"] = clean(main_session)
        print(json.dumps(payload, indent=2, default=str))
        return 0

    hdr = f"{'agent':<34} {'model':<18} {'in':>9} {'out':>9} {'cache-read':>11} {'cache-write':>11} {'hit':>5} {'tools':>5} {'err':>4} {'span':>7} {'cost':>8}"
    print(hdr)
    print("-" * len(hdr))
    for a in ordered:
        name = ("  " * (a["depth"] - 1)) + ("└ " if a["depth"] > 1 else "") + f"{a['agent_type']} ({a['id'][:7]})"
        t = a["tokens"]
        print(
            f"{name[:34]:<34} {(a['model'] or 'n/a')[:18]:<18} {fmt_n(t['input']):>9} {fmt_n(t['output']):>9} "
            f"{fmt_n(t['cache_read']):>11} {fmt_n(t['cache_write']):>11} {fmt_pct(a['hit']):>5} "
            f"{a['tool_calls']:>5} {a['tool_errors']:>4} {a['span_s']:>6.0f}s {fmt_cost(a['cost']):>8}"
        )
        if a["description"]:
            print(f"{'':<4}{'  ' * (a['depth'] - 1)}↳ {a['description'][:90]}")
    if main_session:
        t = main_session["tokens"]
        print("-" * len(hdr))
        print(
            f"{'[main session]':<34} {(main_session['model'] or 'n/a')[:18]:<18} {fmt_n(t['input']):>9} {fmt_n(t['output']):>9} "
            f"{fmt_n(t['cache_read']):>11} {fmt_n(t['cache_write']):>11} {fmt_pct(main_session['hit']):>5} "
            f"{main_session['tool_calls']:>5} {main_session['tool_errors']:>4} {'':>7} {fmt_cost(main_session['cost']):>8}"
        )
    s = summary
    print()
    print(
        f"agents={s['agents']} (top-level={s['top_level']} nested={s['nested']} max_depth={s['max_depth']}) "
        f"in={fmt_n(tot['input'])} out={fmt_n(tot['output'])} cache_read={fmt_n(tot['cache_read'])} "
        f"cache_write={fmt_n(tot['cache_write'])} cache_hit={fmt_pct(s['cache_hit'])} "
        f"tools={s['tool_calls']} tool_errors={s['tool_errors']} wall={s['wall_s']:.0f}s "
        f"parallelism={'n/a' if s['parallelism'] is None else f'{s['parallelism']:.2f}x'} "
        f"critical={s['critical_path']['agent_type']}({s['critical_path']['span_s']:.0f}s) "
        f"cost={fmt_cost(s['cost'])}"
    )
    print("(sub-agent totals exclude the main session)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
