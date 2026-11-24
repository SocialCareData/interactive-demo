// One read-only "Example CMS" screen per record type (PLAN.md §5.5).
// Every value from the record is wrapped by fielder().v so it can be traced (§5.2).
// Greyed content comes only from ui.yaml (via notStd), never from the JSON-LD.

import {
    h, frag, fielder, fmtDate, fmtDateTime, age, frequencyText, tag, recLink, identLink, notStd,
    gapMarker, card, fields, yesNo,
} from "./ui.js";
import {
    rec, resolve, title, recDate, responsesTo, edgesFrom, edgesTo, enumLabel, uiRecord,
    annotationsFor, asList, personName, formalName, KIND_LABEL, route, peopleFor, store, REFERENCE_KINDS,
} from "./store.js";

// ------------------------------------------------------------------ shared pieces

function gaps(r, field) {
    const list = annotationsFor(r.id, field);
    return list.length ? list.map((a) => gapMarker(a)) : null;
}

function header(r, f, opts = {}) {
    const people = peopleFor(r);
    const local = uiRecord(r.id);
    return frag(
        h("div.cms-head",
            h("div.crumbs",
                REFERENCE_KINDS.has(r.kind) ? h("a", { href: "#/directory" }, "Directory") : h("a", { href: "#/people" }, "People"), " › ",
                people.length ? frag(h("a", { href: route(people[0]) }, title(people[0])), " › ") : null,
                `${KIND_LABEL[r.kind]} ${r.localId}`),
            h("div",
                h("h1", tag(r.kind), h("span", opts.title || title(r))),
                opts.sub ? h("div.sub", opts.sub) : null),
            opts.right ? h("div.aside", opts.right) : null),
        gaps(r));
}

/** A response status, as plain text: styled tags are kept for kinds of record. */
function statusFlag(status, f, path) {
    const label = enumLabel("ResponseStatusCode", status);
    return h("span.status", f ? f.v(path, label, { code: true }) : label);
}

function derivedStatus(r) {
    const responses = responsesTo(r);
    if (!responses.length) return h("span.flag.warn", r.kind === "qoc" ? "No response yet" : "Received, not yet acknowledged");
    const last = responses[responses.length - 1];
    return h("span", { title: "Derived from the latest Response record" },
        "Status: ", statusFlag(last.data.status), h("span.small.muted", ` (from response, ${fmtDate(recDate(last))})`));
}

function intakePerson(r, f, base, p) {
    const name = personName(p.name);
    const dob = p.dateOfBirth && p.dateOfBirth.date;
    const ids = asList(p.identifier);
    const matched = asList(p.matchedPersonRef);
    const local = uiRecord(r.id);
    return h("div",
        fields([
            ["Name", name ? f.v(`${base}/name/0`, name) : h("em.muted", "Name not known")],
            ["Date of birth", dob ? f.v(`${base}/dateOfBirth/date`, `${fmtDate(dob)} (age ${age(dob)})`) : null],
            ["Address", asList(p.address).map((a, i) => f.v(`${base}/address/${i}`, [a.line1, a.line2, a.city, a.postcode].filter(Boolean).join(", "), { block: true }))],
            ["Contact", asList(p.contact).map((c, i) => f.v(`${base}/contact/${i}`, [c.name, ...asList(c.telephone), ...asList(c.email)].filter(Boolean).join(", "), { block: true }))],
            ["Identifiers given", ids.map((id, i) => f.v(`${base}/identifier/${i}`, h("span", identLabel(id), " ", identLink(id)), { key: "identifier" }))],
            ["Knows about this", f.v(`${base}/isAwareOfReferral`, yesNo(p.isAwareOfReferral))],
            ["Notes", p.notes || p.intakeNotes ? f.v(`${base}/${p.notes ? "notes" : "intakeNotes"}`, p.notes || p.intakeNotes) : null],
            ["Matched to", matched.length ? h("div", matched.map((m, i) => f.v(`${base}/matchedPersonRef/${i}`, identLink(m), { key: "matchedPersonRef" })),
                local && local.matched ? notStd(local.matched) : null) : null],
        ]));
}

function identLabel(id) {
    if (id.system === "https://fhir.nhs.uk/Id/nhs-number") return `NHS number ${formatNhs(id.value)}`;
    if (id.system === "https://anytown.example/id/person") return `Council ID ${id.value}`;
    return id.value;
}

export function formatNhs(n) {
    return n && n.length === 10 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : n;
}

function referrerBlock(r, f) {
    const ref = r.data.referrer;
    if (!ref) return null;
    const base = "/referrer";
    const rows = [["Referrer type", f.v(`${base}/referrerType`, enumLabel("ReferrerTypeCode", ref.referrerType), { code: true })]];
    if (ref.professional) {
        const p = ref.professional;
        rows.push(["Name", f.v(`${base}/professional/name`, formalName([p.name]))]);
        rows.push(["Role", f.v(`${base}/professional/role`, asList(p.role).join(", "))]);
        if (p.contact) rows.push(["Contact", f.v(`${base}/professional/contact`, [...asList(p.contact.telephone), ...asList(p.contact.email)].join(", "))]);
        rows.push(["Works for", asList(p.relatedService).map((s, i) => f.v(`${base}/professional/relatedService/${i}`, identLink(s), { key: "relatedService" }))]);
        rows.push(["In the directory", asList(p.identifier).map((s, i) => f.v(`${base}/professional/identifier/${i}`, identLink(s), { key: "identifier" }))]);
    }
    if (ref.professionalId) rows.push(["Professional", f.v(`${base}/professionalId`, identLink(ref.professionalId), { key: "professionalId" })]);
    if (ref.person) {
        rows.push(["Name", f.v(`${base}/person/name/0`, personName(ref.person.name) || "Not given")]);
        if (ref.person.contact) rows.push(["Contact", asList(ref.person.contact).map((c, i) => f.v(`${base}/person/contact/${i}`, [...asList(c.telephone), ...asList(c.email)].join(", "), { block: true }))]);
    }
    if (ref.relationship) rows.push(["Relationship to the person", f.v(`${base}/relationship`, enumLabel("PersonRelationshipCode", ref.relationship), { code: true })]);
    if (ref.relationshipDescription) rows.push(["Relationship", f.v(`${base}/relationshipDescription`, ref.relationshipDescription)]);
    return card("Referrer", fields(rows));
}

function subjectsCard(r, f, heading = "Who it's about") {
    const subjects = asList(r.data.subject);
    if (!subjects.length) return null;
    return card(heading, gaps(r, "subject"),
        subjects.map((p, i) => h("div", i ? h("hr") : null, intakePerson(r, f, `/subject/${i}`, p))));
}

function networkCard(r, f) {
    const net = asList(r.data.personalNetwork);
    if (!net.length) return null;
    const rows = net.map((m, i) => {
        const p = m.networkPerson || m.person || {};
        const pk = m.networkPerson ? "networkPerson" : "person";
        const rk = m.networkRelationship ? "networkRelationship" : "relationship";
        const base = `/personalNetwork/${i}`;
        return h("tr",
            h("td", personName(p.name) ? f.v(`${base}/${pk}/name/0`, personName(p.name)) : h("em.muted", "Name not known")),
            h("td", f.v(`${base}/${rk}`, enumLabel("PersonRelationshipCode", m[rk]), { code: true })),
            h("td", f.v(`${base}/${pk}/isAwareOfReferral`, yesNo(p.isAwareOfReferral))),
            h("td", asList(p.contact).map((c, j) => f.v(`${base}/${pk}/contact/${j}`, asList(c.telephone).join(", ")))),
            h("td", p.notes ? f.v(`${base}/${pk}/notes`, p.notes) : (m.networkDescription || m.description || "")));
    });
    return card("Family and personal network",
        h("div.table-wrap", h("table.list",
            h("thead", h("tr", h("th", "Name"), h("th", "Relationship"), h("th", "Knows about this"), h("th", "Phone"), h("th", "Notes"))),
            h("tbody", rows))));
}

function concernsCard(r, f, qoc = false) {
    const local = uiRecord(r.id);
    const list = asList(r.data.concern);
    return card("Concerns", gaps(r, "concern"),
        list.map((c, i) => {
            const enumName = qoc ? "QocConcernCode" : "ConcernCode";
            const unassigned = c.concernType === "UNASSIGNED";
            return h("div", i ? h("hr") : null,
                c.description || c.concernDescription
                    ? f.v(`/concern/${i}/${c.description ? "description" : "concernDescription"}`, h("div.quote", c.description || c.concernDescription), { block: true })
                    : null,
                h("p", h("strong", "Concern type: "),
                    unassigned
                        ? h("span.flag.warn", f.v(`/concern/${i}/concernType`, "Unassigned: awaiting triage", { code: true }))
                        : f.v(`/concern/${i}/concernType`, enumLabel(enumName, c.concernType), { code: true })),
                local && local.triageNote && !unassigned ? notStd(local.triageNote) : null);
        }));
}

function questionsCard(r, f, heading, enumName) {
    const qs = asList(r.data.assessmentQuestion);
    if (!qs.length) return null;
    const byCat = new Map();
    qs.forEach((q, i) => {
        if (!byCat.has(q.category)) byCat.set(q.category, []);
        byCat.get(q.category).push([q, i]);
    });
    const body = [];
    for (const [cat, items] of byCat) {
        body.push(h("h3", f.v(`/assessmentQuestion/${items[0][1]}/category`, enumLabel(enumName, cat), { code: true })));
        for (const [q, i] of items) {
            const base = `/assessmentQuestion/${i}`;
            body.push(h("div", { style: "margin-bottom:.7rem" },
                h("div",
                    q.questionId
                        ? h("span.flag.ok", { title: "A national question ID: every system asks this the same way" }, f.v(`${base}/questionId`, q.questionId))
                        : h("span.flag.neutral", { title: "No questionId: this question is local to this council" }, "Local question: no national ID"),
                    " ", f.v(`${base}/questionText`, h("strong", q.questionText)),
                    q.required ? h("span.small.muted", " (required)") : null),
                h("div", asList(q.answer).map((a, j) => f.v(`${base}/answer/${j}`, h("div.quote", a), { block: true, key: `answer (${q.answerType})` })))));
        }
    }
    return card(heading, gaps(r, "assessmentQuestion"), body);
}

function attachmentsCard(r, f) {
    const list = asList(r.data.attachment);
    if (!list.length) return null;
    return card("Attachments", h("ul.links-list", list.map((d, i) => h("li",
        f.v(`/attachment/${i}`, h("span", h("strong", d.title || d.documentTitle || "Document"),
            d.mimeType ? h("span.muted", ` (${d.mimeType})`) : null,
            h("br"), h("code.small", d.url || d.documentUrl || "")), { key: "attachment" })))),
    h("p.small.muted", "The document itself is held by the sender; the record carries a reference to it."));
}

function responsesCard(r) {
    const responses = responsesTo(r);
    return card("Responses received",
        responses.length ? h("ul.links-list", responses.map((x) => h("li",
            h("span.rel", fmtDateTime(recDate(x))), statusFlag(x.data.status), " ", recLink(x, `${KIND_LABEL.response} ${x.localId}`))))
            : h("p.muted", "No responses yet."));
}

const INCOMING = {
    followupTo: "Followed up by",
    escalationOf: "Escalated by",
    deescalationOf: "De-escalated by",
    reactivationOf: "Reactivated by",
    concurrentWith: "Concurrent with",
};

/** "Responds to", "Follow-up to", "Linked records" and incoming links, as chips (§5.5). */
function linksCard(r, f) {
    const out = [];
    asList(r.data.linkedRecord).forEach((l, i) => {
        out.push(h("li",
            h("span.rel", l.recordRelationship ? enumLabel("RecordRelationshipCode", l.recordRelationship) : "Linked"),
            f.v(`/linkedRecord/${i}`, identLink(l.recordId), { key: "linkedRecord", code: false }),
            h("span.small.muted", ` (${enumLabel("RecordTypeCode", l.recordType)})`)));
    });
    for (const e of edgesTo(r.id)) {
        const from = rec(e.from);
        if (!from) continue;
        if (e.property === "linkedRecord") {
            out.push(h("li", h("span.rel", INCOMING[e.relationship] || "Linked from"), recLink(from)));
        } else if (["serviceEpisodeId", "planId", "assessmentId"].includes(e.property)) {
            out.push(h("li", h("span.rel", `Referenced by (${e.property})`), recLink(from)));
        }
    }
    const local = uiRecord(r.id);
    return card("Linked records",
        out.length ? h("ul.links-list", out) : h("p.muted", "No linked records."),
        local && local.escalation ? notStd(local.escalation) : null,
        gaps(r, "linkedRecord"));
}

function peopleLinks(r) {
    const ppl = peopleFor(r);
    return ppl.length ? h("span", "About: ", ppl.map((p) => recLink(p))) : null;
}

// ------------------------------------------------------------------ Referral

function referral(r) {
    const f = fielder(r);
    const d = r.data;
    return frag(
        header(r, f, {
            title: h("span", "Referral ", f.v("/identifier/value", d.identifier && d.identifier.value)),
            sub: h("span", f.v("/type", enumLabel("ReferralTypeCode", d.type), { code: true }), ", received ",
                f.v("/dateCompleted", fmtDateTime(d.dateCompleted))),
            right: derivedStatus(r),
        }),
        h("div.grid-2",
            h("div", referrerBlock(r, f),
                card("Sent to", fields([["Recipient", asList(d.recipient).map((x, i) => f.v(`/recipient/${i}`, identLink(x), { key: "recipient" }))]]))),
            h("div", subjectsCard(r, f))),
        networkCard(r, f),
        concernsCard(r, f),
        d.involvement ? card("Other professionals involved", gaps(r, "involvement"), fields([
            ["Who", f.v("/involvement/actorType", enumLabel("ReferrerTypeCode", d.involvement.actorType || d.involvement.involvementActorType), { code: true })],
            ["Service", asList(d.involvement.actorId || d.involvement.involvementActorId).map((x, i) => f.v(`/involvement/${d.involvement.actorId ? "actorId" : "involvementActorId"}/${i}`, identLink(x), { key: "actorId" }))],
            ["Details", d.involvement.description || d.involvement.involvementDescription
                ? f.v(`/involvement/${d.involvement.description ? "description" : "involvementDescription"}`, d.involvement.description || d.involvement.involvementDescription) : null],
        ])) : null,
        questionsCard(r, f, "Questions on the referral form", "ReferralQuestionCategory"),
        attachmentsCard(r, f),
        responsesCard(r),
        linksCard(r, f));
}

// ------------------------------------------------------------------ Request

function request(r) {
    const f = fielder(r);
    const d = r.data;
    const isCamhs = asList(d.recipient).some((x) => x.value === "SVC-CAMHS");
    return frag(
        header(r, f, {
            title: h("span", "Request ", f.v("/identifier/value", d.identifier && d.identifier.value)),
            sub: h("span", "Purpose: ", f.v("/purpose", enumLabel("RequestPurposeCode", d.purpose), { code: true }),
                ". Sent ", f.v("/dateCompleted", fmtDateTime(d.dateCompleted)), "."),
            right: derivedStatus(r),
        }),
        isCamhs ? systemSwitch(r, "council") : null,
        card("Request details", fields([
            ["To", asList(d.recipient).map((x, i) => f.v(`/recipient/${i}`, identLink(x), { key: "recipient" }))],
            ["From", f.v("/referrer", identLink(d.referrer), { key: "referrer" })],
            ["About", h("span", f.v("/subject", identLink(d.subject), { key: "subject" }), " ",
                h("span.small.muted", identLabel(d.subject)))],
            ["Purpose", f.v("/purpose", enumLabel("RequestPurposeCode", d.purpose), { code: true })],
        ])),
        questionsCard(r, f, "Reason and supporting information", "ReferralQuestionCategory"),
        attachmentsCard(r, f),
        responsesCard(r),
        linksCard(r, f));
}

export function systemSwitch(r, current) {
    return h("div",
        h("div.system-switch", { role: "group", "aria-label": "View this record in" },
            h("a", { href: route(r), "aria-current": String(current === "council") }, "Example CMS (council)"),
            h("a", { href: `#/system/camhs/${r.localId}`, "aria-current": String(current === "camhs") }, "Anytown CAMHS")),
        h("span.switch-note", "The same record in two systems."));
}

// ------------------------------------------------------------------ Quality-of-care concern

function qoc(r) {
    const f = fielder(r);
    const d = r.data;
    const svc = d.service || {};
    return frag(
        header(r, f, {
            title: h("span", "Quality-of-care concern ", f.v("/identifier/value", d.identifier && d.identifier.value)),
            sub: h("span", "Received ", f.v("/dateCompleted", fmtDateTime(d.dateCompleted))),
            right: derivedStatus(r),
        }),
        h("div.grid-2",
            h("div",
                card("About the service", fields([
                    ["Service", svc.name ? f.v("/service/name", svc.name) : null],
                    ["Registration", svc.identifier ? f.v("/service/identifier", identLink(svc.identifier), { key: "identifier" }) : null],
                    ["Description", svc.description ? f.v("/service/description", svc.description) : null],
                ])),
                card("Sent to", fields([["Recipients", asList(d.recipient).map((x, i) => f.v(`/recipient/${i}`, identLink(x), { key: "recipient" }))]])),
                d.referrer ? referrerBlock(r, f) : card("Referrer", h("p.muted", "Made anonymously: no referrer details."))),
            h("div", subjectsCard(r, f, "Person affected"))),
        concernsCard(r, f, true),
        questionsCard(r, f, "Questions", "ReferralQuestionCategory"),
        attachmentsCard(r, f),
        responsesCard(r),
        linksCard(r, f));
}

// ------------------------------------------------------------------ Response

function response(r) {
    const f = fielder(r);
    const d = r.data;
    const target = resolve(d.respondsTo);
    const isCamhs = d.responder && d.responder.value === "SVC-CAMHS" && target && target.record;
    return frag(
        header(r, f, {
            title: h("span", "Response ", d.identifier ? f.v("/identifier/value", d.identifier.value) : r.localId),
            sub: h("span", "Received ", f.v("/dateTimeReceived", fmtDateTime(d.dateTimeReceived))),
            right: statusFlag(d.status, f, "/status"),
        }),
        isCamhs ? h("p.small", "Sent from Anytown CAMHS's own system. ",
            h("a", { href: `#/system/camhs/${target.record.localId}` }, "See it in the CAMHS view")) : null,
        card("Response", fields([
            ["Responding to", h("span", f.v("/respondsTo", identLink(d.respondsTo), { key: "respondsTo" }),
                d.respondsToType ? h("span.small.muted", " (", f.v("/respondsToType", enumLabel("RecordTypeCode", d.respondsToType), { code: true }), ")") : null)],
            ["From", f.v("/responder", identLink(d.responder), { key: "responder" })],
            ["Status", statusFlag(d.status, f, "/status")],
            ["Status means", h("span.small.muted", store.bundle.enums.ResponseStatusCode?.[d.status]?.d || "")],
            ["Details", d.description ? f.v("/description", h("div.quote", d.description), { block: true }) : null],
        ])),
        attachmentsCard(r, f),
        linksCard(r, f));
}

// ------------------------------------------------------------------ ServiceEpisode and LifeEvent

const INVOLVEMENT = { SBJ: "Subject", PPRF: "Primary performer", SPRF: "Secondary performer", PART: "Participant", INF: "Informant", CON: "Consultant" };

function period(f, t, base) {
    if (!t) return null;
    return h("span", f.v(`${base}/startDateTime`, fmtDateTime(t.startDateTime)), " – ",
        t.endDateTime ? f.v(`${base}/endDateTime`, fmtDateTime(t.endDateTime)) : h("span.flag.ok", "Open"));
}

function whoAndWhere(r, f) {
    const d = r.data;
    return fields([
        ["People", asList(d.subjectPerson).map((s, i) => h("div",
            f.v(`/subjectPerson/${i}/person`, identLink(s.person), { key: "person" }), " ",
            f.v(`/subjectPerson/${i}/involvement`, h("span.small.muted", INVOLVEMENT[s.involvement] || s.involvement), { code: true })))],
        ["Professionals", asList(d.relatedProfessional).map((s, i) => h("div",
            f.v(`/relatedProfessional/${i}/professional`, identLink(s.professional), { key: "professional" }), " ",
            f.v(`/relatedProfessional/${i}/involvement`, h("span.small.muted", INVOLVEMENT[s.involvement] || s.involvement), { code: true })))],
        ["Services", asList(d.relatedService).map((s, i) => f.v(`/relatedService/${i}`, identLink(s), { key: "relatedService" }))],
        ["Where", asList(d.location).map((l, i) => f.v(`/location/${i}`, l, { block: true }))],
        ["When", asList(d.timeInformation).map((t, i) => h("div", period(f, t, `/timeInformation/${i}`),
            t.frequency ? h("div.small", f.v(`/timeInformation/${i}/frequency`, frequencyText(t.frequency), { key: "frequency" })) : null))],
    ]);
}

function episode(r) {
    const f = fielder(r);
    const d = r.data;
    const local = uiRecord(r.id);
    const findings = asList(d.finding);
    return frag(
        header(r, f, {
            title: h("span", asList(d.type).map((t, i) => f.v(`/type/${i}`, enumLabel("EpisodeCode", t), { code: true }))),
            sub: h("span", "Episode ", f.v("/identifier/0/value", r.localId), ": ", period(f, asList(d.timeInformation)[0], "/timeInformation/0")),
        }),
        gaps(r, "type"),
        card("Episode", whoAndWhere(r, f)),
        findings.length ? card("Findings", findings.map((fd, i) => h("div",
            asList(fd.observation).length ? h("h3", "Observations") : null,
            h("ul", asList(fd.observation).map((o, j) => h("li",
                f.v(`/finding/${i}/observation/${j}/type`, enumLabel("ObservationType", o.type), { code: true }),
                h("span.small.muted", " since ", f.v(`/finding/${i}/observation/${j}/startDate`, fmtDate(o.startDate)))))),
            asList(fd.measurement).length ? h("h3", "Measurements") : null,
            h("ul", asList(fd.measurement).map((m, j) => h("li",
                f.v(`/finding/${i}/measurement/${j}/type`, enumLabel("MeasurementType", m.type)), ": ",
                f.v(`/finding/${i}/measurement/${j}/value`, String(m.value)),
                f.v(`/finding/${i}/measurement/${j}/unit`, m.unit === "pct" ? "%" : ` ${enumLabel("MeasurementUnit", m.unit)}`, { code: true })))),
            asList(fd.text).map((t, j) => f.v(`/finding/${i}/text/${j}`, h("div.quote", t), { block: true }))))) : null,
        card("Outcome",
            d.outcome || d.episodeOutcome
                ? f.v(`/${d.outcome ? "outcome" : "episodeOutcome"}`, enumLabel("EpisodeOutcome", d.outcome || d.episodeOutcome), { code: true })
                : h("p.muted", "No outcome recorded."),
            gaps(r, "outcome")),
        linksCard(r, f));
}

function lifeEvent(r) {
    const f = fielder(r);
    const d = r.data;
    return frag(
        header(r, f, {
            title: h("span", asList(d.type).map((t, i) => f.v(`/type/${i}`, enumLabel("EventCode", t), { code: true }))),
            sub: h("span", "Life event ", f.v("/identifier/0/value", r.localId), ": ", period(f, asList(d.timeInformation)[0], "/timeInformation/0")),
        }),
        card("What happened, when, where and who", whoAndWhere(r, f)),
        linksCard(r, f));
}

// ------------------------------------------------------------------ Assessments and Plans

function foundation(r, f) {
    const d = r.data;
    return fields([
        ["Person", f.v("/personId", identLink(d.personId), { key: "personId" })],
        ["Completed by", f.v("/professionalId", identLink(d.professionalId), { key: "professionalId" })],
        ["Date", f.v("/dateCompleted", fmtDateTime(d.dateCompleted))],
        ["Status", f.v("/status", enumLabel("DocumentStatus", d.status), { code: true })],
        ["Episode", asList(d.serviceEpisodeId).map((x, i) => f.v(`/serviceEpisodeId/${i}`, identLink(x), { key: "serviceEpisodeId" }))],
        ["Care plan", d.planId ? f.v("/planId", identLink(d.planId), { key: "planId" }) : null],
        ["Assessment", d.assessmentId ? f.v("/assessmentId", identLink(d.assessmentId), { key: "assessmentId" }) : null],
        ["Review", asList(d.review).map((rv, i) => f.v(`/review/${i}/isReview`, rv.isReview ? "This is a review" : "First assessment (not a review)", { key: "isReview" }))],
    ]);
}

function capacityFlags(f, d) {
    return fields([
        ["Capacity to take part", f.v("/capacityToCompleteAssessment", yesNo(d.capacityToCompleteAssessment))],
        ["Advocate required", f.v("/advocateRequired", yesNo(d.advocateRequired))],
        ["Consent to share information", f.v("/consentToInformationSharing", yesNo(d.consentToInformationSharing))],
    ]);
}

function assessment(r) {
    const f = fielder(r);
    const d = r.data;
    return frag(
        header(r, f, {
            title: h("span", "Care needs assessment ", f.v("/identifier/value", d.identifier && d.identifier.value)),
            sub: "Care Act 2014 assessment of needs",
        }),
        h("div.grid-2", card("Assessment", foundation(r, f)), card("Capacity, advocacy and consent", capacityFlags(f, d))),
        questionsCard(r, f, "Questions and answers", "QuestionCategory"),
        linksCard(r, f));
}

function carePlan(r) {
    const f = fielder(r);
    const d = r.data;
    const comps = asList(d.careComponent);
    return frag(
        header(r, f, {
            title: h("span", "Care and support plan ", f.v("/identifier/value", d.identifier && d.identifier.value)),
            sub: "Who does what, and when",
        }),
        h("div.grid-2", card("Plan", foundation(r, f)), card("Capacity, advocacy and consent", capacityFlags(f, d))),
        card("Care and support", gaps(r, "careComponent"),
            h("div.table-wrap", h("table.list",
                h("thead", h("tr", h("th", "Who"), h("th", "When"), h("th", "What"), h("th", "Outcome it meets"))),
                h("tbody", comps.map((c, i) => {
                    const base = `/careComponent/${i}`;
                    return h("tr",
                        h("td", asList(c.actor).map((a, j) => h("div",
                            f.v(`${base}/actor/${j}/actorId`, identLink(a.actorId), { key: "actorId" }), " ",
                            f.v(`${base}/actor/${j}/actorType`, h("span.small.muted", enumLabel("CareActorType", a.actorType)), { code: true })))),
                        h("td", c.time ? h("span",
                            c.time.frequency ? f.v(`${base}/time/frequency`, frequencyText(c.time.frequency), { key: "frequency" }) : null,
                            h("div.small.muted", "from ", f.v(`${base}/time/startDateTime`, fmtDate(c.time.startDateTime)))) : null),
                        h("td", c.activity ? f.v(`${base}/activity/activityDescription`, c.activity.activityDescription) : null,
                            c.activity && c.activity.directPayment ? h("div.small", "Direct payment") : null),
                        h("td", c.activity && c.activity.outcome ? f.v(`${base}/activity/outcome`, enumLabel("CareActOutcome", c.activity.outcome), { code: true }) : null));
                }))))),
        linksCard(r, f));
}

// ------------------------------------------------------------------ Directory

function directory(r) {
    const f = fielder(r);
    const d = r.data;
    const kind = r.kind;
    const enumName = kind === "organisation" ? "OrganisationCode" : "ServiceCode";
    const rows = [];
    if (kind === "professional") {
        rows.push(["Name", f.v("/name", formalName([d.name]))]);
        rows.push(["Role", asList(d.role).map((x, i) => f.v(`/role/${i}`, x, { block: true }))]);
        rows.push(["Contact", d.contact ? f.v("/contact", [...asList(d.contact.telephone), ...asList(d.contact.email)].join(", ")) : null]);
        rows.push(["Working", d.workingStatus !== undefined ? f.v("/workingStatus", yesNo(d.workingStatus)) : null]);
    } else {
        rows.push(["Name", f.v("/name", d.name)]);
        rows.push(["Also known as", asList(d.alias).map((x, i) => f.v(`/alias/${i}`, x, { block: true }))]);
        rows.push(["Type", asList(d.type).map((x, i) => f.v(`/type/${i}`, enumLabel(enumName, x), { code: true }))]);
        rows.push(["Address", asList(d.address).map((a, i) => f.v(`/address/${i}`, [a.line1, a.line2, a.city, a.postcode].filter(Boolean).join(", "), { block: true }))]);
        rows.push(["Contact", asList(d.contact).map((c, i) => f.v(`/contact/${i}`, [c.name, ...asList(c.telephone), ...asList(c.email)].filter(Boolean).join(", "), { block: true }))]);
        if (kind === "service") rows.push(["Charged", f.v("/costFrequency", enumLabel("ServiceCostFrequency", d.costFrequency), { code: true })]);
    }
    rows.push(["Identifier", asList(d.identifier).map((x, i) => f.v(`/identifier/${i}/value`, x.value))]);
    rows.push(["Services", asList(d.relatedService).map((x, i) => f.v(`/relatedService/${i}`, identLink(x), { key: "relatedService" }))]);
    rows.push(["Part of", asList(d.relatedOrganisation).map((x, i) => f.v(`/relatedOrganisation/${i}`, identLink(x), { key: "relatedOrganisation" }))]);
    if (kind === "service" && !asList(d.relatedOrganisation).length) {
        rows.push(["Part of", h("span.muted", "No organisation: see the open question below")]);
    }

    const usedBy = edgesTo(r.id)
        .map((e) => rec(e.from))
        .filter((x) => x && !["organisation", "service", "professional"].includes(x.kind));
    const unique = [...new Map(usedBy.map((x) => [x.id, x])).values()];
    return frag(
        header(r, f, { title: kind === "professional" ? formalName([d.name]) : d.name, sub: `${KIND_LABEL[kind]} directory entry` }),
        card("Directory entry", fields(rows), gaps(r, "type"), gaps(r, "relatedOrganisation")),
        card("Appears in", unique.length
            ? h("ul.links-list", unique.map((x) => h("li", h("span.rel", fmtDate(recDate(x))), recLink(x))))
            : h("p.muted", "Not referenced by any case record.")));
}

// ------------------------------------------------------------------ dispatch

const RENDERERS = {
    referral, request, qoc, response, episode, "life-event": lifeEvent,
    assessment, plan: carePlan, organisation: directory, service: directory, professional: directory,
};

export function renderRecord(r) {
    const fn = RENDERERS[r.kind];
    return fn ? fn(r) : h("p", `No screen for ${r.kind}`);
}
