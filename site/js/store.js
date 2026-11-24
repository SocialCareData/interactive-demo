// The bundle written by tools/build.py, with the lookups every view needs.
// No RDF processing happens in the browser: records are plain JSON objects.

export const store = {
    bundle: null,
    byLocal: new Map(),   // "<kind>/<localId>" -> @id
    incoming: new Map(),  // @id -> edges pointing at it
    outgoing: new Map(),  // @id -> edges from it
};

const PERSON_SYSTEM = "https://anytown.example/id/person";

export const KIND_OF_TYPE = {
    Person: "person",
    Organisation: "organisation",
    Service: "service",
    Professional: "professional",
    ServiceEpisode: "episode",
    LifeEvent: "life-event",
    Referral: "referral",
    Request: "request",
    QualityOfCareConcern: "qoc",
    Response: "response",
    CareNeedsAssessment: "assessment",
    CarePlan: "plan",
};

export const KIND_LABEL = {
    person: "Person",
    organisation: "Organisation",
    service: "Service",
    professional: "Professional",
    episode: "Episode",
    "life-event": "Life event",
    referral: "Referral",
    request: "Request",
    qoc: "Concern",
    response: "Response",
    assessment: "Assessment",
    plan: "Plan",
    local: "Local only",
    external: "Held elsewhere",
};

export const REFERENCE_KINDS = new Set(["organisation", "service", "professional"]);

export async function loadBundle() {
    const res = await fetch("data/bundle.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`Could not load data/bundle.json (${res.status}). Run tools/build.py.`);
    const bundle = await res.json();
    store.bundle = bundle;
    for (const [id, rec] of Object.entries(bundle.records)) {
        rec.id = id;
        rec.kind = KIND_OF_TYPE[rec.data["@type"]] || "other";
        rec.localId = id.split("/").pop();
        store.byLocal.set(`${rec.kind}/${rec.localId}`, id);
    }
    for (const e of bundle.edges) {
        if (!store.outgoing.has(e.from)) store.outgoing.set(e.from, []);
        store.outgoing.get(e.from).push(e);
        if (!store.incoming.has(e.to)) store.incoming.set(e.to, []);
        store.incoming.get(e.to).push(e);
    }
    return bundle;
}

export function rec(id) {
    return store.bundle.records[id] || null;
}

export function recByLocal(kind, localId) {
    const id = store.byLocal.get(`${kind}/${localId}`);
    return id ? rec(id) : null;
}

export function allRecords() {
    return Object.values(store.bundle.records);
}

export function identKey(ident) {
    return `${ident.system}|${ident.value}`;
}

/** Resolve an Identifier object to a record, or to an external ref, or null. */
export function resolve(ident) {
    if (!ident) return null;
    const key = identKey(ident);
    const id = store.bundle.index[key];
    if (id) return { record: rec(id) };
    const ext = store.bundle.external[key];
    if (ext) return { external: ext, key };
    return null;
}

export function route(r) {
    if (!r) return "#/";
    if (r.kind === "person") return `#/person/${councilId(r)}`;
    return `#/record/${r.kind}/${r.localId}`;
}

export function councilId(r) {
    const ids = asList(r.data.identifier);
    const council = ids.find((i) => i.system === PERSON_SYSTEM);
    return council ? council.value : r.localId;
}

export function nhsNumber(r) {
    const ids = asList(r.data.identifier);
    const n = ids.find((i) => i.system === "https://fhir.nhs.uk/Id/nhs-number");
    return n ? n.value : null;
}

export function asList(v) {
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : [v];
}

// ------------------------------------------------------------------ labels

export function enumLabel(enumName, code) {
    const e = store.bundle.enums[enumName];
    return (e && e[code] && e[code].t) || code;
}

export function enumDescription(enumName, code) {
    const e = store.bundle.enums[enumName];
    return (e && e[code] && e[code].d) || "";
}

/** Field documentation for a JSON key on a class, searching the record's module first. */
export function fieldDoc(module, cls, key) {
    const classes = store.bundle.classes;
    const order = [module, ...Object.keys(classes).filter((m) => m !== module)];
    for (const m of order) {
        const c = classes[m] && classes[m][cls];
        if (c && c.fields[key]) return { ...c.fields[key], module: m, cls };
    }
    return null;
}

export function classDoc(module, cls) {
    const classes = store.bundle.classes;
    const order = [module, ...Object.keys(classes).filter((m) => m !== module)];
    for (const m of order) {
        const c = classes[m] && classes[m][cls];
        if (c) return { ...c, module: m };
    }
    return null;
}

export function code(module, cls, key, value) {
    const doc = fieldDoc(module, cls, key);
    return doc && doc.enum ? enumLabel(doc.enum, value) : value;
}

export function personName(nameList) {
    const n = asList(nameList)[0];
    if (!n) return null;
    const given = asList(n.givenName);
    const family = asList(n.familyName).join(" ");
    const first = n.preferredName || given[0] || "";
    return [first, family].filter(Boolean).join(" ") || null;
}

export function formalName(nameList) {
    const n = asList(nameList)[0];
    if (!n) return null;
    return [...asList(n.givenName), ...asList(n.familyName)].join(" ");
}

/** A short human title for any record. */
export function title(r) {
    if (!r) return "";
    const d = r.data;
    switch (r.kind) {
        case "person": return personName(d.name) || r.localId;
        case "professional": return formalName([d.name]) || r.localId;
        case "organisation":
        case "service": return d.name || r.localId;
        case "referral": return `${enumLabel("ReferralTypeCode", d.type)} referral`;
        case "request": return `Request: ${enumLabel("RequestPurposeCode", d.purpose)}`;
        case "qoc": return `Quality-of-care concern: ${d.service && d.service.name || "service"}`;
        case "response": return `Response: ${enumLabel("ResponseStatusCode", d.status)}`;
        case "episode": return `${enumLabel("EpisodeCode", asList(d.type)[0])}`;
        case "life-event": return `${enumLabel("EventCode", asList(d.type)[0])}`;
        case "assessment": return "Care needs assessment";
        case "plan": return "Care and support plan";
        default: return r.localId;
    }
}

/** The main date of a record (ISO string), for sorting and chronologies. */
export function recDate(r) {
    const d = r.data;
    switch (r.kind) {
        case "referral":
        case "request":
        case "qoc":
        case "assessment":
        case "plan":
            return d.dateCompleted || null;
        case "response":
            return d.dateTimeReceived || null;
        case "episode":
        case "life-event": {
            const t = asList(d.timeInformation)[0];
            return t ? t.startDateTime : null;
        }
        default:
            return null;
    }
}

export function recEnd(r) {
    if (r.kind !== "episode" && r.kind !== "life-event") return null;
    const t = asList(r.data.timeInformation)[0];
    return t ? t.endDateTime || null : null;
}

// ------------------------------------------------------------------ graph helpers

export function edgesFrom(id) {
    return store.outgoing.get(id) || [];
}

export function edgesTo(id) {
    return store.incoming.get(id) || [];
}

/** Records that concern a person: anything pointing at them, plus responses to those. */
export function recordsAboutPerson(personId) {
    const direct = new Set();
    for (const e of edgesTo(personId)) {
        const from = rec(e.from);
        if (!from || from.kind === "person" || ["organisation", "service", "professional"].includes(from.kind)) continue;
        direct.add(from.id);
    }
    for (const id of [...direct]) {
        for (const e of edgesTo(id)) {
            const from = rec(e.from);
            if (from && from.kind === "response") direct.add(from.id);
        }
    }
    return [...direct].map(rec);
}

/** Subjects of care a record is about (for case records). */
export function peopleFor(r) {
    const out = new Set();
    for (const e of edgesFrom(r.id)) {
        const t = rec(e.to);
        if (t && t.kind === "person" && t.profile === "subject-of-care") out.add(t.id);
    }
    if (r.kind === "response") {
        const target = resolve(r.data.respondsTo);
        if (target && target.record) for (const p of peopleFor(target.record)) out.add(p.id);
    }
    return [...out].map(rec);
}

/** Latest response status for a referral, request or concern. */
export function responsesTo(r) {
    return edgesTo(r.id)
        .filter((e) => e.property === "respondsTo")
        .map((e) => rec(e.from))
        .filter(Boolean)
        .sort((a, b) => (recDate(a) || "").localeCompare(recDate(b) || ""));
}

export function ui() {
    return store.bundle.ui || {};
}

export function uiPerson(councilIdValue) {
    return (ui().people || {})[councilIdValue] || null;
}

export function uiRecord(id) {
    return (ui().records || {})[id] || null;
}

export function annotations() {
    return store.bundle.annotations || [];
}

export function annotationsFor(recordId, field) {
    return annotations().filter((a) =>
        asList(a.records).includes(recordId) && (field === undefined ? !a.field : a.field === field));
}
