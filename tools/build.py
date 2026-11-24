"""Build site/data/bundle.json: everything the static front end reads.

The front end does no RDF processing. This bundles:
  - every record (raw JSON-LD, as written), with its module and profile;
  - an identifier index (system|value -> @id);
  - resolved edges between records (and to external refs);
  - per-class field documentation from the vendored LinkML schemas, with deep
    links to the published standard pages (checked against data/anchors.json);
  - labels for every enum;
  - external refs, annotations, UI-only content and the validation summary.

    python tools/build.py
"""

from __future__ import annotations

import datetime as dt
import json
import shutil
import sys
import warnings
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor" / "standard"
SCRIPTS = VENDOR / "src" / "assets" / "scripts"
RECORDS = ROOT / "data" / "records"
SITE_DATA = ROOT / "site" / "data"

sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(ROOT / "tools"))

from validate import (  # noqa: E402
    SNAPSHOT_DATE, as_list, demo_sha, ident_key, is_identifier, load_records, load_yaml,
    own_identifiers, standard_and_profile, vendor_sha, walk,
)

STANDARD_NAMES = {
    "person": "Person standard (PUB01)",
    "safeguarding": "Safeguarding standard (PUB02)",
    "assessments-and-plans": "Assessments and Plans standard (PUB05)",
    "referrals": "Referrals and Requests standard (PUB06)",
}

# Anchor prefixes used by the standard site's field rows: #<prefix>-<jsonKey>.
ANCHOR_PREFIX = {
    "person": {
        "Person": "person", "Name": "name", "Address": "address", "Contact": "contact",
        "PartialDate": "partialdate", "PersonRelationship": "personrelationship",
        "Communication": "communication", "Language": "language", "Identifier": "identifier",
    },
    "safeguarding": {
        "Organisation": "organisation", "Service": "service", "Professional": "professional",
        "ServiceEpisode": "episode", "LifeEvent": "event", "SubjectPerson": "subjectperson",
        "RelatedProfessional": "relatedprofessional", "Timing": "timing", "Finding": "finding",
        "Observation": "observation", "Measurement": "measurement", "LinkedRecord": "linkedrecord",
    },
    "assessments-and-plans": {
        "CareNeedsAssessment": "assessment", "CarePlan": "plan", "CareAssessmentQuestion": "question",
        "CareComponent": "component", "CareActor": "actor", "CareActivity": "activity",
        "Review": "review", "Timing": "time", "Identifier": "identifier",
    },
    "referrals": {
        "Referral": "referral", "Request": "request", "QualityOfCareConcern": "qoc",
        "Response": "response", "IntakePerson": "intakeperson", "PersonalNetworkMember": "network",
        "ReferrerDetails": "referrer", "ConcernDetail": "concern", "QocConcernDetail": "qocconcern",
        "QocService": "qocservice", "ReferralInvolvement": "involvement",
        "ReferralAssessmentQuestion": "question", "DocumentReference": "document",
        "Identifier": "identifier",
    },
}

# Classes documented on another module's page (shared building blocks).
HOME_MODULE = {
    "Name": "person", "Address": "person", "Contact": "person", "PartialDate": "person",
    "PersonRelationship": "person", "Communication": "person", "Language": "person",
    "Person": "person", "Timing": "safeguarding", "LinkedRecord": "safeguarding",
    "Professional": "safeguarding",
}


def schema_docs(anchors: dict) -> tuple[dict, dict]:
    """({module: {Class: {title, description, url, fields: {key: {...}}}}}, {Enum: {code: {t, d}}})."""
    warnings.filterwarnings("ignore")
    from build_contexts import IMPORTMAP, json_keys, module_schemas
    from linkml_runtime.utils.schemaview import SchemaView

    classes: dict = {}
    enums: dict = {}

    def page(module):
        return anchors.get(module, {}).get("url")

    def ids(module):
        return set(anchors.get(module, {}).get("ids", []))

    def class_url(module, cls):
        home = HOME_MODULE.get(cls, module)
        for m in dict.fromkeys([module, home]):
            if cls.lower() in ids(m):
                return f"{page(m)}#{cls.lower()}"
        return page(home)

    def field_url(module, cls, keys):
        home = HOME_MODULE.get(cls, module)
        tries = []
        for m in dict.fromkeys([module, home, "person"]):
            prefix = ANCHOR_PREFIX.get(m, {}).get(cls)
            if cls == "IntakePerson" and m == "person":
                prefix = "person"
            if prefix:
                tries += [(m, f"{prefix}-{k}") for k in keys]
        for m, anchor in tries:
            if anchor in ids(m):
                return f"{page(m)}#{anchor}"
        return class_url(module, cls)

    for module, path in module_schemas():
        if module == "placements":
            continue
        sv = SchemaView(str(path), importmap=IMPORTMAP)
        mod_classes = {}
        for cls_name in sv.all_classes():
            cls = sv.get_class(cls_name)
            fields = {}
            for slot in sv.class_induced_slots(cls_name):
                keys = json_keys(slot)
                rng = slot.range
                entry = {
                    "title": slot.title or slot.name,
                    "description": (slot.description or "").strip(),
                    "range": rng,
                    "required": bool(slot.required),
                    "multivalued": bool(slot.multivalued),
                    "url": field_url(module, cls_name, keys),
                }
                if rng in sv.all_enums():
                    entry["enum"] = rng
                for k in keys:
                    fields[k] = entry
            mod_classes[cls_name] = {
                "title": cls.title or cls_name,
                "description": (cls.description or "").strip(),
                "url": class_url(module, cls_name),
                "fields": fields,
            }
        classes[module] = mod_classes
        for enum_name in sv.all_enums():
            e = sv.get_enum(enum_name)
            values = enums.setdefault(enum_name, {})
            for code, pv in (e.permissible_values or {}).items():
                values.setdefault(code, {"t": pv.title or code, "d": (pv.description or "").strip()})
    return classes, enums


def edges_for(records) -> tuple[dict, list]:
    index = {}
    for _, record in records:
        for ident in own_identifiers(record):
            index[ident_key(ident)] = record["@id"]

    edges = []
    seen = set()
    for _, record in records:
        rid = record["@id"]
        own = {id(i) for i in own_identifiers(record)}
        nodes = dict(walk(record))
        for pointer, node in nodes.items():
            if not is_identifier(node) or id(node) in own:
                continue
            key = ident_key(node)
            target = index.get(key, f"ext:{key}")
            segments = [s for s in pointer.split("/") if s and not s.isdigit()]
            prop = segments[0] if segments else "?"
            edge = {"from": rid, "to": target, "property": prop, "path": pointer}
            if segments and segments[-1] == "recordId":
                parent = nodes.get(pointer.rsplit("/", 1)[0], {})
                edge["property"] = "linkedRecord"
                if parent.get("recordRelationship"):
                    edge["relationship"] = parent["recordRelationship"]
            elif segments and segments[-1] == "matchedPersonRef":
                edge["property"] = f"{prop}.matchedPersonRef"
            if target == rid:
                continue
            sig = (rid, target, edge["property"], edge.get("relationship"))
            if sig in seen:
                continue
            seen.add(sig)
            edges.append(edge)
    return index, edges


def main() -> int:
    records = load_records()
    anchors = json.loads((ROOT / "data" / "anchors.json").read_text(encoding="utf-8"))
    classes, enums = schema_docs(anchors)
    index, edges = edges_for(records)

    bundle_records = {}
    for path, record in records:
        module, profile = standard_and_profile(path)
        bundle_records[record["@id"]] = {
            "module": module,
            "profile": profile,
            "file": path.relative_to(ROOT).as_posix(),
            "data": record,
        }

    validation_file = SITE_DATA / "validation.json"
    validation = (json.loads(validation_file.read_text(encoding="utf-8"))
                  if validation_file.is_file() else None)

    bundle = {
        "meta": {
            "snapshotDate": SNAPSHOT_DATE,
            "builtAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "standardCommit": vendor_sha(),
            "standardSource": (VENDOR / "SOURCE.txt").read_text(encoding="utf-8"),
            "demoCommit": demo_sha(),
            "standards": {m: {"name": STANDARD_NAMES[m], "url": anchors[m]["url"]}
                          for m in STANDARD_NAMES if m in anchors},
        },
        "validation": validation,
        "records": bundle_records,
        "index": index,
        "edges": edges,
        "classes": classes,
        "enums": enums,
        "external": {f"{e['system']}|{e['value']}": e for e in as_list(load_yaml("external-refs.yaml"))},
        "annotations": load_yaml("annotations.yaml") or [],
        "ui": load_yaml("ui.yaml") or {},
    }

    SITE_DATA.mkdir(parents=True, exist_ok=True)
    out = SITE_DATA / "bundle.json"
    out.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":"), default=str) + "\n",
                   encoding="utf-8", newline="\n")
    css = ROOT / "site" / "css" / "standard-tokens.css"
    shutil.copyfile(VENDOR / "src" / "_styles" / "_root.css", css)

    unresolved = [e for e in edges if e["to"].startswith("ext:")]
    print(f"Wrote {out.relative_to(ROOT)}: {len(bundle_records)} records, {len(edges)} edges "
          f"({len(unresolved)} to external refs), {sum(len(c) for c in classes.values())} classes, "
          f"{len(enums)} enums, {out.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
