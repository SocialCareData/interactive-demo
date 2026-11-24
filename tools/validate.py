"""Validate the synthetic dataset in data/records/ against the vendored standards.

Checks, for every record:
  1. SHACL conformance against <standard>/<standard>-<profile|standard>-shape.ttl,
     built from vendor/standard by its own build_ontology.py (cached in .cache/).
  2. Every JSON key is defined by the module context. JSON-LD silently drops
     undefined keys, so without this a typo would still "conform".
And across the dataset (PLAN.md §4.6):
  3. Every Identifier resolves to a record, or is listed in data/external-refs.yaml.
  4. No date is after the snapshot date.
  5. UNASSIGNED concern types appear only where the story says so.
  6. @ids and record identifiers are unique.
  7. Targets in data/annotations.yaml and data/ui.yaml exist.
  8. Every step in data/journeys.yaml opens a real page and traces a real value.

Writes site/data/validation.json for the badge. Exits non-zero on any failure.

    python tools/validate.py              # use cached shapes if present
    python tools/validate.py --rebuild    # rebuild shapes from vendor/
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import io
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor" / "standard"
SCRIPTS = VENDOR / "src" / "assets" / "scripts"
MODEL = VENDOR / "src" / "_data" / "model"
RECORDS = ROOT / "data" / "records"
CACHE = ROOT / ".cache" / "shapes"
OUT = ROOT / "site" / "data" / "validation.json"

SNAPSHOT_DATE = "2026-11-26"

# The only concerns allowed to still be awaiting triage (PLAN.md §4.5, case C):
# Sarah Grant's quality-of-care concern about Brightwater, received 25 Nov.
ALLOWED_UNASSIGNED = {"https://anytown.example/records/qoc/QOC-2026-0019"}

DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$")

sys.path.insert(0, str(SCRIPTS))


# --------------------------------------------------------------------------- helpers

def vendor_sha() -> str:
    for line in (VENDOR / "SOURCE.txt").read_text(encoding="utf-8").splitlines():
        if line.startswith("commit:"):
            return line.split(":", 1)[1].strip()
    return "unknown"


def demo_sha() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout.strip()
    except Exception:
        return None


def shapes_root(rebuild: bool) -> Path:
    out = CACHE / vendor_sha()
    if rebuild or not (out / "referrals").is_dir():
        import build_ontology  # vendored

        print(f"Building SHACL shapes from vendor/standard @ {vendor_sha()[:12]} ...")
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf):
                build_ontology.build(out)
        except build_ontology.BuildError as exc:
            print(buf.getvalue())
            sys.exit(f"Could not build the shapes: {exc}")
    return out


def standard_and_profile(path: Path) -> tuple[str, str]:
    parts = path.relative_to(RECORDS).parts
    standard = parts[0]
    profile = parts[1] if len(parts) > 2 else "standard"
    return standard, profile


def module_context(standard: str) -> dict:
    return json.loads((MODEL / standard / "context.jsonld").read_text(encoding="utf-8"))["@context"]


def context_keys(ctx: dict) -> tuple[set[str], dict[str, set[str]]]:
    """(top-level term names, {type or property name: scoped term names})."""
    top = {k for k in ctx if not k.startswith("@")}
    scoped: dict[str, set[str]] = {}
    for name, definition in ctx.items():
        if isinstance(definition, dict) and isinstance(definition.get("@context"), dict):
            scoped[name] = {k for k in definition["@context"] if not k.startswith("@")}
    return top, scoped


def undefined_keys(node, ctx_keys, parent_prop=None, pointer="") -> list[str]:
    top, scoped = ctx_keys
    problems = []
    if isinstance(node, list):
        for i, item in enumerate(node):
            problems += undefined_keys(item, ctx_keys, parent_prop, f"{pointer}/{i}")
        return problems
    if not isinstance(node, dict):
        return problems
    allowed = set(top)
    allowed |= scoped.get(parent_prop, set())
    types = node.get("@type")
    for t in types if isinstance(types, list) else [types] if types else []:
        if t not in top:
            problems.append(f"{pointer or '/'}: @type {t!r} is not defined in the module context")
        allowed |= scoped.get(t, set())
    if types is None and pointer:
        problems.append(f"{pointer}: nested object has no @type")
    for key, value in node.items():
        if key.startswith("@"):
            continue
        if key not in allowed:
            problems.append(f"{pointer}/{key}: key {key!r} is not defined in the module context")
            continue
        # Values of a Timing's frequency are opaque JSON (@json).
        if key == "frequency":
            continue
        problems += undefined_keys(value, ctx_keys, key, f"{pointer}/{key}")
    return problems


def as_list(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def is_identifier(node) -> bool:
    return isinstance(node, dict) and node.get("@type") == "Identifier"


def walk(node, pointer=""):
    """Yield (pointer, node) for every dict in the tree, depth first."""
    if isinstance(node, dict):
        yield pointer, node
        for k, v in node.items():
            if not k.startswith("@"):
                yield from walk(v, f"{pointer}/{k}")
    elif isinstance(node, list):
        for i, item in enumerate(node):
            yield from walk(item, f"{pointer}/{i}")


def walk_strings(node, pointer=""):
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ("@id", "@context", "frequency"):
                continue
            yield from walk_strings(v, f"{pointer}/{k}")
    elif isinstance(node, list):
        for i, item in enumerate(node):
            yield from walk_strings(item, f"{pointer}/{i}")
    elif isinstance(node, str):
        yield pointer, node


def ident_key(node: dict) -> str:
    return f"{node.get('system')}|{node.get('value')}"


def own_identifiers(record: dict) -> list[dict]:
    return [i for i in as_list(record.get("identifier")) if is_identifier(i)]


def load_records() -> list[tuple[Path, dict]]:
    records = []
    for path in sorted(RECORDS.rglob("*.jsonld")):
        records.append((path, json.loads(path.read_text(encoding="utf-8"))))
    return records


def load_yaml(name: str):
    path = ROOT / "data" / name
    if not path.is_file():
        return None
    return yaml.safe_load(path.read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- checks

def check_shacl(records, shapes_dir: Path) -> dict[Path, list[str]]:
    from pyshacl import validate
    from rdflib import Graph
    from rdflib.plugins.shared.jsonld.context import Context

    from build_contexts import titles_by_iri  # vendored
    from validate_examples import violations  # vendored

    problems: dict[Path, list[str]] = defaultdict(list)
    shapes_cache: dict[tuple[str, str], Graph] = {}
    names_cache: dict[str, tuple[dict, Context, dict]] = {}

    for path, record in records:
        standard, profile = standard_and_profile(path)
        shape_file = shapes_dir / standard / f"{standard}-{profile}-shape.ttl"
        if not shape_file.is_file():
            problems[path].append(f"no shape file {shape_file.relative_to(shapes_dir)}")
            continue
        if (standard, profile) not in shapes_cache:
            shapes_cache[standard, profile] = Graph().parse(shape_file, format="turtle")
        if standard not in names_cache:
            raw = module_context(standard)
            ctx = Context(raw)
            from validate_examples import term_names  # vendored
            names_cache[standard] = (raw, ctx, term_names(raw, ctx, titles_by_iri(standard)))
        raw, ctx, names = names_cache[standard]

        problems[path] += undefined_keys(record, context_keys(raw))

        data = dict(record)
        data["@context"] = raw
        graph = Graph().parse(data=json.dumps(data), format="json-ld")
        conforms, report_graph, _ = validate(graph, shacl_graph=shapes_cache[standard, profile],
                                             inference="none")
        if not conforms:
            for v in violations(report_graph, graph, names, ctx):
                problems[path].append(
                    f"SHACL {v['constraint']} on {v.get('focus', '?')}.{v.get('path', '?')}"
                )
    return problems


def check_dataset(records, external) -> list[str]:
    problems = []
    by_id: dict[str, Path] = {}
    index: dict[str, str] = {}

    for path, record in records:
        rid = record.get("@id")
        if not rid:
            problems.append(f"{rel(path)}: no @id")
            continue
        if rid in by_id:
            problems.append(f"{rel(path)}: duplicate @id {rid} (also {rel(by_id[rid])})")
        by_id[rid] = path
        for ident in own_identifiers(record):
            key = ident_key(ident)
            if key in index and index[key] != rid:
                problems.append(f"{rel(path)}: identifier {key} also belongs to {index[key]}")
            index[key] = rid

    external_keys = set()
    for entry in external or []:
        key = f"{entry['system']}|{entry['value']}"
        if key in index:
            problems.append(f"external-refs.yaml: {key} is listed as external but resolves to {index[key]}")
        external_keys.add(key)

    used_external = set()
    for path, record in records:
        own = {id(i) for i in own_identifiers(record)}
        for pointer, node in walk(record):
            if not is_identifier(node) or id(node) in own:
                continue
            key = ident_key(node)
            if key in index:
                continue
            if key in external_keys:
                used_external.add(key)
                continue
            problems.append(f"{rel(path)}{pointer}: identifier {key} resolves to no record "
                            "and is not in data/external-refs.yaml")

        for pointer, value in walk_strings(record):
            m = DATE_RE.match(value)
            if m and m.group(1) > SNAPSHOT_DATE:
                problems.append(f"{rel(path)}{pointer}: date {value} is after the snapshot ({SNAPSHOT_DATE})")

        for pointer, node in walk(record):
            if node.get("concernType") == "UNASSIGNED" and record.get("@id") not in ALLOWED_UNASSIGNED:
                problems.append(f"{rel(path)}{pointer}: concern is UNASSIGNED, but only "
                                f"{sorted(ALLOWED_UNASSIGNED)} may still await triage")

    for key in sorted(external_keys - used_external):
        problems.append(f"external-refs.yaml: {key} is never referenced")

    return problems


def check_targets(records) -> list[str]:
    """Annotations and UI-only content must point at things that exist."""
    problems = []
    ids = {r.get("@id") for _, r in records}
    person_ids = {i["value"] for _, r in records if r.get("@type") == "Person"
                  for i in own_identifiers(r) if i.get("system") == "https://anytown.example/id/person"}
    for entry in as_list(load_yaml("annotations.yaml")):
        for target in as_list(entry.get("records")):
            if target not in ids:
                problems.append(f"data/annotations.yaml: {entry.get('id')}: {target} is not a record @id")
    ui = load_yaml("ui.yaml") or {}
    for target in (ui.get("records") or {}):
        if target not in ids:
            problems.append(f"data/ui.yaml: records: {target} is not a record @id")
    for pid in (ui.get("people") or {}):
        if pid not in person_ids:
            problems.append(f"data/ui.yaml: people: {pid} is not a council person ID")
    return problems


ROUTE_RE = re.compile(
    r"^#/(?:"
    r"(?P<page>people|directory|front-door|map|gaps|about)?"
    r"|person/(?P<person>[\w-]+)(?:/timeline)?"
    r"|map/(?P<mapperson>[\w-]+)"
    r"|record/(?P<kind>[\w-]+)/(?P<local>[\w-]+)"
    r"|system/camhs(?:/(?P<camhs>[\w-]+))?"
    r")$"
)
VIEWS = {"screen", "split", "data"}
TABS = {"data", "explained", "map"}


def pointer_exists(data, pointer: str) -> bool:
    node = data
    for seg in [s for s in pointer.split("/") if s]:
        if isinstance(node, list) and seg.isdigit() and int(seg) < len(node):
            node = node[int(seg)]
        elif isinstance(node, dict) and seg in node:
            node = node[seg]
        else:
            return False
    return True


def check_journeys(records) -> list[str]:
    """Every step of every guided journey must open a real page and trace a real value."""
    journeys = load_yaml("journeys.yaml")
    if not journeys:
        return []
    by_id = {r["@id"]: r for _, r in records}
    gaps = {a.get("id") for a in as_list(load_yaml("annotations.yaml"))}
    base = "https://anytown.example/records"
    problems = []
    seen = set()
    for j in journeys:
        jid = j.get("id")
        if jid in seen:
            problems.append(f"data/journeys.yaml: duplicate journey id {jid}")
        seen.add(jid)
        for n, step in enumerate(as_list(j.get("steps")), 1):
            where = f"data/journeys.yaml: {jid} step {n} ({step.get('title', '?')})"
            for key in ("title", "route", "text"):
                if not step.get(key):
                    problems.append(f"{where}: missing {key}")
            m = ROUTE_RE.match(step.get("route", ""))
            page_record = None
            if not m:
                problems.append(f"{where}: route {step.get('route')!r} is not a page in the demo")
            elif m.group("person"):
                page_record = f"{base}/person/{m.group('person')}"
            elif m.group("mapperson"):
                if f"{base}/person/{m.group('mapperson')}" not in by_id:
                    problems.append(f"{where}: no person {m.group('mapperson')} to map")
            elif m.group("kind"):
                page_record = f"{base}/{m.group('kind')}/{m.group('local')}"
            elif m.group("camhs"):
                page_record = f"{base}/request/{m.group('camhs')}"
            if page_record and page_record not in by_id:
                problems.append(f"{where}: route points at {page_record}, which is not a record")
            if step.get("view", "split") not in VIEWS:
                problems.append(f"{where}: view must be one of {sorted(VIEWS)}")
            if step.get("tab", "data") not in TABS:
                problems.append(f"{where}: tab must be one of {sorted(TABS)}")
            if step.get("gap") and step["gap"] not in gaps:
                problems.append(f"{where}: no open question {step['gap']}")
            if step.get("task") and not step.get("trace"):
                problems.append(f"{where}: a task needs a trace: the value the viewer is asked to select")
            trace = step.get("trace")
            if trace:
                target = step.get("record") or page_record
                if target not in by_id:
                    problems.append(f"{where}: trace needs a record, but the page has none")
                elif not pointer_exists(by_id[target], trace):
                    problems.append(f"{where}: {trace} is not in {target}")
            scope = step.get("map")
            if scope and scope.get("id") and scope["id"] not in by_id:
                problems.append(f"{where}: map scope {scope['id']} is not a record")
    return problems


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


# --------------------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--rebuild", action="store_true", help="rebuild the SHACL shapes")
    args = parser.parse_args()

    records = load_records()
    shapes_dir = shapes_root(args.rebuild)

    per_record = check_shacl(records, shapes_dir)
    dataset = check_dataset(records, load_yaml("external-refs.yaml"))
    targets = check_targets(records) + check_journeys(records)

    failures = 0
    counts: dict[str, int] = defaultdict(int)
    for path, record in records:
        counts[record.get("@type", "?")] += 1
        issues = per_record.get(path, [])
        if issues:
            failures += 1
            print(f"FAIL  {rel(path)}")
            for issue in issues:
                print(f"        {issue}")
    for issue in dataset + targets:
        failures += 1
        print(f"FAIL  {issue}")

    ok = failures == 0
    print(f"\n{len(records)} records checked, {failures} problem(s)")
    print("  " + ", ".join(f"{t}: {n}" for t, n in sorted(counts.items())))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "valid": ok,
        "records": len(records),
        "byType": dict(sorted(counts.items())),
        "problems": failures,
        "standardCommit": vendor_sha(),
        "standardSource": (VENDOR / "SOURCE.txt").read_text(encoding="utf-8"),
        "demoCommit": demo_sha(),
        "snapshotDate": SNAPSHOT_DATE,
        "validatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }, indent=2) + "\n", encoding="utf-8", newline="\n")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
